// Google reviews for the home page, fetched from the Google Places API and cached.
// Needs GOOGLE_PLACES_API_KEY. GOOGLE_PLACE_ID is optional: without it the café is looked up by name once.
// Reviews are shown exactly as Google returns them (no picking or editing), with the reviewer's name and a link to Google.

const KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const QUERY = process.env.GOOGLE_PLACE_QUERY || "Granville's Coffee, 383 Reid Street, Quesnel, BC";
const TTL = 6 * 60 * 60e3; // Google's own data, refreshed every six hours
const RETRY = 15 * 60e3; // after a failure, wait before asking again

let placeId = process.env.GOOGLE_PLACE_ID || "";
let cache = { at: 0, data: null, failedAt: 0 };

async function call(url, opts) {
  const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(8000) }, opts));
  if (!res.ok) throw new Error("Google Places " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

async function findPlace() {
  const r = await call("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.id,places.displayName" },
    body: JSON.stringify({ textQuery: QUERY, maxResultCount: 1 })
  });
  const p = r.places && r.places[0];
  if (!p) throw new Error("Google Places: the café wasn't found for \"" + QUERY + "\"");
  return p.id;
}

async function fetchReviews() {
  if (!placeId) placeId = await findPlace();
  const p = await call("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId), {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews" }
  });
  return {
    rating: p.rating || null,
    count: p.userRatingCount || 0,
    url: p.googleMapsUri || "",
    reviews: (p.reviews || []).filter((r) => r.text && r.text.text).map((r) => ({
      author: (r.authorAttribution && r.authorAttribution.displayName) || "A Google user",
      authorUrl: (r.authorAttribution && r.authorAttribution.uri) || "",
      photo: (r.authorAttribution && r.authorAttribution.photoUri) || "",
      rating: r.rating || 0,
      text: r.text.text,
      when: r.relativePublishTimeDescription || "",
      url: r.googleMapsUri || ""
    }))
  };
}

const EMPTY = { rating: null, count: 0, url: "", reviews: [] };

async function getReviews() {
  if (!KEY) return EMPTY;
  const now = Date.now();
  if (cache.data && now - cache.at < TTL) return cache.data;
  if (cache.failedAt && now - cache.failedAt < RETRY) return cache.data || EMPTY;
  try {
    cache = { at: now, data: await fetchReviews(), failedAt: 0 };
  } catch (e) {
    console.warn("[reviews]", e.message);
    cache.failedAt = now; // keep showing the last good copy, if any
  }
  return cache.data || EMPTY;
}

module.exports = { getReviews, enabled: () => !!KEY };
