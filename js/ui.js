/**
 * ui.js — Gestion de l'interface utilisateur (sidebar, filtres, notifications, compteur)
 */

import { CATEGORIES, RADIUS_OPTIONS, escapeHtml, getGoogleMapsLink, getGoogleSearchLink, extractCity } from './utils.js';

// ── Éléments DOM (cache) ────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Initialisation des contrôles ────────────────────────────────────────────

/**
 * Génère les checkboxes de catégories dans le panneau filtre
 * @param {string[]} defaultActive — Catégories activées par défaut
 * @returns {string[]} — Liste des catégories actives
 */
export function initCategoryFilters(defaultActive) {
  const container = $('#category-filters');
  if (!container) return defaultActive;

  let html = '';
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const checked = defaultActive.includes(key) ? 'checked' : '';
    html += `
      <label class="filter-checkbox">
        <input type="checkbox" value="${key}" ${checked}>
        <span class="filter-dot" style="background:${cat.color}"></span>
        <span class="filter-icon">${cat.icon}</span>
        <span class="filter-label">${cat.label}</span>
      </label>`;
  }
  container.innerHTML = html;

  return getActiveCategories();
}

/**
 * Initialise le sélecteur de rayon
 */
export function initRadiusSelector(defaultRadius) {
  const select = $('#radius-select');
  if (!select) return defaultRadius;

  let html = '';
  for (const opt of RADIUS_OPTIONS) {
    const selected = opt.value === defaultRadius ? 'selected' : '';
    html += `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
  }
  select.innerHTML = html;

  return defaultRadius;
}

/**
 * Retourne la liste des catégories cochées
 */
export function getActiveCategories() {
  const checkboxes = $$('#category-filters input[type="checkbox"]:checked');
  return Array.from(checkboxes).map((cb) => cb.value);
}

/**
 * Retourne le rayon sélectionné (en mètres)
 */
export function getSelectedRadius() {
  const select = $('#radius-select');
  return select ? parseInt(select.value, 10) : 1000;
}

// ── Mise à jour de l'interface ──────────────────────────────────────────────

/**
 * Met à jour le compteur de commerces sans site
 * @param {number} total — Nombre total de commerces trouvés
 * @param {number} withoutWebsite — Nombre de commerces sans site web
 * @param {boolean} hasSearched — Si une recherche a été effectuée
 */
export function updateCounter(total, withoutWebsite, hasSearched = true) {
  const counterEl = $('#commerce-counter');
  if (!counterEl) return;

  if (!hasSearched || total === 0) {
    counterEl.innerHTML = `
      <span class="counter-number">—</span>
      <span class="counter-label">En attente de recherche</span>
      <span class="counter-total">Entrez une adresse pour commencer</span>
    `;
    return;
  }

  counterEl.innerHTML = `
    <span class="counter-number">${withoutWebsite}</span>
    <span class="counter-label">commerce${withoutWebsite > 1 ? 's' : ''} sans site web</span>
    <span class="counter-total">sur ${total} trouvé${total > 1 ? 's' : ''}</span>
  `;

  // Animation d'apparition
  counterEl.classList.remove('counter-animate');
  void counterEl.offsetWidth; // force reflow
  counterEl.classList.add('counter-animate');
}

/**
 * Met à jour le compteur total de marqueurs visibles
 */
export function updateVisibleCount(count) {
  const el = $('#visible-count');
  if (el) el.textContent = `${count} affiché${count > 1 ? 's' : ''}`;
}

/**
 * Affiche un message de statut (chargement, erreur, info)
 * @param {string} message — Texte du message
 * @param {'info'|'loading'|'error'|'success'} type — Type visuel
 * @param {number} duration — Durée d'affichage en ms (0 = permanent)
 */
export function showStatus(message, type = 'info', duration = 5000) {
  const container = $('#status-messages');
  if (!container) return;

  const msgEl = document.createElement('div');
  msgEl.className = `status-msg status-${type}`;

  const icons = { info: 'ℹ️', loading: '⏳', error: '❌', success: '✅' };
  msgEl.innerHTML = `<span class="status-icon">${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;

  container.prepend(msgEl);

  // Suppression automatique
  if (duration > 0) {
    setTimeout(() => {
      msgEl.classList.add('status-fade');
      setTimeout(() => msgEl.remove(), 400);
    }, duration);
  }

  // Limite à 5 messages visibles
  while (container.children.length > 5) {
    container.lastChild.remove();
  }
}

/**
 * Affiche ou masque l'indicateur de chargement
 */
export function setLoading(isLoading) {
  const btn = $('#search-btn');
  const spinner = $('#loading-spinner');

  if (btn) {
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Recherche…' : '🔍 Rechercher';
  }
  if (spinner) {
    spinner.style.display = isLoading ? 'flex' : 'none';
  }
}

/**
 * Affiche la barre de progression pour la vérification des sites
 */
export function showVerificationProgress(current, total) {
  const bar = $('#verification-bar');
  if (!bar) return;

  if (total === 0) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'block';
  const pct = Math.round((current / total) * 100);
  bar.innerHTML = `
    <div class="progress-track">
      <div class="progress-fill" style="width:${pct}%"></div>
    </div>
    <span class="progress-text">Vérification des sites web… ${current}/${total} (${pct}%)</span>
  `;
}

export function hideVerificationProgress() {
  const bar = $('#verification-bar');
  if (bar) bar.style.display = 'none';
}

// ── Suggestions d'adresses ──────────────────────────────────────────────────

/**
 * Affiche une liste de suggestions d'adresses sous le champ de recherche
 * @param {Array<{displayName: string, lat: number, lon: number}>} suggestions
 * @param {function} onSelect — Callback quand l'utilisateur clique une suggestion
 */
export function showSuggestions(suggestions, onSelect) {
  const container = $('#suggestions');
  if (!container) return;

  if (!suggestions || suggestions.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.innerHTML = suggestions
    .map((s, i) => `
      <div class="suggestion-item" data-index="${i}">
        📍 ${escapeHtml(s.displayName)}
      </div>
    `).join('');

  container.style.display = 'block';

  // Événements de clic
  container.querySelectorAll('.suggestion-item').forEach((el) => {
    el.addEventListener('click', () => {
      const index = parseInt(el.dataset.index, 10);
      onSelect(suggestions[index]);
      container.style.display = 'none';
    });
  });
}

export function hideSuggestions() {
  const container = $('#suggestions');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

// ── Liste des commerces dans la sidebar ─────────────────────────────────────

/**
 * Affiche la liste des commerces sans site dans la sidebar
 * @param {Array} commerces — Liste des commerces (sans site web)
 * @param {function} onLocate — Callback pour centrer la carte sur un commerce
 * @param {function} formatter — Fonction formatForClipboard
 */
export function renderCommerceList(commerces, onLocate, formatter) {
  const list = $('#commerce-list');
  if (!list) return;

  if (commerces.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <p>Lancez une recherche pour trouver des commerces sans site web.</p>
      </div>`;
    return;
  }

  list.innerHTML = commerces
    .map((c) => {
      const cat = CATEGORIES[c.category] || CATEGORIES.other;
      const city = extractCity(c.address);
      const mapsLink = getGoogleMapsLink(c.lat, c.lon, c.name);
      const searchLink = getGoogleSearchLink(c.name, city);
      return `
        <div class="commerce-card" data-id="${c.id}">
          <div class="card-header">
            <span class="card-icon" style="background:${cat.color}">${cat.icon}</span>
            <div class="card-info">
              <strong class="card-name">${escapeHtml(c.name)}</strong>
              <span class="card-type">${escapeHtml(cat.label)}</span>
            </div>
            <span class="card-status card-status-pending">⏳ Non vérifié</span>
          </div>
          <div class="card-address">📍 ${escapeHtml(c.address)}</div>
          ${c.phone ? `<div class="card-phone">📞 <a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></div>` : ''}
          ${c.email ? `<div class="card-email">📧 <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>` : ''}
          <div class="card-links">
            <a href="${mapsLink}" target="_blank" rel="noopener" class="card-link">🗺️ Maps</a>
            <a href="${searchLink}" target="_blank" rel="noopener" class="card-link card-link-search">🔍 Chercher site</a>
          </div>
          <div class="card-actions">
            <button class="btn-locate" data-id="${c.id}" title="Voir sur la carte">📍 Localiser</button>
            <button class="btn-copy" data-id="${c.id}" title="Copier les infos">📋 Copier</button>
          </div>
        </div>`;
    })
    .join('');

  // Événements
  list.querySelectorAll('.btn-locate').forEach((btn) => {
    btn.addEventListener('click', () => {
      const commerce = commerces.find((c) => c.id === btn.dataset.id);
      if (commerce) onLocate(commerce);
    });
  });

  list.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const commerce = commerces.find((c) => c.id === btn.dataset.id);
      if (commerce) {
        copyToClipboard(formatter(commerce));
        showStatus('Informations copiées !', 'success', 2000);
      }
    });
  });
}

// ── Bouton "Vérifier les sites" ─────────────────────────────────────────────

/**
 * Active le bouton "Vérifier les sites web" avec le nombre de commerces
 * @param {number} count — Nombre de commerces à vérifier
 */
export function showVerifyButton(count) {
  const btn = $('#verify-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = `🔍 Vérifier les ${count} commerces`;
  btn.className = 'verify-btn';
  btn.onclick = () => window.startVerification();
}

/**
 * Désactive le bouton de vérification (état initial)
 */
export function hideVerifyButton() {
  const btn = $('#verify-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '🔍 Vérifier les sites web';
  btn.className = 'verify-btn';
  btn.onclick = null;
}

/**
 * Met à jour l'état du bouton de vérification
 * @param {'idle'|'running'|'done'} state
 * @param {number} current — Progression actuelle
 * @param {number} total — Total à vérifier
 */
export function setVerifyButtonState(state, current, total) {
  const btn = $('#verify-btn');
  if (!btn) return;

  if (state === 'running') {
    const pct = Math.round((current / total) * 100);
    btn.disabled = false;
    btn.textContent = `⏹ Annuler (${current}/${total} — ${pct}%)`;
    btn.className = 'verify-btn verify-btn-running';
    btn.onclick = () => window.cancelVerification();
  } else if (state === 'done') {
    btn.disabled = true;
    btn.textContent = '✅ Vérification terminée';
    btn.className = 'verify-btn';
    btn.onclick = null;
  }
}

// ── Mise à jour individuelle d'une carte commerce ───────────────────────────

/**
 * Met à jour une seule carte dans la sidebar (pour la vérification progressive)
 * @param {object} commerce — Commerce avec les données mises à jour
 */
export function updateCommerceCard(commerce) {
  const list = $('#commerce-list');
  if (!list) return;

  const card = list.querySelector(`.commerce-card[data-id="${commerce.id}"]`);
  if (!card) return;

  const cat = CATEGORIES[commerce.category] || CATEGORIES.other;

  // Mettre à jour l'indicateur de statut
  const statusEl = card.querySelector('.card-status');
  if (statusEl) {
    if (commerce.hasWebsite) {
      statusEl.className = 'card-status card-status-found';
      statusEl.innerHTML = '✅ Site trouvé';
    } else if (commerce.websiteCheckDone) {
      statusEl.className = 'card-status card-status-none';
      statusEl.innerHTML = '🔴 Pas de site';
    }
  }

  // Si un site web a été trouvé, ajouter le lien
  if (commerce.hasWebsite && commerce.website) {
    const linksContainer = card.querySelector('.card-links');
    if (linksContainer && !linksContainer.querySelector('.card-link-website')) {
      const websiteLink = document.createElement('a');
      websiteLink.href = commerce.website;
      websiteLink.target = '_blank';
      websiteLink.rel = 'noopener';
      websiteLink.className = 'card-link card-link-website';
      websiteLink.textContent = `🌐 ${truncateUrl(commerce.website)}`;
      linksContainer.prepend(websiteLink);
    }
  }

  // Flash visuel pour indiquer la mise à jour
  card.classList.add('card-updated');
  setTimeout(() => card.classList.remove('card-updated'), 600);
}

/**
 * Tronque une URL pour l'affichage
 */
function truncateUrl(url, maxLen = 30) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.length > maxLen ? hostname.substring(0, maxLen - 1) + '…' : hostname;
  } catch {
    return url.length > maxLen ? url.substring(0, maxLen - 1) + '…' : url;
  }
}

/**
 * Copie du texte dans le presse-papier
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback pour les navigateurs plus anciens
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

// ── Toggle sidebar mobile ───────────────────────────────────────────────────

export function initSidebarToggle() {
  const toggle = $('#sidebar-toggle');
  const sidebar = $('#sidebar');
  const overlay = $('#sidebar-overlay');

  if (!toggle || !sidebar) return;

  const open = () => {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('visible');
  };

  const close = () => {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
  };

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? close() : open();
  });

  if (overlay) overlay.addEventListener('click', close);
}
