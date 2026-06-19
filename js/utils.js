/**
 * utils.js — Fonctions utilitaires pures (aucune dépendance DOM ou API)
 */

// ── Catégories de commerces avec couleurs et icônes ──────────────────────────

export const CATEGORIES = {
  restaurant:  { label: 'Restaurant',       color: '#e74c3c', icon: '🍽️',  overpassKey: 'amenity=restaurant' },
  fast_food:   { label: 'Fast-food',        color: '#e67e22', icon: '🍔',  overpassKey: 'amenity=fast_food' },
  cafe:        { label: 'Café / Bar',       color: '#8e44ad', icon: '☕',  overpassKey: 'amenity=cafe' },
  bar:         { label: 'Bar',              color: '#9b59b6', icon: '🍺',  overpassKey: 'amenity=bar' },
  bakery:      { label: 'Boulangerie',      color: '#f39c12', icon: '🥐',  overpassKey: 'shop=bakery' },
  supermarket: { label: 'Supermarché',      color: '#27ae60', icon: '🛒',  overpassKey: 'shop=supermarket' },
  convenience: { label: 'Supérette',        color: '#2ecc71', icon: '🏪',  overpassKey: 'shop=convenience' },
  clothes:     { label: 'Vêtements',        color: '#e91e63', icon: '👕',  overpassKey: 'shop=clothes' },
  hairdresser: { label: 'Coiffeur',         color: '#ff9800', icon: '✂️',  overpassKey: 'shop=hairdresser' },
  beauty:      { label: 'Beauté / Spa',     color: '#f06292', icon: '💅',  overpassKey: 'shop=beauty' },
  pharmacy:    { label: 'Pharmacie',        color: '#4caf50', icon: '💊',  overpassKey: 'amenity=pharmacy' },
  doctor:      { label: 'Médecin',          color: '#00bcd4', icon: '🩺',  overpassKey: 'amenity=doctor' },
  dentist:     { label: 'Dentiste',         color: '#009688', icon: '🦷',  overpassKey: 'amenity=dentist' },
  lawyer:      { label: 'Avocat',           color: '#3f51b5', icon: '⚖️',  overpassKey: 'office=lawyer' },
  bank:        { label: 'Banque',           color: '#607d8b', icon: '🏦',  overpassKey: 'amenity=bank' },
  laundry:     { label: 'Pressing',         color: '#795548', icon: '👔',  overpassKey: 'shop=laundry' },
  electronics: { label: 'Électronique',     color: '#2196f3', icon: '📱',  overpassKey: 'shop=electronics' },
  furniture:   { label: 'Meubles',          color: '#795548', icon: '🪑',  overpassKey: 'shop=furniture' },
  florist:     { label: 'Fleuriste',        color: '#e91e63', icon: '🌸',  overpassKey: 'shop=florist' },
  car_repair:  { label: 'Garage auto',      color: '#455a64', icon: '🔧',  overpassKey: 'shop=car_repair' },
  other:       { label: 'Autre commerce',   color: '#9e9e9e', icon: '📍',  overpassKey: null }
};

// ── Couleurs des marqueurs par statut site web ──────────────────────────────

export const MARKER_COLORS = {
  no_website:  '#e74c3c',   // Rouge — pas de site
  has_website: '#27ae60',   // Vert — a un site
  unknown:     '#f39c12'    // Orange — vérification impossible
};

// ── Rayons de recherche ─────────────────────────────────────────────────────

export const RADIUS_OPTIONS = [
  { value: 300,  label: '300 m' },
  { value: 500,  label: '500 m' },
  { value: 1000, label: '1 km' },
  { value: 1500, label: '1,5 km' },
  { value: 2000, label: '2 km' },
  { value: 3000, label: '3 km' },
  { value: 5000, label: '5 km' }
];

// ── Fonctions géographiques ─────────────────────────────────────────────────

/**
 * Calcule la distance en mètres entre deux points (formule de Haversine)
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // rayon Terre en mètres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Vérifie si un point est dans le rayon donné
 */
export function isInRadius(centerLat, centerLon, pointLat, pointLon, radiusMeters) {
  return haversineDistance(centerLat, centerLon, pointLat, pointLon) <= radiusMeters;
}

// ── Fonctions de formatage ──────────────────────────────────────────────────

/**
 * Formate une adresse OSM lisible à partir des tags
 */
export function formatAddress(tags) {
  const parts = [];
  const street = tags['addr:street'];
  const number = tags['addr:housenumber'];
  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'];
  const postcode = tags['addr:postcode'];

  if (street) {
    parts.push(number ? `${street} ${number}` : street);
  }
  if (postcode || city) {
    parts.push([postcode, city].filter(Boolean).join(' '));
  }
  return parts.length > 0 ? parts.join(', ') : 'Adresse non renseignée';
}

/**
 * Formate les horaires OSM (opening_hours) en texte lisible
 */
