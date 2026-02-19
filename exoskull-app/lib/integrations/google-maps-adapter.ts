/**
 * Google Maps & Places Adapter
 *
 * Uses API key auth (not OAuth). REST calls to maps.googleapis.com.
 * Supports Places (New), Directions, and Geocoding APIs.
 */

import { logger } from "@/lib/logger";

const MAPS_BASE = "https://maps.googleapis.com/maps/api";
const PLACES_BASE = "https://places.googleapis.com/v1";

function getApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

// ---------------------------------------------------------------------------
// Places API (New)
// ---------------------------------------------------------------------------

export interface Place {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  googleMapsUri?: string;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

export async function searchPlaces(
  query: string,
  options?: { location?: string; radius?: number; type?: string },
): Promise<{
  ok: boolean;
  places?: Place[];
  formatted?: string;
  error?: string;
}> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "Brak GOOGLE_MAPS_API_KEY." };

  try {
    const body: Record<string, unknown> = { textQuery: query };
    if (options?.location) {
      const [lat, lng] = options.location.split(",").map(Number);
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: options.radius || 5000,
        },
      };
    }
    if (options?.type) {
      body.includedType = options.type;
    }

    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.googleMapsUri,places.regularOpeningHours,places.nationalPhoneNumber,places.websiteUri",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Places API ${res.status}: ${errText}` };
    }

    const data = await res.json();
    const places: Place[] = data.places || [];

    if (!places.length) {
      return {
        ok: true,
        places: [],
        formatted: `Nie znaleziono miejsc dla "${query}".`,
      };
    }

    const formatted = places
      .slice(0, 10)
      .map((p, i) => {
        const parts = [`${i + 1}. **${p.displayName.text}**`];
        parts.push(p.formattedAddress);
        if (p.rating)
          parts.push(`Ocena: ${p.rating}/5 (${p.userRatingCount || 0} opinii)`);
        if (p.nationalPhoneNumber) parts.push(`Tel: ${p.nationalPhoneNumber}`);
        if (p.regularOpeningHours?.openNow !== undefined) {
          parts.push(p.regularOpeningHours.openNow ? "Otwarte" : "Zamknięte");
        }
        if (p.googleMapsUri) parts.push(`Maps: ${p.googleMapsUri}`);
        parts.push(`Place ID: ${p.id}`);
        return parts.join(" | ");
      })
      .join("\n");

    return { ok: true, places, formatted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleMaps] searchPlaces error:", msg);
    return { ok: false, error: msg };
  }
}

export async function getPlaceDetails(
  placeId: string,
): Promise<{ ok: boolean; place?: Place; formatted?: string; error?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "Brak GOOGLE_MAPS_API_KEY." };

  try {
    const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,rating,userRatingCount,types,googleMapsUri,regularOpeningHours,nationalPhoneNumber,websiteUri",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Places API ${res.status}: ${errText}` };
    }

    const place: Place = await res.json();
    const parts = [`**${place.displayName.text}**`, place.formattedAddress];
    if (place.rating)
      parts.push(`Ocena: ${place.rating}/5 (${place.userRatingCount || 0})`);
    if (place.nationalPhoneNumber)
      parts.push(`Tel: ${place.nationalPhoneNumber}`);
    if (place.websiteUri) parts.push(`Web: ${place.websiteUri}`);
    if (place.regularOpeningHours?.weekdayDescriptions?.length) {
      parts.push(
        `Godziny:\n${place.regularOpeningHours.weekdayDescriptions.join("\n")}`,
      );
    }
    if (place.googleMapsUri) parts.push(`Maps: ${place.googleMapsUri}`);

    return { ok: true, place, formatted: parts.join("\n") };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleMaps] getPlaceDetails error:", msg);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Directions API
// ---------------------------------------------------------------------------

export interface DirectionsResult {
  duration: string;
  distance: string;
  steps: string[];
  summary: string;
}

export async function getDirections(
  origin: string,
  destination: string,
  mode: "driving" | "walking" | "bicycling" | "transit" = "driving",
): Promise<{
  ok: boolean;
  directions?: DirectionsResult;
  formatted?: string;
  error?: string;
}> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "Brak GOOGLE_MAPS_API_KEY." };

  try {
    const params = new URLSearchParams({
      origin,
      destination,
      mode,
      key: apiKey,
      language: "pl",
    });

    const res = await fetch(`${MAPS_BASE}/directions/json?${params}`);
    if (!res.ok) {
      return { ok: false, error: `Directions API ${res.status}` };
    }

    const data = await res.json();
    if (data.status !== "OK" || !data.routes?.length) {
      return { ok: false, error: `Nie znaleziono trasy: ${data.status}` };
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const directions: DirectionsResult = {
      duration: leg.duration.text,
      distance: leg.distance.text,
      summary: route.summary || "",
      steps: leg.steps.map(
        (s: { html_instructions: string; distance: { text: string } }) =>
          `${s.html_instructions.replace(/<[^>]+>/g, "")} (${s.distance.text})`,
      ),
    };

    const modeLabel = {
      driving: "Samochodem",
      walking: "Pieszo",
      bicycling: "Rowerem",
      transit: "Transportem publicznym",
    }[mode];
    const formatted = [
      `**${modeLabel}: ${origin} → ${destination}**`,
      `Czas: ${directions.duration} | Dystans: ${directions.distance}`,
      `Trasa: ${directions.summary}`,
      "",
      ...directions.steps.slice(0, 15).map((s, i) => `${i + 1}. ${s}`),
      directions.steps.length > 15
        ? `... i ${directions.steps.length - 15} więcej kroków`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { ok: true, directions, formatted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleMaps] getDirections error:", msg);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Geocoding API
// ---------------------------------------------------------------------------

export async function geocodeAddress(
  addressOrLatLng: string,
): Promise<{ ok: boolean; formatted?: string; error?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "Brak GOOGLE_MAPS_API_KEY." };

  try {
    const isLatLng = /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(addressOrLatLng.trim());
    const params = new URLSearchParams({
      key: apiKey,
      language: "pl",
    });

    if (isLatLng) {
      params.set("latlng", addressOrLatLng.trim());
    } else {
      params.set("address", addressOrLatLng);
    }

    const res = await fetch(`${MAPS_BASE}/geocode/json?${params}`);
    if (!res.ok) return { ok: false, error: `Geocoding API ${res.status}` };

    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      return { ok: false, error: `Geocoding failed: ${data.status}` };
    }

    const result = data.results[0];
    const loc = result.geometry.location;

    const formatted = isLatLng
      ? `**${result.formatted_address}**\nKoordynaty: ${loc.lat}, ${loc.lng}`
      : `**${result.formatted_address}**\nKoordynaty: ${loc.lat}, ${loc.lng}\nPlace ID: ${result.place_id}`;

    return { ok: true, formatted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[GoogleMaps] geocode error:", msg);
    return { ok: false, error: msg };
  }
}
