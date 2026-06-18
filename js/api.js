/**
 * api.js — Communication avec les APIs via le proxy PHP (plus de CORS)
 *
 * Toutes les requêtes passent par api/api.php :
 *   - service=nominatim → géocodage + recherche de sites web
 *   - service=overpass  → recherche de commerces
 *   - service=check     → vérification HTTP d'une URL
 */

import { sleep, CATEGORIES, haversineDistance } from './utils.js';

const API_BASE = 'api/api.php';

// ── Cache mémoire simple ────────────────────────────────────────────────────

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheGet(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  _cache.delete(key);
  return null;
}

function cacheSet(key, data) {
  if (_cache.size > 200) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
  _cache.set(key, { data, ts: Date.now() });
}

// ── Requête générique via le proxy ──────────────────────────────────────────

async function apiFetch(params) {
  const url = `${API_BASE}?${new URLSearchParams(params)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Erreur API : ${response.status}`);
  }

  return response.json();
}

// ── Géocodage via Photon (Komoot) — direct, pas de proxy nécessaire ─────────
// Photon utilise les mêmes données OSM que Nominatim mais est plus rapide
// et n'a pas de rate limit aussi strict. Supporte le CORS.

const PHOTON_BASE = 'https://photon.komoot.io/api';

export async function geocodeAddress(query) {
  const cacheKey = `geocode:${query.toLowerCase().trim()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    q: query,
    limit: '5',
    lang: 'fr'
  });

  const response = await fetch(`${PHOTON_BASE}?${params}`);

  if (!response.ok) {
    // Fallback vers le proxy PHP (Nominatim) si Photon échoue
    try {
      const data = await apiFetch({
        service: 'nominatim',
        q: query,
        format: 'json',
        limit: '5',
        addressdetails: '1',
        countrycodes: 'fr'
      });

      if (data && data.length > 0) {
        const results = data.map((item) => ({
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          displayName: item.display_name
        }));
        cacheSet(cacheKey, results);
        return results;
      }
    } catch {
      // Les deux ont échoué
    }
    throw new Error('Aucune adresse trouvée. Vérifiez votre saisie.');
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    throw new Error('Aucune adresse trouvée. Vérifiez votre saisie.');
  }

  const results = data.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties;
    // Construire un display_name lisible à partir des propriétés Photon
    const parts = [];
    if (p.name) parts.push(p.name);
    if (p.street) {
      parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
    }
    if (p.postcode || p.city) {
      parts.push([p.postcode, p.city].filter(Boolean).join(' '));
    }
    if (p.country) parts.push(p.country);
    return {
      lat,
      lon,
      displayName: parts.length > 0 ? parts.join(', ') : `${lat}, ${lon}`
    };
  });

  cacheSet(cacheKey, results);
  return results;
}

// ── Recherche de commerces via Overpass (proxy PHP) ─────────────────────────

function buildOverpassQuery(lat, lon, radius, activeCategories) {
  const filters = [];

  for (const catKey of activeCategories) {
    const cat = CATEGORIES[catKey];
    if (!cat || !cat.overpassKey) continue;
    const [tagKey, tagValue] = cat.overpassKey.split('=');
    filters.push(`node["${tagKey}"="${tagValue}"](around:${radius},${lat},${lon});`);
    filters.push(`way["${tagKey}"="${tagValue}"](around:${radius},${lat},${lon});`);
  }

  if (activeCategories.includes('other')) {
    const specificShops = Object.values(CATEGORIES)
      .filter(c => c.overpassKey?.startsWith('shop='))
      .map(c => c.overpassKey.split('=')[1]);
    filters.push(`node["shop"!~"${specificShops.join('|')}"]["shop"](around:${radius},${lat},${lon});`);
    filters.push(`way["shop"!~"${specificShops.join('|')}"]["shop"](around:${radius},${lat},${lon});`);
  }

  if (filters.length === 0) {
    filters.push(`node["amenity"="restaurant"](around:${radius},${lat},${lon});`);
  }

  return `[out:json][timeout:30];(${filters.join('')});out center body;`;
}

export async function queryOverpass(lat, lon, radius, activeCategories) {
  const cacheKey = `overpass:${lat.toFixed(4)}:${lon.toFixed(4)}:${radius}:${activeCategories.sort().join(',')}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query = buildOverpassQuery(lat, lon, radius, activeCategories);

  // Overpass utilise POST, on passe par le proxy
  const response = await fetch(`${API_BASE}?service=overpass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Erreur Overpass : ${response.status}`);
  }

  const data = await response.json();

  if (!data.elements) {
    throw new Error('Réponse Overpass invalide.');
  }

  cacheSet(cacheKey, data.elements);
  return data.elements;
}