export function formatOpeningHours(raw) {
  if (!raw) return null;
  // Nettoyage basique — les horaires OSM sont complexes, on affiche tels quels
  return raw.replace(/;/g, '\n').trim();
}

/**
 * Détermine la catégorie d'un élément OSM
 */
export function categorizeElement(tags) {
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (key === 'other') continue;
    const [tagKey, tagValue] = cat.overpassKey.split('=');
    if (tags[tagKey] === tagValue) return key;
  }
  // Fallback : si c'est un shop ou amenity non listé
  if (tags.shop) return 'other';
  if (tags.amenity && !['parking', 'bench', 'waste_basket', 'toilets', 'telephone',
    'drinking_water', 'fountain', 'post_box', 'atm', 'bicycle_parking'].includes(tags.amenity)) {
    return 'other';
  }
  return null; // pas un commerce
}

/**
 * Vérifie si un commerce a un site web dans ses tags OSM
 */
export function hasWebsiteInTags(tags) {
  const website = tags.website || tags['contact:website'] || tags.url;
  if (!website) return { hasSite: false, url: null };

  const url = website.trim();
  if (url === '' || url === 'none' || url === 'no' || url === '-') {
    return { hasSite: false, url: null };
  }
  return { hasSite: true, url };
}

/**
 * Génère un prompt IA optimisé pour la copie presse-papier.
 * Le prompt demande à l'IA de rechercher le commerce puis de produire
 * un prompt builder complet prêt à être collé dans une IA de création de site.
 * @param {object} commerce — Données du commerce
 * @param {string} [searchCity] — Ville de la recherche
 */
export function formatForClipboard(commerce, searchCity) {
  const cat = CATEGORIES[commerce.category] || CATEGORIES.other;
  const city = extractCity(commerce.address) || searchCity || '';
  const mapsLink = getGoogleMapsLink(commerce.lat, commerce.lon, commerce.name);
  const searchLink = getGoogleSearchLink(commerce.name, city);
  const osmLink = getOSMLink(commerce.osmId);

  const known = [];
  known.push(`- Nom : ${commerce.name}`);
  known.push(`- Type : ${cat.label}`);
  if (commerce.address !== 'Adresse non renseignée') known.push(`- Adresse : ${commerce.address}`);
  if (commerce.phone) known.push(`- Téléphone : ${commerce.phone}`);
  if (commerce.email) known.push(`- Email : ${commerce.email}`);
  if (commerce.openingHours) known.push(`- Horaires : ${commerce.openingHours}`);
  if (commerce.note) known.push(`- Note OSM : ${commerce.note}`);
  if (commerce.website) known.push(`- Site existant : ${commerce.website}`);
  known.push(`- Coordonnées GPS : ${commerce.lat}, ${commerce.lon}`);
  known.push(`- Google Maps : ${mapsLink}`);
  known.push(`- OpenStreetMap : ${osmLink}`);

  return `Tu es un expert en création de sites web pour des commerces locaux. Je te donne les infos d'un commerce SANS site web. Ton job en 2 étapes :

═══════════════════════════════════════════
COMMERCE À ANALYSER
═══════════════════════════════════════════

${known.join('\n')}

═══════════════════════════════════════════
ÉTAPE 1 — RECHERCHE (sois EXHAUSTIF)
═══════════════════════════════════════════

Cherche ABSOLUMENT TOUT sur "${commerce.name}"${city ? ` à ${city}` : ''} :
- Page Facebook, Instagram, TikTok, TripAdvisor, Google Business, Pages Jaunes, Fresha, Planity
- Photos : façade, intérieur, produits, plats, équipe, logo
- Menu complet avec tarifs (restaurant) ou liste de services avec prix
- Avis clients (extraits précis, points forts et faiblesses)
- Ambiance, style, décoration, couleurs dominantes
- Histoire du commerce, fondateur, année de création
- Concurrents directs dans la même ville
- Horaires exactes et jours d'ouverture
- Réseaux sociaux et nombre d'abonnés

Liens utiles :
- Google : ${searchLink}
- Google Maps : ${mapsLink}

═══════════════════════════════════════════
ÉTAPE 2 — GÉNÈRE LE PROMPT BUILDER CI-DESSOUS
═══════════════════════════════════════════

Une fois tes recherches terminées, produis UNIQUEMENT le texte ci-dessous (entre les marqueurs). Ce texte sera directement copié-collé dans une IA de création de site web. Il doit contenir TOUTES les infos, TOUT le contenu, TOUTES les décisions de design. L'IA qui le recevra ne doit faire AUCUNE recherche — tout est dans le prompt.

--- DÉBUT DU PROMPT BUILDER ---

Crée un site web professionnel pour le commerce suivant. Utilise un design moderne, responsive, et adapté au secteur d'activité. Le site doit être prêt à publier.

## 🏪 COMMERCE
- **Nom** : [nom complet]
- **Secteur** : [type de commerce]
- **Adresse** : [adresse complète]
- **Téléphone** : [numéro avec lien tel:]
- **Email** : [email]
- **Horaires** : [horaires détaillés jour par jour]
- **GPS** : [lat, lon]

## 🎨 DESIGN & STYLE
- **Palette de couleurs** : [3-5 couleurs HEX observées ou suggérées]
- **Style visuel** : [modèle : minimaliste / chaleureux / luxe / dynamique / traditionnel]
- **Ambiance** : [description de l'atmosphère à transmettre]
- **Positionnement** : [abordable / milieu de gamme / premium]
- **Police recommandée** : [suggestion de Google Fonts adaptée]

## 📄 STRUCTURE DU SITE
### Page d'accueil :
- **Hero** : [titre accrocheur + sous-titre + CTA principal]
- **Section services/menu** : [aperçu des 3-4 services/phares]
- **Section avis** : [3 avis clients clés]
- **Section contact** : [coordonnées + carte intégrée]

### Page Services / Menu :
[liste COMPLÈTE avec descriptions et prix si disponibles]

### Page À propos :
- **Histoire** : [paragraphe sur l'histoire du commerce]
- **Équipe** : [présentation si infos disponibles]
- **Valeurs** : [ce qui différencie ce commerce]

### Page Contact :
- Formulaire de contact
- Carte Google Maps intégrée
- Bouton d'appel direct (mobile)
- Lien vers prise de RDV si applicable

## ✍️ CONTENU RÉDIGÉ
### Slogan : [slogan accrocheur]

### Description courte (hero) :
[2-3 phrases percutantes]

### Description longue (à propos) :
[paragraphe complet, 100-150 mots]

### Descriptions services :
Pour chaque service : [nom + description de 2-3 lignes + prix si dispo]

## 📸 GALERIE
[Description des 6-10 photos à inclure avec légendes suggérées]

## ⭐ PREUVE SOCIALE
### Avis clients (à mettre en avant) :
1. "[avis 1]" — [prénom]
2. "[avis 2]" — [prénom]
3. "[avis 3]" — [prénom]

## 🔧 FONCTIONNALITÉS
- [ ] Bouton d'appel sticky sur mobile
- [ ] Carte Google Maps intégrée
- [ ] Formulaire de contact
- [ ] Prise de RDV en lien [Fresha/Planity/téléphone]
- [ ] Galerie photos avec lightbox
- [ ] Horaires d'ouverture en temps réel
- [ ] Lien vers réseaux sociaux
- [ ] SEO : meta title, meta description, balises alt

## 📱 RESPONSIVE
Le site doit être optimisé mobile-first. 70%+ des visiteurs viendront de téléphone.

--- FIN DU PROMPT BUILDER ---

IMPORTANT :
- Remplace TOUS les crochets [...] par les vraies données trouvées.
- Si une info n'est pas trouvable, écris "[À compléter avec le client : ce qu'il faut demander]".
- Le prompt builder doit être AUTONOME : l'IA qui le reçoit peut créer le site sans rien demander de plus.
- Sois précis, factuel, et exhaustif. Plus le prompt est riche, plus le site sera réussi.`;
}

