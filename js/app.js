/**
 * app.js — Point d'entrée principal. Orchestre les modules carte, API et UI.
 *
 * Flux en 2 phases :
 *   Phase 1 — Recherche rapide : géocodage + Overpass → affiche tous les commerces immédiatement
 *   Phase 2 — Vérification progressive : Nominatim + proxy HTTP → met à jour au fil de l'eau
 */

import { CATEGORIES, formatAddress, formatOpeningHours, hasWebsiteInTags, categorizeElement, formatForClipboard, commerceId, isInRadius, getGoogleSearchLink, extractCity } from './utils.js';
import { geocodeAddress, queryOverpass, lookupBusinessWebsite, checkWebsiteReachable } from './api.js';
import { initMap, centerOn, setSearchMarker, setRadiusCircle, displayCommerces, filterMarkers, refreshMarkerIcon, clearAll, fitToMarkers, locateAndOpenCommerce } from './map.js';
import { initCategoryFilters, initRadiusSelector, getActiveCategories, getSelectedRadius, updateCounter, updateVisibleCount, showStatus, setLoading, showSuggestions, hideSuggestions, showVerificationProgress, hideVerificationProgress, renderCommerceList, updateCommerceCard, initSidebarToggle, copyToClipboard, showVerifyButton, hideVerifyButton, setVerifyButtonState } from './ui.js';

// ── État global ─────────────────────────────────────────────────────────────

const state = {
  currentLat: null,
  currentLon: null,
  currentAddress: '',
  currentCity: '',         // Ville de la recherche (pour le prompt)
  commerces: [],           // Tous les commerces trouvés (normalisés)
  commerceMap: new Map(),  // id → commerce (pour accès rapide)
  isLoading: false,
  isVerifying: false,      // Vérification en cours
  hasSearched: false,
  verifyAbort: null        // AbortController pour annuler la vérification
};

// Constantes
const DEFAULT_CATEGORIES = Object.keys(CATEGORIES).filter(k => k !== 'other');
const DEFAULT_RADIUS = 1000;
const NOMINATIM_DELAY = 1100; // 1.1s entre chaque requête Nominatim (limite: 1/s)

// ── Point d'entrée ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initMap('map');
  initCategoryFilters(DEFAULT_CATEGORIES);
  initRadiusSelector(DEFAULT_RADIUS);
  initSidebarToggle();
  bindEvents();
  showStatus('Bienvenue ! Entrez une adresse pour commencer la recherche.', 'info', 8000);
});

// ── Liaison des événements ──────────────────────────────────────────────────

function bindEvents() {
  const searchInput  = $('#search-input');
  const searchForm   = $('#search-form');
  const clearBtn     = $('#clear-btn');
  const radiusSelect = $('#radius-select');

  // Soumission du formulaire
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSearch();
  });

  // Suggestions au clavier (debounce 500ms)
  let suggestTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const query = searchInput.value.trim();
    if (query.length < 3) { hideSuggestions(); return; }
    suggestTimer = setTimeout(() => handleSuggestions(query), 500);
  });

  // Fermer les suggestions au clic extérieur
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-form') && !e.target.closest('#suggestions')) {
      hideSuggestions();
    }
  });

  // Filtres catégories — mise à jour en temps réel
  $('#category-filters').addEventListener('change', () => {
    const active = getActiveCategories();
    filterMarkers(active);
    updateVisibleFromState(active);
  });

  // Changement de rayon — relancer la recherche
  radiusSelect.addEventListener('change', () => {
    if (state.currentLat && state.currentLon) handleSearch();
  });

  // Bouton effacer
  clearBtn.addEventListener('click', handleClear);

  // Copier tout
  $('#copy-all-btn').addEventListener('click', handleCopyAll);
}

// ── Helpers DOM ─────────────────────────────────────────────────────────────

function $(sel) { return document.querySelector(sel); }

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — Recherche rapide (géocodage + Overpass, affichage immédiat)
// ═══════════════════════════════════════════════════════════════════════════

