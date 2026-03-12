/**
 * Doctolib Avisé - Content Script
 */

const PROCESSED_ATTR = 'data-gr-processed';
const LOG = () => {};

// ----- Extraction des données -----

function extractDoctorInfo(card) {
  const nameEl = card.querySelector('h2');
  const name = nameEl?.textContent?.trim();

  const addressIcon = card.querySelector('svg[aria-label="Adresse"]');
  const addressRow = addressIcon?.closest('div[class*="gap-8"]');
  const addressWrapper = addressRow?.querySelector('div[class*="flex-wrap"]');
  const addressParts = addressWrapper
    ? [...addressWrapper.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean)
    : [];
  const address = addressParts.join(' ');

  const nameRow = nameEl?.closest('a')?.parentElement;
  const specialtyEl = nameRow?.nextElementSibling?.querySelector('p');
  const specialty = specialtyEl?.textContent?.trim() ?? '';

  if (!name) return null;
  return { name, address, specialty };
}

// ----- Rendu des étoiles -----

function renderStars(rating) {
  const container = document.createElement('span');
  container.className = 'gr-stars';
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    if (rating >= i - 0.25) {
      star.className = 'gr-star gr-star-full';
      star.textContent = '★';
    } else if (rating >= i - 0.75) {
      star.className = 'gr-star gr-star-half';
      const fill = document.createElement('span');
      fill.className = 'gr-star-half-fill';
      fill.textContent = '★';
      star.appendChild(fill);
      star.appendChild(document.createTextNode('★'));
    } else {
      star.className = 'gr-star gr-star-empty';
      star.textContent = '★';
    }
    container.appendChild(star);
  }
  return container;
}