// ── Vérification HTTP via proxy PHP ─────────────────────────────────────────

export async function checkWebsiteReachable(url) {
  try {
    const data = await apiFetch({ service: 'check', url });
    return { reachable: data.reachable === true, status: data.status || null };
  } catch {
    return { reachable: false, status: null };
  }
}

// ── Détection de site web via Photon + Nominatim (proxy) ────────────────────

/**
 * Cherche un site web pour un commerce.
 * 1. Essaie Photon (rapide, pas de rate limit) pour trouver l'élément OSM
 * 2. Si trouvé, utilise le reverse Nominatim (proxy PHP) pour récupérer les extratags
 */
export async function lookupBusinessWebsite(commerce) {
  const cacheKey = `website:${commerce.name.toLowerCase()}:${commerce.lat.toFixed(3)}:${commerce.lon.toFixed(3)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const defaultResult = { found: false, website: null, phone: null, email: null };

  try {
    const cat = CATEGORIES[commerce.category];
    const searchQuery = cat ? `${commerce.name} ${cat.label}` : commerce.name;

    // Étape 1 : chercher via Photon (rapide)
    const photonParams = new URLSearchParams({
      q: searchQuery,
      limit: '5',
      lang: 'fr',
      lat: commerce.lat.toString(),
      lon: commerce.lon.toString(),
    });

    const photonResp = await fetch(`${PHOTON_BASE}?${photonParams}`);
    if (!photonResp.ok) {
      cacheSet(cacheKey, defaultResult);
      return defaultResult;
    }

    const photonData = await photonResp.json();
    if (!photonData.features || photonData.features.length === 0) {
      cacheSet(cacheKey, defaultResult);
      return defaultResult;
    }

    // Trouver le résultat le plus proche
    let bestMatch = null;
    let bestDist = Infinity;

    for (const f of photonData.features) {
      const [lon, lat] = f.geometry.coordinates;
      const dist = haversineDistance(commerce.lat, commerce.lon, lat, lon);
      if (dist < 200 && dist < bestDist) {
        bestDist = dist;
        bestMatch = f;
      }
    }

    if (!bestMatch) {
      cacheSet(cacheKey, defaultResult);
      return defaultResult;
    }

    // Étape 2 : récupérer les extratags via Nominatim reverse (proxy PHP)
    const osmType = bestMatch.properties.osm_type; // N, W, R
    const osmId = bestMatch.properties.osm_id;

    if (osmType && osmId) {
      try {
        const nominatimData = await apiFetch({
          service: 'nominatim',
          osm_type: osmType,
          osm_id: osmId.toString(),
          format: 'json',
          extratags: '1',
        });

        if (nominatimData) {
          const ext = nominatimData.extratags || {};
          const result = {
            found: !!(ext.website || ext['contact:website'] || ext.phone || ext.email),
            website: ext.website || ext['contact:website'] || ext.url || null,
            phone: ext.phone || ext['contact:phone'] || ext.mobile || null,
            email: ext.email || ext['contact:email'] || null,
          };
          cacheSet(cacheKey, result);
          return result;
        }
      } catch {
        // Le reverse lookup a échoué, on continue avec les données Photon
      }
    }

    cacheSet(cacheKey, defaultResult);
    return defaultResult;

  } catch {
    cacheSet(cacheKey, defaultResult);
    return defaultResult;
  }
}