/**
 * Échappe le HTML pour éviter les injections XSS
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Génération de liens externes ────────────────────────────────────────────

/**
 * Génère un lien Google Maps pour un commerce
 */
export function getGoogleMapsLink(lat, lon, name) {
  const query = encodeURIComponent(`${name} ${lat},${lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Génère un lien Google Maps directions
 */
export function getGoogleDirectionsLink(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/**
 * Génère un lien de recherche Google pour trouver le site web d'un commerce
 */
export function getGoogleSearchLink(name, city) {
  const query = city
    ? encodeURIComponent(`${name} ${city} site officiel`)
    : encodeURIComponent(`${name} site officiel`);
  return `https://www.google.com/search?q=${query}`;
}

/**
 * Génère un lien vers la page OSM de l'élément
 */
export function getOSMLink(osmId) {
  // Les IDs OSM sont au format type/id (ex: node/9653842264)
  const [type, id] = osmId.split('/');
  return `https://www.openstreetmap.org/${type}/${id}`;
}

/**
 * Génère un lien vers les avis Google Maps
 */
export function getGoogleReviewsLink(name, lat, lon) {
  const query = encodeURIComponent(`${name} ${lat},${lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=`;
}

/**
 * Extrait la ville depuis une adresse formatée
 */
export function extractCity(address) {
  if (!address || address === 'Adresse non renseignée') return null;
  // L'adresse est au format "Rue Num, Code Postal Ville"
  const parts = address.split(',');
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].trim();
    // Enlever le code postal (5 chiffres au début)
    return lastPart.replace(/^\d{5}\s*/, '').trim() || null;
  }
  return null;
}

/**
 * Génère un identifiant unique pour chaque commerce
 */
export function commerceId(element) {
  return `${element.type}/${element.id}`;
}

/**
 * Délai asynchrone (pour le rate limiting)
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tronque une chaîne à N caractères avec ellipse
 */
export function truncate(str, maxLen = 40) {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

/**
 * Debounce une fonction
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
