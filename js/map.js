/**
 * map.js — Gestion de la carte Leaflet (initialisation, marqueurs, cercle, géolocalisation)
 */

import { CATEGORIES, MARKER_COLORS, escapeHtml, truncate, getGoogleMapsLink, getGoogleDirectionsLink, getGoogleSearchLink, getOSMLink, extractCity } from './utils.js';

// ── État interne du module ──────────────────────────────────────────────────

let map          = null;  // Instance Leaflet
let markersLayer = null;  // LayerGroup pour les marqueurs commerces
let radiusCircle = null;  // Cercle de recherche
let searchMarker = null;  // Marqueur de l'adresse recherchée

// ── Initialisation ──────────────────────────────────────────────────────────

/**
 * Initialise la carte Leaflet dans le conteneur spécifié
 * @param {string} containerId — ID du conteneur HTML
 * @returns {L.Map} — Instance Leaflet
 */
export function initMap(containerId) {

  map = L.map(containerId, {
    center: [46.603354, 1.888334], // Centre de la France
    zoom: 6,
    zoomControl: true,
    attributionControl: true
  });

  // Tuiles OpenStreetMap (gratuites)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  // LayerGroup pour les marqueurs commerces
  markersLayer = L.layerGroup().addTo(map);

  return map;
}

/**
 * Retourne l'instance Leaflet (pour accès externe si nécessaire)
 */
export function getMap() {
  return map;
}

// ── Centrage et zoom ────────────────────────────────────────────────────────

/**
 * Centre la carte sur des coordonnées avec un niveau de zoom
 */
export function centerOn(lat, lon, zoom = 15) {
  if (!map) return;
  map.setView([lat, lon], zoom);
}

/**
 * Ajuste la vue pour englober tous les marqueurs affichés
 */
export function fitToMarkers() {
  if (!map || !markersLayer) return;
  const bounds = markersLayer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.1));
  }
}

// ── Marqueur d'adresse recherchée ───────────────────────────────────────────

/**
 * Affiche ou déplace le marqueur de l'adresse recherchée (icône bleue)
 */
