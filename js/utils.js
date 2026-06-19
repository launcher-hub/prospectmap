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
 * Le prompt demande à l'IA de rechercher le commerce en profondeur
 * et de produire un brief structuré pour un builder de site web.
 */
export function formatForClipboard(commerce) {
  const cat = CATEGORIES[commerce.category] || CATEGORIES.other;
  const city = extractCity(commerce.address) || 'France';
  const mapsLink = getGoogleMapsLink(commerce.lat, commerce.lon, commerce.name);
  const searchLink = getGoogleSearchLink(commerce.name, city);
  const osmLink = getOSMLink(commerce.osmId);

  // Infos connues
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

  return `Tu es un expert en création de sites web pour des commerces locaux. Je te donne les informations d'un commerce qui n'a PAS de site web (ou un site inexistant/incomplet). Ton rôle est de faire des recherches approfondies puis de produire un brief structuré.

═══════════════════════════════════════════
COMMERCE À ANALYSER
═══════════════════════════════════════════

${known.join('\n')}

═══════════════════════════════════════════
TES INSTRUCTIONS
═══════════════════════════════════════════

ÉTAPE 1 — RECHERCHE APPROFONDIE
Recherche ABSOLUMENT tout ce que tu peux trouver sur "${commerce.name}" à ${city} :
- Site web existant (même incomplet), page Facebook, Instagram, TripAdvisor, Google Business
- Photos du commerce, de l'intérieur, de l'extérieur
- Le menu complet si c'est un restaurant/café/fast-food
- Les services proposés si c'est un commerce de services
- Les avis clients (ce que les gens aiment, les points forts)
- L'ambiance, le style, le positionnement (luxe, abordable, familial, moderne, traditionnel…)
- Les couleurs dominantes du commerce (logo, façade, décoration intérieure)
- La concurrence locale (quels autres commerces similaires dans le quartier)
- Les horaires d'ouverture exactes
- Le nom du propriétaire ou gérant si trouvable

Utilise ces liens pour t'aider :
- Google : ${searchLink}
- Google Maps : ${mapsLink}

ÉTAPE 2 — BRIEF POUR CRÉATEUR DE SITE WEB
Une fois tes recherches terminées, produis un brief dans CE FORMAT EXACT :

--- DÉBUT DU BRIEF ---

## 🏪 Fiche Commerce
- **Nom** : [nom complet]
- **Type** : [catégorie]
- **Adresse** : [adresse complète]
- **Téléphone** : [numéro]
- **Email** : [email]
- **Horaires** : [horaires détaillés]
- **Site existant** : [URL ou "Aucun"]

## 🎨 Identité Visuelle
- **Couleurs dominantes** : [couleurs observées sur les photos, logo, façade]
- **Style** : [moderne / traditionnel / chic / décontracté / etc.]
- **Ambiance** : [description de l'atmosphère du lieu]
- **Positionnement** : [luxe / milieu de gamme / abordable / etc.]

## 📋 Contenu du Site
### Pages recommandées :
1. **Accueil** : [ce qu'il doit mettre en avant]
2. **Menu / Services** : [liste complète si applicable]
3. **À propos** : [histoire du commerce, valeurs]
4. **Galerie** : [description des photos à inclure]
5. **Contact** : [coordonnées, formulaire, carte]

### Textes suggérés :
- **Slogan** : [proposition de slogan accrocheur]
- **Description courte** : [1-2 phrases pour la page d'accueil]
- **Description longue** : [paragraphe "À propos"]

## 📝 Contenu Détaillé
### Menu / Services complet :
[liste complète avec prix si trouvables]

### Points forts à mettre en avant :
1. [point fort 1]
2. [point fort 2]
3. [point fort 3]

### Avis clients (extraits) :
[citations d'avis pertinents]

## 🏆 Concurrents Locaux
- [concurrent 1] — [ce qu'il fait bien]
- [concurrent 2] — [ce qu'il fait bien]

## 💡 Recommandations
- **Type de site recommandé** : [one-page / multi-pages / e-commerce]
- **Fonctionnalités clés** : [réservation en ligne / menu interactif / galerie photos / etc.]
- **Ton du contenu** : [professionnel / chaleureux / dynamique / etc.]

--- FIN DU BRIEF ---

IMPORTANT : Si tu ne trouves pas certaines informations, indique "[Non trouvé — à compléter avec le client]" plutôt que d'inventer. Sois précis et factuel.`;
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
