const LOG = () => {};

// Cache en mémoire pour éviter des appels API redondants
const cache = new Map();
// Requêtes en cours (évite les doublons simultanés)
const pending = new Map();

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return apiKey || null;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'GET_STATUS') {
    getApiKey().then(key => sendResponse({ hasKey: !!key }));
    return true;
  }
  if (request.type === 'VALIDATE_KEY') {
    validateApiKey(request.key).then(sendResponse);
    return true;
  }
  if (request.type === 'GET_RATING') {
    handleGetRating(request.name, request.address)
      .then(sendResponse)
      .catch(err => {
        LOG('Erreur non gérée:', err);
        sendResponse({ error: err.message });
      });
    return true;
  }
});

async function validateApiKey(key) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', 'test');
  url.searchParams.set('key', key);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return { valid: false, error: 'NETWORK_ERROR' };
    const data = await response.json();
    if (data.status === 'REQUEST_DENIED') return { valid: false, error: 'DENIED' };
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR' };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Extrait le code postal français (5 chiffres) d'une chaîne
function extractPostalCode(str) {
  return str.match(/\b\d{5}\b/)?.[0] ?? null;
}

async function handleGetRating(name, address) {
  const apiKey = await getApiKey();
  if (!apiKey) return { error: 'NO_API_KEY' };

  const cacheKey = `${name}|${address}`;

  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Dédupliquer les requêtes simultanées identiques
  if (pending.has(cacheKey)) return pending.get(cacheKey);

  const promise = fetchRating(apiKey, name, address, cacheKey);
  pending.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pending.delete(cacheKey);
  }
}

async function fetchRating(apiKey, name, address, cacheKey) {
  const query = [name, address].filter(Boolean).join(' ');
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'fr');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'TIMEOUT' };
    return { error: 'NETWORK_ERROR' };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) return { error: `HTTP_${response.status}` };

  let data;
  try {
    data = await response.json();
  } catch {
    return { error: 'INVALID_RESPONSE' };
  }

  if (data.status === 'REQUEST_DENIED') return { error: 'API_KEY_INVALID' };
  if (data.status === 'OVER_QUERY_LIMIT') return { error: 'OVER_QUERY_LIMIT' };

  if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
    const result = { notFound: true };
    cache.set(cacheKey, result);
    return result;
  }

  if (data.status !== 'OK') return { error: data.status };

  // Vérifier que le code postal du résultat correspond à celui de l'adresse recherchée
  const expectedPostal = extractPostalCode(address);
  const place = expectedPostal
    ? data.results.find(r => extractPostalCode(r.formatted_address ?? '') === expectedPostal)
    : data.results[0];

  if (!place) {
    const result = { notFound: true };
    cache.set(cacheKey, result);
    return result;
  }

  const result = {
    rating: place.rating ?? null,
    totalRatings: place.user_ratings_total ?? 0,
    placeId: place.place_id,
    mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
  };

  cache.set(cacheKey, result);
  return result;
}