export function setSearchMarker(lat, lon, label) {
  if (searchMarker) {
    map.removeLayer(searchMarker);
  }

  const icon = L.divIcon({
    className: 'search-marker-icon',
    html: `<div class="search-marker-pin">📍</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });

  searchMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
    .addTo(map)
    .bindPopup(`<strong>Adresse recherchée</strong><br>${escapeHtml(label)}`)
    .openPopup();
}

// ── Cercle de rayon ─────────────────────────────────────────────────────────

/**
 * Dessine le cercle de rayon de recherche
 */
export function setRadiusCircle(lat, lon, radiusMeters) {
  if (radiusCircle) {
    map.removeLayer(radiusCircle);
  }

  radiusCircle = L.circle([lat, lon], {
    radius: radiusMeters,
    color: '#3498db',
    weight: 2,
    fillColor: '#3498db',
    fillOpacity: 0.08,
    dashArray: '8 4'
  }).addTo(map);
}

// ── Marqueurs de commerces ──────────────────────────────────────────────────

/**
 * Crée une icône SVG personnalisée pour un commerce
 */
function createCommerceIcon(commerce) {
  const cat = CATEGORIES[commerce.category] || CATEGORIES.other;
  const borderColor = commerce.hasWebsite
    ? MARKER_COLORS.has_website
    : (commerce.websiteCheckDone ? MARKER_COLORS.no_website : MARKER_COLORS.unknown);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26C32 7.16 24.84 0 16 0z"
            fill="${borderColor}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="16" cy="15" r="10" fill="#fff"/>
      <text x="16" y="20" text-anchor="middle" font-size="14">${cat.icon}</text>
    </svg>`;

  return L.divIcon({
    className: 'commerce-marker-icon',
    html: svg,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42]
  });
}

/**
 * Génère le contenu HTML du popup pour un commerce
 */
function createPopupContent(commerce) {
  const cat = CATEGORIES[commerce.category] || CATEGORIES.other;
  const statusClass = commerce.hasWebsite ? 'status-has-site' : 'status-no-site';
  const statusText  = commerce.hasWebsite
    ? '✅ A un site web'
    : (commerce.websiteCheckDone ? '🔴 Pas de site web détecté' : '⏳ Non vérifié');

  const city = extractCity(commerce.address);

  let html = `
    <div class="popup-commerce">
      <div class="popup-header">
        <span class="popup-icon">${cat.icon}</span>
        <strong class="popup-name">${escapeHtml(commerce.name)}</strong>
      </div>
      <div class="popup-category">${escapeHtml(cat.label)}</div>
      <div class="popup-status ${statusClass}">${statusText}</div>
      <table class="popup-details">`;

  if (commerce.address !== 'Adresse non renseignée') {
    html += `<tr><td>📍</td><td>${escapeHtml(commerce.address)}</td></tr>`;
  }
  if (commerce.phone) {
    html += `<tr><td>📞</td><td><a href="tel:${escapeHtml(commerce.phone)}">${escapeHtml(commerce.phone)}</a></td></tr>`;
  }
  if (commerce.email) {
    html += `<tr><td>📧</td><td><a href="mailto:${escapeHtml(commerce.email)}">${escapeHtml(commerce.email)}</a></td></tr>`;
  }
  if (commerce.openingHours) {
    html += `<tr><td>🕐</td><td class="popup-hours">${escapeHtml(commerce.openingHours)}</td></tr>`;
  }
  if (commerce.note) {
    html += `<tr><td>📝</td><td>${escapeHtml(truncate(commerce.note, 100))}</td></tr>`;
  }
  if (commerce.website) {
    html += `<tr><td>🌐</td><td><a href="${escapeHtml(commerce.website)}" target="_blank" rel="noopener">${escapeHtml(truncate(commerce.website, 50))}</a></td></tr>`;
  }

  html += `</table>`;

  // ── Liens externes ──
  const mapsLink = getGoogleMapsLink(commerce.lat, commerce.lon, commerce.name);
  const dirLink = getGoogleDirectionsLink(commerce.lat, commerce.lon);
  const osmLink = getOSMLink(commerce.osmId);
  const searchLink = getGoogleSearchLink(commerce.name, city);

  html += `<div class="popup-links">`;
  html += `<a href="${mapsLink}" target="_blank" rel="noopener" class="popup-link" title="Voir sur Google Maps">🗺️ Google Maps</a>`;
  html += `<a href="${dirLink}" target="_blank" rel="noopener" class="popup-link" title="Itinéraire">🧭 Itinéraire</a>`;
  html += `<a href="${osmLink}" target="_blank" rel="noopener" class="popup-link" title="Voir sur OpenStreetMap">🌍 OSM</a>`;
  if (!commerce.hasWebsite) {
    html += `<a href="${searchLink}" target="_blank" rel="noopener" class="popup-link popup-link-search" title="Rechercher un site web">🔍 Chercher site</a>`;
  }
  html += `</div>`;

  // ── Bouton copier ──
  html += `
      <button class="popup-copy-btn" data-commerce-id="${commerce.id}">
        📋 Copier les infos
      </button>
    </div>`;

  return html;
}

/**
 * Affiche les commerces sur la carte
 * @param {Array} commerces — Liste normalisée des commerces
 */
export function displayCommerces(commerces) {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  commerces.forEach((commerce) => {
    const icon = createCommerceIcon(commerce);
    const marker = L.marker([commerce.lat, commerce.lon], { icon });

    marker.bindPopup(createPopupContent(commerce), {
      maxWidth: 320,
      minWidth: 260,
      className: 'commerce-popup'
    });

    // Stocke les données sur le marqueur pour le filtre
    marker.commerceData = commerce;

    markersLayer.addLayer(marker);
  });
}

/**
 * Filtre l'affichage des marqueurs par catégories actives
 * @param {string[]} activeCategories — Clés des catégories à afficher
 */
export function filterMarkers(activeCategories) {
  if (!markersLayer) return;

  markersLayer.eachLayer((marker) => {
    if (!marker.commerceData) return;
    const show = activeCategories.includes(marker.commerceData.category);
    if (show && !markersLayer.hasLayer(marker)) {
      markersLayer.addLayer(marker);
    } else if (!show && markersLayer.hasLayer(marker)) {
      markersLayer.removeLayer(marker);
    }
  });
}

/**
 * Rafraîchit l'icône d'un marqueur (après vérification du site web)
 */
export function refreshMarkerIcon(commerceId) {
  if (!markersLayer) return;

  markersLayer.eachLayer((marker) => {
    if (marker.commerceData && marker.commerceData.id === commerceId) {
      marker.setIcon(createCommerceIcon(marker.commerceData));
      marker.setPopupContent(createPopupContent(marker.commerceData));
    }
  });
}

/**
 * Supprime tous les marqueurs et le cercle
 */
export function clearAll() {
  if (markersLayer) markersLayer.clearLayers();
  if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
}

/**
 * Nombre de marqueurs actuellement affichés
 */
export function getVisibleMarkerCount() {
  if (!markersLayer) return 0;
  let count = 0;
  markersLayer.eachLayer(() => count++);
  return count;
}

/**
 * Centre la carte sur un commerce et ouvre son popup
 * @param {object} commerce — Objet commerce normalisé
 */
export function locateAndOpenCommerce(commerce) {
  if (!map || !markersLayer) return;

  // Centrer la carte sur le commerce
  map.setView([commerce.lat, commerce.lon], 18, { animate: true });

  // Trouver le marqueur correspondant et ouvrir son popup
  markersLayer.eachLayer((marker) => {
    if (marker.commerceData && marker.commerceData.id === commerce.id) {
      // Petit délai pour laisser le zoom s'effectuer
      setTimeout(() => {
        marker.openPopup();
      }, 300);
    }
  });
}