function formatCount(count) {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace('.0', '')}k`;
  return String(count);
}

// ----- Helpers SVG -----

function makeSvgIcon(viewBox, size, d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

// ----- Injection des badges -----

function injectBadge(card, data) {
  const nameEl = card.querySelector('h2');
  if (!nameEl) return;

  const linkEl = nameEl.closest('a');
  const nameRow = linkEl?.parentElement;
  const nameCol = nameRow?.parentElement;
  if (!nameRow || !nameCol) return;

  nameCol.querySelector('.gr-badge-row')?.remove();

  const name = nameEl.textContent.trim();

  let badge;
  if (data.notFound || data.rating === null || data.rating === undefined || data.error) {
    const searchQuery = card.querySelector('svg[aria-label="Adresse"]')
      ?.closest('div[class*="gap-8"]')
      ?.querySelector('div[class*="flex-wrap"]')
      ?.querySelectorAll('p');
    const address = searchQuery ? [...searchQuery].map(p => p.textContent.trim()).join(' ') : '';
    badge = createNotFoundBadge(name, address, data.error);
  } else {
    badge = createRatingBadge(data);
  }

  const row = document.createElement('div');
  row.className = 'gr-badge-row';
  row.appendChild(badge);
  nameRow.insertAdjacentElement('afterend', row);
}

function createRatingBadge(data) {
  const badge = document.createElement('a');
  badge.className = 'gr-badge gr-badge-rating';
  badge.href = data.mapsUrl;
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.title = `Voir sur Google Maps (${data.rating}/5 · ${data.totalRatings} avis)`;
  badge.addEventListener('click', e => e.stopPropagation());

  badge.appendChild(renderStars(data.rating));

  const score = document.createElement('span');
  score.className = 'gr-score';
  score.textContent = data.rating.toFixed(1);
  badge.appendChild(score);

  const count = document.createElement('span');
  count.className = 'gr-count';
  count.textContent = `(${formatCount(data.totalRatings)})`;
  badge.appendChild(count);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gr-maps-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  badge.appendChild(svg);

  return badge;
}

function createNotFoundBadge(name, address, errorCode) {
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${name} ${address}`.trim())}`;
  const badge = document.createElement('a');
  badge.className = 'gr-badge gr-badge-notfound';
  badge.href = searchUrl;
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.title = errorCode
    ? `Erreur: ${errorCode} — Rechercher sur Google Maps`
    : 'Non trouvé — Rechercher sur Google Maps';
  badge.addEventListener('click', e => e.stopPropagation());

  badge.appendChild(makeSvgIcon('0 0 24 24', 13, 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'));

  const text = document.createElement('span');
  text.textContent = 'Non trouvé';
  badge.appendChild(text);

  badge.appendChild(makeSvgIcon('0 0 24 24', 10, 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z'));

  return badge;
}

function createLoadingBadge() {
  const badge = document.createElement('span');
  badge.className = 'gr-badge gr-badge-loading';
  const spinner = document.createElement('span');
  spinner.className = 'gr-spinner';
  badge.appendChild(spinner);
  return badge;
}

// ----- Bandeau de statut -----

const BANNER_MESSAGES = {
  NO_API_KEY: {
    before: "Extension Doctolib Avisé inactive — aucune clé API configurée. Cliquez sur l'icône ",
    bold: 'Doctolib Avisé',
    after: ' dans la barre d\'outils Chrome pour la renseigner, puis rechargez la page.',
  },
  API_KEY_INVALID: {
    before: "Extension Doctolib Avisé inactive — clé API invalide ou révoquée. Cliquez sur l'icône ",
    bold: 'Doctolib Avisé',
    after: ' dans la barre d\'outils Chrome pour la mettre à jour, puis rechargez la page.',
  },
};

let bannerShown = false;

function showBanner(type) {
  if (bannerShown) return;
  bannerShown = true;

  const msg = BANNER_MESSAGES[type] ?? BANNER_MESSAGES.NO_API_KEY;

  const banner = document.createElement('div');
  banner.id = 'gr-banner';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'gr-banner-icon';
  const warnSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  warnSvg.setAttribute('viewBox', '0 0 20 20');
  warnSvg.setAttribute('width', '16');
  warnSvg.setAttribute('height', '16');
  warnSvg.setAttribute('fill', 'currentColor');
  const warnPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  warnPath.setAttribute('fill-rule', 'evenodd');
  warnPath.setAttribute('d', 'M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z');
  warnPath.setAttribute('clip-rule', 'evenodd');
  warnSvg.appendChild(warnPath);
  iconSpan.appendChild(warnSvg);
  banner.appendChild(iconSpan);

  const textSpan = document.createElement('span');
  textSpan.className = 'gr-banner-text';
  textSpan.appendChild(document.createTextNode(msg.before));
  const strong = document.createElement('strong');
  strong.textContent = msg.bold;
  textSpan.appendChild(strong);
  textSpan.appendChild(document.createTextNode(msg.after));
  banner.appendChild(textSpan);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'gr-banner-close';
  closeBtn.title = 'Fermer';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => banner.remove());
  banner.appendChild(closeBtn);

  document.body.prepend(banner);
}

// ----- Traitement d'une carte -----

let extensionActive = true;

async function processCard(card) {
  if (!extensionActive) return;
  if (card.hasAttribute(PROCESSED_ATTR)) return;
  card.setAttribute(PROCESSED_ATTR, '1');

  const info = extractDoctorInfo(card);
  if (!info?.name) return;

  const nameEl = card.querySelector('h2');
  const linkEl = nameEl?.closest('a');
  const nameRow = linkEl?.parentElement;
  const nameCol = nameRow?.parentElement;
  if (!nameRow || !nameCol) return;

  const loadingRow = document.createElement('div');
  loadingRow.className = 'gr-badge-row';
  loadingRow.appendChild(createLoadingBadge());
  nameRow.insertAdjacentElement('afterend', loadingRow);

  try {
    const data = await chrome.runtime.sendMessage({
      type: 'GET_RATING',
      name: info.name,
      address: info.address,
    });

    loadingRow.remove();

    if (data?.error === 'NO_API_KEY' || data?.error === 'API_KEY_INVALID') {
      extensionActive = false;
      observer.disconnect();
      showBanner(data.error);
      return;
    }

    injectBadge(card, data ?? { notFound: true });
  } catch (err) {
    LOG('ERREUR sendMessage:', err);
    loadingRow.remove();
    injectBadge(card, { notFound: true, error: 'SEND_ERROR' });
  }
}

// ----- Observation du DOM -----

function scanCards() {
  if (!extensionActive) return;
  const cards = document.querySelectorAll(`.dl-card:not([${PROCESSED_ATTR}])`);
  cards.forEach(card => {
    if (card.querySelector('h2')) processCard(card);
  });
}

let rafPending = false;
const observer = new MutationObserver(() => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    scanCards();
  });
});

window.addEventListener('unload', () => observer.disconnect());

// ----- Initialisation -----

(async () => {
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  if (!status?.hasKey) {
    showBanner('NO_API_KEY');
    return;
  }
  observer.observe(document.body, { childList: true, subtree: true });
  scanCards();
})();
