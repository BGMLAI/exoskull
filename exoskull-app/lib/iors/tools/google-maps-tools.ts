/**
 * Google Maps & Places IORS Tools
 *
 * 4 tools: search_places, get_place_details, get_directions, geocode_address
 */

import type { ToolDefinition } from "./shared";
import {
  searchPlaces,
  getPlaceDetails,
  getDirections,
  geocodeAddress,
} from "@/lib/integrations/google-maps-adapter";

export const googleMapsTools: ToolDefinition[] = [
  {
    definition: {
      name: "search_places",
      description:
        "Wyszukaj miejsca (restauracje, sklepy, lekarze, etc.) za pomocą Google Maps.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: 'Zapytanie (np. "pizza Warszawa", "dentysta Kraków")',
          },
          location: {
            type: "string",
            description: "Centrum wyszukiwania lat,lng (np. 52.2297,21.0122)",
          },
          radius: {
            type: "number",
            description: "Promień wyszukiwania w metrach (domyślnie 5000)",
          },
          type: {
            type: "string",
            description: "Typ miejsca (np. restaurant, hospital, gym)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input) => {
      const result = await searchPlaces(input.query as string, {
        location: input.location as string | undefined,
        radius: input.radius as number | undefined,
        type: input.type as string | undefined,
      });
      if (!result.ok) return result.error || "Błąd wyszukiwania miejsc.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "get_place_details",
      description:
        "Pobierz szczegóły miejsca z Google Maps (godziny, telefon, opinie).",
      input_schema: {
        type: "object" as const,
        properties: {
          place_id: {
            type: "string",
            description: "Place ID z wyników search_places",
          },
        },
        required: ["place_id"],
      },
    },
    execute: async (input) => {
      const result = await getPlaceDetails(input.place_id as string);
      if (!result.ok) return result.error || "Nie udało się pobrać szczegółów.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "get_directions",
      description:
        "Wyznacz trasę między dwoma punktami (samochód, pieszo, rower, komunikacja).",
      input_schema: {
        type: "object" as const,
        properties: {
          origin: {
            type: "string",
            description: "Punkt startowy (adres lub lat,lng)",
          },
          destination: {
            type: "string",
            description: "Punkt docelowy (adres lub lat,lng)",
          },
          mode: {
            type: "string",
            enum: ["driving", "walking", "bicycling", "transit"],
            description: "Tryb podróży (domyślnie: driving)",
          },
        },
        required: ["origin", "destination"],
      },
    },
    execute: async (input) => {
      const result = await getDirections(
        input.origin as string,
        input.destination as string,
        (input.mode as "driving" | "walking" | "bicycling" | "transit") ||
          "driving",
      );
      if (!result.ok) return result.error || "Nie udało się wyznaczyć trasy.";
      return result.formatted!;
    },
  },
  {
    definition: {
      name: "geocode_address",
      description:
        "Zamień adres na współrzędne (lub odwrotnie — koordynaty na adres).",
      input_schema: {
        type: "object" as const,
        properties: {
          address: {
            type: "string",
            description: 'Adres lub współrzędne "lat,lng"',
          },
        },
        required: ["address"],
      },
    },
    execute: async (input) => {
      const result = await geocodeAddress(input.address as string);
      if (!result.ok) return result.error || "Nie udało się geokodować.";
      return result.formatted!;
    },
  },
];