async function handleSearch() {
  const query = $('#search-input').value.trim();
  if (!query) { showStatus('Veuillez saisir une adresse.', 'error', 3000); return; }
  if (state.isLoading) return;

  // Annuler une vérification en cours
  if (state.isVerifying && state.verifyAbort) {
    state.verifyAbort.abort();
    state.isVerifying = false;
  }

  // Reset complet avant nouvelle recherche
  clearAll();
  resetState();
  hideVerificationProgress();

  state.isLoading = true;
  setLoading(true);
  hideSuggestions();
  hideVerifyButton();

  try {
    // 1. Géocodage
    showStatus('Recherche de l\'adresse…', 'loading', 0);
    const geoResults = await geocodeAddress(query);
    const best = geoResults[0];

    state.currentLat = best.lat;
    state.currentLon = best.lon;
    state.currentAddress = best.displayName;
    state.currentCity = extractCity(best.displayName) || '';

    // 2. Centrage carte + marqueur
    const radius = getSelectedRadius();
    centerOn(best.lat, best.lon, getZoomForRadius(radius));
    setSearchMarker(best.lat, best.lon, best.displayName);
    setRadiusCircle(best.lat, best.lon, radius);

    // 3. Recherche Overpass
    showStatus('Recherche des commerces à proximité…', 'loading', 0);
    const activeCategories = getActiveCategories();
    const elements = await queryOverpass(best.lat, best.lon, radius, activeCategories);

    if (elements.length === 0) {
      showStatus('Aucun commerce trouvé dans ce rayon. Essayez d\'augmenter la distance.', 'info', 5000);
      resetState();
      updateCounter(0, 0, true);
      return;
    }

    // 4. Normalisation (SANS vérification site web)
    const commerces = normalizeElements(elements, best.lat, best.lon, radius);

    // 5. Mise à jour état + affichage immédiat
    state.commerces = commerces;
    state.commerceMap.clear();
    commerces.forEach(c => state.commerceMap.set(c.id, c));
    state.hasSearched = true;

    displayCommerces(commerces);
    fitToMarkers();

    const withoutSite = commerces.filter(c => !c.hasWebsite);
    updateCounter(commerces.length, withoutSite.length, true);
    updateVisibleCount(commerces.length);
    renderCommerceList(withoutSite, locateAndOpenCommerce, (c) => formatForClipboard(c, state.currentCity));

    // 6. Afficher le bouton "Vérifier les sites"
    if (withoutSite.length > 0) {
      showVerifyButton(withoutSite.length);
      showStatus(
        `${commerces.length} commerces trouvés. ${withoutSite.length} sans site web tagué — cliquez sur "Vérifier" pour approfondir.`,
        'success',
        8000
      );
    } else {
      showStatus(`${commerces.length} commerces trouvés, tous ont un site web.`, 'success', 5000);
    }

  } catch (err) {
    console.error('Erreur de recherche :', err);
    showStatus(err.message || 'Une erreur est survenue.', 'error', 8000);
  } finally {
    state.isLoading = false;
    setLoading(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — Vérification progressive (Nominatim + proxy, au fil de l'eau)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lance la vérification progressive des sites web.
 * Chaque commerce est vérifié un par un, et le résultat est appliqué immédiatement.
 */
window.startVerification = async function () {
  if (state.isVerifying) return;

  const toVerify = state.commerces.filter(c => !c.hasWebsite && !c.websiteCheckDone);
  if (toVerify.length === 0) {
    showStatus('Tous les commerces ont déjà été vérifiés.', 'info', 3000);
    return;
  }

  state.isVerifying = true;
  state.verifyAbort = new AbortController();
  setVerifyButtonState('running', 0, toVerify.length);
  showVerificationProgress(0, toVerify.length);

  let verified = 0;
  let foundWebsite = 0;

  for (const commerce of toVerify) {
    // Vérifier si on a été annulé
    if (state.verifyAbort.signal.aborted) break;

    try {
      // Niveau 3 : recherche Nominatim par nom
      const result = await lookupBusinessWebsite(commerce);

      if (result.website) {
        commerce.hasWebsite = true;
        commerce.website = result.website;
        foundWebsite++;
      }
      if (!commerce.phone && result.phone) commerce.phone = result.phone;
      if (!commerce.email && result.email) commerce.email = result.email;

      // Niveau 2 : si le commerce a un tag URL dans OSM, vérifier HTTP
      if (!commerce.hasWebsite && commerce.osmWebsite) {
        const httpResult = await checkWebsiteReachable(commerce.osmWebsite);
        if (httpResult.reachable) {
          commerce.hasWebsite = true;
          commerce.website = commerce.osmWebsite;
          foundWebsite++;
        }
      }

    } catch {
      // Silencieux — on continue avec le commerce suivant
    }

    // Marquer comme vérifié
    commerce.websiteCheckDone = true;
    verified++;

    // ── Mise à jour progressive ──
    // Mettre à jour le marqueur sur la carte
    refreshMarkerIcon(commerce.id);

    // Mettre à jour la carte dans la sidebar
    updateCommerceCard(commerce);

    // Mettre à jour le compteur
    const withoutSite = state.commerces.filter(c => !c.hasWebsite);
    updateCounter(state.commerces.length, withoutSite.length, true);

    // Barre de progression
    showVerificationProgress(verified, toVerify.length);
    setVerifyButtonState('running', verified, toVerify.length);

    // Respecter le rate limit Nominatim (1 req/s)
    if (verified < toVerify.length) {
      await new Promise(r => setTimeout(r, NOMINATIM_DELAY));
    }
  }

  // Terminé
  state.isVerifying = false;
  hideVerificationProgress();

  const withoutSite = state.commerces.filter(c => !c.hasWebsite);
  renderCommerceList(withoutSite, locateAndOpenCommerce, (c) => formatForClipboard(c, state.currentCity));

  if (state.verifyAbort.signal.aborted) {
    showStatus(`Vérification annulée. ${verified}/${toVerify.length} vérifiés, ${foundWebsite} site(s) trouvé(s).`, 'info', 5000);
  } else {
    showStatus(
      `Vérification terminée ! ${foundWebsite} site(s) web trouvé(s) parmi ${toVerify.length} commerces.`,
      'success',
      6000
    );
  }

  hideVerifyButton();
};

// ── Annulation de la vérification ───────────────────────────────────────────

window.cancelVerification = function () {
  if (state.verifyAbort) {
    state.verifyAbort.abort();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Autres handlers
// ═══════════════════════════════════════════════════════════════════════════

function handleClear() {
  if (state.isVerifying && state.verifyAbort) {
    state.verifyAbort.abort();
    state.isVerifying = false;
  }
  clearAll();
  resetState();
  updateCounter(0, 0, false);
  updateVisibleCount(0);
  renderCommerceList([], locateAndOpenCommerce, (c) => formatForClipboard(c, state.currentCity));
  hideVerifyButton();
  hideVerificationProgress();
  showStatus('Carte effacée.', 'info', 2000);
}

function handleCopyAll() {
  const withoutSite = state.commerces.filter(c => !c.hasWebsite);
  if (withoutSite.length === 0) {
    showStatus('Aucun commerce sans site à copier.', 'info', 2000);
    return;
  }
  const text = withoutSite.map(c => formatForClipboard(c, state.currentCity)).join('\n\n---\n\n');
  copyToClipboard(text);
  showStatus(`${withoutSite.length} commerces copiés dans le presse-papier !`, 'success', 3000);
}

async function handleSuggestions(query) {
  try {
    const results = await geocodeAddress(query);
    showSuggestions(results, (selected) => {
      $('#search-input').value = selected.displayName;
      hideSuggestions();
      handleSearch();
    });
  } catch {
    hideSuggestions();
  }
}

function resetState() {
  state.commerces = [];
  state.commerceMap.clear();
  state.hasSearched = false;
  state.isVerifying = false;
  state.verifyAbort = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Normalisation des éléments OSM
// ═══════════════════════════════════════════════════════════════════════════

function normalizeElements(elements, centerLat, centerLon, radius) {
  const commerces = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const category = categorizeElement(tags);
    if (!category) continue;

    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;
    if (!lat || !lon) continue;
    if (!isInRadius(centerLat, centerLon, lat, lon, radius * 1.05)) continue;

    const websiteCheck = hasWebsiteInTags(tags);

    commerces.push({
      id: commerceId(el),
      osmId: `${el.type}/${el.id}`,
      name: tags.name || tags['name:fr'] || tags.brand || 'Commerce sans nom',
      category,
      lat,
      lon,
      address: formatAddress(tags),
      phone: tags.phone || tags['contact:phone'] || tags.mobile || tags['contact:mobile'] || null,
      email: tags.email || tags['contact:email'] || null,
      openingHours: formatOpeningHours(tags.openingHours),
      note: tags.note || tags.description || tags['description:fr'] || null,
      website: websiteCheck.hasSite ? websiteCheck.url : null,
      hasWebsite: websiteCheck.hasSite,
      osmWebsite: tags.website || tags['contact:website'] || tags.url || null,
      websiteCheckDone: false // Tous partent en "non vérifié"
    });
  }

  commerces.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return commerces;
}

// ═══════════════════════════════════════════════════════════════════════════
// Délégation d'événements
// ═══════════════════════════════════════════════════════════════════════════

// Boutons "Copier" dans les popups Leaflet
document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.popup-copy-btn');
  if (!copyBtn) return;

  const commerceIdStr = copyBtn.dataset.commerceId;
  const commerce = state.commerceMap.get(commerceIdStr);
  if (!commerce) return;

  copyToClipboard(formatForClipboard(commerce, state.currentCity));
  copyBtn.textContent = '✅ Copié !';
  setTimeout(() => { copyBtn.textContent = '📋 Copier les infos'; }, 2000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Utilitaires
// ═══════════════════════════════════════════════════════════════════════════

function getZoomForRadius(radiusMeters) {
  if (radiusMeters <= 300) return 17;
  if (radiusMeters <= 500) return 16;
  if (radiusMeters <= 1000) return 15;
  if (radiusMeters <= 2000) return 14;
  if (radiusMeters <= 3000) return 13;
  return 12;
}

function updateVisibleFromState(activeCategories) {
  const visible = state.commerces.filter(c => activeCategories.includes(c.category));
  updateVisibleCount(visible.length);
}
