const LOG = () => {};

// In-memory cache to avoid redundant API calls
const cache = new Map();
// In-flight requests (avoids simultaneous duplicates)
const pending = new Map();

// Two Google APIs are supported with the same key:
// - 'legacy': Places API (Legacy), larger free quota but closed to new projects
// - 'new':    Places API (New)
// The one that works for the key is stored as `apiMode`.
const LEGACY_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const NEW_URL = 'https://places.googleapis.com/v1/places:searchText';
const NEW_FIELDS = 'places.id,places.formattedAddress,places.rating,places.userRatingCount';
const TIMEOUT_MS = 8000;

async function getConfig() {
  const { apiKey, apiMode } = await chrome.storage.local.get(['apiKey', 'apiMode']);
  return { apiKey: apiKey || null, apiMode: apiMode === 'new' ? 'new' : 'legacy' };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'GET_STATUS') {
    getConfig().then(({ apiKey }) => sendResponse({ hasKey: !!apiKey }));
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
        LOG('Unhandled error:', err);
        sendResponse({ error: err.message });
      });
    return true;
  }
});

// ----- Google API calls -----
// Both return { places: [{ id, address, rating, totalRatings }] } or { error }.
// A rejected key (invalid, or API not enabled on the project) is 'API_KEY_INVALID'.

async function fetchWithTimeout(url, options) {
  try {
    return { response: await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) }) };
  } catch (err) {
    return { error: err.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR' };
  }
}

async function searchLegacy(apiKey, query) {
  const url = new URL(LEGACY_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'fr');

  const { response, error } = await fetchWithTimeout(url.toString());
  if (error) return { error };
  if (!response.ok) return { error: `HTTP_${response.status}` };

  let data;
  try {
    data = await response.json();
  } catch {
    return { error: 'INVALID_RESPONSE' };
  }

  if (data.status === 'REQUEST_DENIED') return { error: 'API_KEY_INVALID' };
  if (data.status === 'ZERO_RESULTS') return { places: [] };
  if (data.status !== 'OK') return { error: data.status };

  return {
    places: (data.results ?? []).map(r => ({
      id: r.place_id,
      address: r.formatted_address ?? '',
      rating: r.rating ?? null,
      totalRatings: r.user_ratings_total ?? 0,
    })),
  };
}

async function searchNew(apiKey, query, fields = NEW_FIELDS) {
  const { response, error } = await fetchWithTimeout(NEW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fields,
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'fr' }),
  });
  if (error) return { error };
  if (response.status === 429) return { error: 'OVER_QUERY_LIMIT' };
  if ([400, 401, 403].includes(response.status)) return { error: 'API_KEY_INVALID' };
  if (!response.ok) return { error: `HTTP_${response.status}` };

  let data;
  try {
    data = await response.json();
  } catch {
    return { error: 'INVALID_RESPONSE' };
  }

  return {
    places: (data.places ?? []).map(p => ({
      id: p.id,
      address: p.formattedAddress ?? '',
      rating: p.rating ?? null,
      totalRatings: p.userRatingCount ?? 0,
    })),
  };
}

const SEARCH = { legacy: searchLegacy, new: searchNew };

// Tries the stored API first, then the other one if the key is rejected.
async function searchWithFallback(apiKey, apiMode, query) {
  const other = apiMode === 'new' ? 'legacy' : 'new';
  const first = await SEARCH[apiMode](apiKey, query);
  if (first.error !== 'API_KEY_INVALID') return first;

  const second = await SEARCH[other](apiKey, query);
  if (second.error === 'API_KEY_INVALID') return first;
  if (!second.error) await chrome.storage.local.set({ apiMode: other });
  return second;
}

// Legacy is tried first because its free quota is larger.
async function validateApiKey(key) {
  const attempts = [
    ['legacy', () => searchLegacy(key, 'test')],
    ['new', () => searchNew(key, 'test', 'places.id')],
  ];
  for (const [apiMode, run] of attempts) {
    const { error } = await run();
    if (error === 'API_KEY_INVALID') continue;
    if (error === 'TIMEOUT') return { valid: false, error: 'TIMEOUT' };
    if (error === 'NETWORK_ERROR' || error?.startsWith('HTTP_')) {
      return { valid: false, error: 'NETWORK_ERROR' };
    }
    return { valid: true, apiMode };
  }
  return { valid: false, error: 'DENIED' };
}

// Extracts the French postal code (5 digits) from a string
function extractPostalCode(str) {
  return str.match(/\b\d{5}\b/)?.[0] ?? null;
}

async function handleGetRating(name, address) {
  const { apiKey, apiMode } = await getConfig();
  if (!apiKey) return { error: 'NO_API_KEY' };

  const cacheKey = `${name}|${address}`;

  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Deduplicate identical simultaneous requests
  if (pending.has(cacheKey)) return pending.get(cacheKey);

  const promise = fetchRating(apiKey, apiMode, name, address, cacheKey);
  pending.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pending.delete(cacheKey);
  }
}

async function fetchRating(apiKey, apiMode, name, address, cacheKey) {
  const query = [name, address].filter(Boolean).join(' ');
  const { places, error } = await searchWithFallback(apiKey, apiMode, query);
  if (error) return { error };

  // Only keep a result whose postal code matches the searched address
  const expectedPostal = extractPostalCode(address);
  const place = expectedPostal
    ? places.find(p => extractPostalCode(p.address) === expectedPostal)
    : places[0];

  const result = place
    ? {
        rating: place.rating,
        totalRatings: place.totalRatings,
        placeId: place.id,
        mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      }
    : { notFound: true };

  cache.set(cacheKey, result);
  return result;
}
