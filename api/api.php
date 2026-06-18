<?php
/**
 * api.php — Proxy API unifié pour Nominatim, Overpass et vérification HTTP
 *
 * Centralise toutes les requêtes externes côté serveur pour :
 *   - Éliminer les problèmes CORS
 *   - Mettre en cache les résultats (fichiers)
 *   - Gérer le rate limiting
 *   - Retourner des erreurs propres
 *
 * Usage :
 *   GET /api/api.php?service=nominatim&q=adresse&limit=5
 *   POST /api/api.php?service=overpass  (body: data=...query...)
 *   GET /api/api.php?service=check&url=https://example.com
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Configuration ───────────────────────────────────────────────────────────

const CACHE_DIR       = __DIR__ . '/cache/';
const CACHE_TTL       = 3600;      // 1 heure
const NOMINATIM_BASE  = 'https://nominatim.openstreetmap.org';
const OVERPASS_BASE   = 'https://overpass-api.de/api/interpreter';
const USER_AGENT      = 'CarteCommerce/1.0 (outil prospection locale; contact@prospectmap.local)';

// Rate limiting par IP
const RATE_LIMIT_FILE = __DIR__ . '/cache/rate_limits.json';
const RATE_WINDOW     = 60;        // fenêtre en secondes
const RATE_MAX        = 60;        // max requêtes par fenêtre

// ── Initialisation cache ────────────────────────────────────────────────────

if (!is_dir(CACHE_DIR)) {
    mkdir(CACHE_DIR, 0755, true);
}

// ── Rate limiting ───────────────────────────────────────────────────────────

function checkRateLimit(): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $now = time();

    $data = [];
    if (file_exists(RATE_LIMIT_FILE)) {
        $data = json_decode(file_get_contents(RATE_LIMIT_FILE), true) ?: [];
    }

    // Nettoyer les anciennes entrées
    foreach ($data as $k => $v) {
        if ($v['expires'] < $now) unset($data[$k]);
    }

    // Compter les requêtes de cette IP
    $count = 0;
    foreach ($data as $v) {
        if ($v['ip'] === $ip) $count++;
    }

    if ($count >= RATE_MAX) {
        http_response_code(429);
        echo json_encode(['error' => 'Trop de requêtes. Réessayez dans une minute.', 'retry_after' => RATE_WINDOW]);
        exit;
    }

    // Enregistrer cette requête
    $data[] = ['ip' => $ip, 'expires' => $now + RATE_WINDOW];
    file_put_contents(RATE_LIMIT_FILE, json_encode($data), LOCK_EX);
}

// ── Cache fichier ───────────────────────────────────────────────────────────

function cacheGet(string $key): ?array {
    $file = CACHE_DIR . md5($key) . '.json';
    if (!file_exists($file)) return null;

    $data = json_decode(file_get_contents($file), true);
    if (!$data || $data['expires'] < time()) {
        @unlink($file);
        return null;
    }
    return $data['response'];
}

function cacheSet(string $key, array $response, int $ttl = CACHE_TTL): void {
    $file = CACHE_DIR . md5($key) . '.json';
    $data = ['expires' => time() + $ttl, 'response' => $response];
    file_put_contents($file, json_encode($data), LOCK_EX);
}

// ── Requête HTTP générique ──────────────────────────────────────────────────

function httpFetch(string $url, array $options = []): array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_TIMEOUT        => $options['timeout'] ?? 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_USERAGENT      => USER_AGENT,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER     => $options['headers'] ?? [],
    ]);

    if (isset($options['post_body'])) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $options['post_body']);
    }

    if (($options['head_only'] ?? false)) {
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'HEAD');
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    return [
        'body'    => $response,
        'status'  => $httpCode,
        'error'   => $error ?: null,
        'success' => ($response !== false && $httpCode >= 200 && $httpCode < 400),
    ];
}

// ── Service : Nominatim ─────────────────────────────────────────────────────

function handleNominatim(): void {
    // Construire la requête à partir des paramètres GET
    $params = [];
    $allowed = ['q', 'format', 'limit', 'addressdetails', 'countrycodes', 'extratags', 'namedetails', 'lat', 'lon', 'osm_type', 'osm_id'];

    foreach ($allowed as $key) {
        if (isset($_GET[$key])) {
            $params[$key] = $_GET[$key];
        }
    }

    // Déterminer l'endpoint : /reverse pour lookup par OSM id, /search sinon
    if (!empty($params['osm_type']) && !empty($params['osm_id'])) {
        $endpoint = '/reverse';
    } elseif (!empty($params['q'])) {
        $endpoint = '/search';
    } elseif (!empty($params['lat'])) {
        $endpoint = '/reverse';
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Paramètre "q", "lat/lon" ou "osm_type/osm_id" requis pour Nominatim']);
        return;
    }

    $url = NOMINATIM_BASE . $endpoint . '?' . http_build_query($params);
    $cacheKey = 'nominatim:' . $url;

    // Vérifier le cache
    $cached = cacheGet($cacheKey);
    if ($cached !== null) {
        echo json_encode($cached);
        return;
    }

    // Requête
    $result = httpFetch($url);

    if (!$result['success']) {
        http_response_code($result['status'] ?: 502);
        echo json_encode(['error' => 'Erreur Nominatim: ' . ($result['error'] ?: 'HTTP ' . $result['status'])]);
        return;
    }

    $data = json_decode($result['body'], true);
    if ($data === null) {
        http_response_code(502);
        echo json_encode(['error' => 'Réponse Nominatim invalide']);
        return;
    }

    // Cache 10 minutes pour les résultats Nominatim
    cacheSet($cacheKey, $data, 600);
    echo json_encode($data);
}

// ── Service : Overpass ──────────────────────────────────────────────────────

function handleOverpass(): void {
    $query = $_POST['data'] ?? $_GET['data'] ?? '';

    if (empty($query)) {
        http_response_code(400);
        echo json_encode(['error' => 'Paramètre "data" requis (requête Overpass QL)']);
        return;
    }

    $cacheKey = 'overpass:' . $query;

    // Vérifier le cache
    $cached = cacheGet($cacheKey);
    if ($cached !== null) {
        echo json_encode($cached);
        return;
    }

    // Requête POST
    $result = httpFetch(OVERPASS_BASE, [
        'post_body' => 'data=' . urlencode($query),
        'headers'   => ['Content-Type: application/x-www-form-urlencoded'],
        'timeout'   => 30,
    ]);

    if (!$result['success']) {
        $status = $result['status'] ?: 502;
        $msg = 'Erreur Overpass';
        if ($status === 429) $msg = 'Trop de requêtes Overpass. Patientez quelques secondes.';
        if ($status === 504) $msg = 'Timeout Overpass. Réduisez le rayon de recherche.';
        http_response_code($status);
        echo json_encode(['error' => $msg]);
        return;
    }

    $data = json_decode($result['body'], true);
    if ($data === null) {
        http_response_code(502);
        echo json_encode(['error' => 'Réponse Overpass invalide']);
        return;
    }

    // Cache 5 minutes pour Overpass
    cacheSet($cacheKey, $data, 300);
    echo json_encode($data);
}

// ── Service : Vérification HTTP d'une URL ───────────────────────────────────

function handleCheck(): void {
    $url = $_GET['url'] ?? '';

    if (empty($url)) {
        http_response_code(400);
        echo json_encode(['error' => 'Paramètre "url" requis', 'reachable' => false]);
        return;
    }

    $url = trim($url);
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        http_response_code(400);
        echo json_encode(['error' => 'URL invalide', 'reachable' => false]);
        return;
    }

    // Sécurité
    $scheme = parse_url($url, PHP_URL_SCHEME);
    if (!in_array($scheme, ['http', 'https'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Protocole non autorisé', 'reachable' => false]);
        return;
    }

    $host = parse_url($url, PHP_URL_HOST);
    $blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '10.', '172.16.', '192.168.'];
    foreach ($blocked as $b) {
        if ($host === $b || str_starts_with($host, $b)) {
            http_response_code(403);
            echo json_encode(['error' => 'Domaine interne bloqué', 'reachable' => false]);
            return;
        }
    }

    $cacheKey = 'check:' . $url;
    $cached = cacheGet($cacheKey);
    if ($cached !== null) {
        echo json_encode($cached);
        return;
    }

    $result = httpFetch($url, ['head_only' => true, 'timeout' => 5]);
    $reachable = false;
    if ($result['status'] > 0) {
        $reachable = ($result['status'] >= 200 && $result['status'] < 500)
                  || $result['status'] === 403
                  || $result['status'] === 401;
    }

    $response = [
        'reachable' => $reachable,
        'status'    => $result['status'] > 0 ? $result['status'] : null,
        'url'       => $url,
    ];

    cacheSet($cacheKey, $response, 3600); // Cache 1 heure
    echo json_encode($response);
}

// ── Router ──────────────────────────────────────────────────────────────────

checkRateLimit();

$service = $_GET['service'] ?? '';

switch ($service) {
    case 'nominatim':
        handleNominatim();
        break;
    case 'overpass':
        handleOverpass();
        break;
    case 'check':
        handleCheck();
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Paramètre "service" requis. Valeurs acceptées : nominatim, overpass, check']);
        break;
}
