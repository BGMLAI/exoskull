/**
 * v3 Marketplace Tools — Allegro Integration
 *
 * Allows IORS agent to publish product listings on Allegro marketplace.
 * Ported from lumpx.pro AllegroPublisher with adaptations for ExoSkull.
 *
 * 1 tool: publish_to_allegro
 */

import type { V3ToolDefinition } from "./index";
import { logger } from "@/lib/logger";

// ============================================================================
// ALLEGRO API HELPERS
// ============================================================================

let cachedToken: { token: string; expiresAt: number } | null = null;

async function allegroAuth(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.ALLEGRO_CLIENT_ID;
  const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Brak ALLEGRO_CLIENT_ID / ALLEGRO_CLIENT_SECRET w env vars",
    );
  }

  const isSandbox = process.env.ALLEGRO_SANDBOX === "true";
  const authUrl = isSandbox
    ? "https://allegro.pl.allegrosandbox.pl/auth/oauth/token"
    : "https://allegro.pl/auth/oauth/token";

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Allegro auth failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000, // 5 min buffer
  };

  return cachedToken.token;
}

function getAllegroBaseUrl(): string {
  return process.env.ALLEGRO_SANDBOX === "true"
    ? "https://api.allegro.pl.allegrosandbox.pl"
    : "https://api.allegro.pl";
}

async function allegroApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await allegroAuth();

  const response = await fetch(`${getAllegroBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.allegro.public.v1+json",
      Accept: "application/vnd.allegro.public.v1+json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!response.ok) {
    let errorBody: string;
    try {
      const errorJson = await response.json();
      errorBody = JSON.stringify(errorJson.errors || errorJson);
    } catch {
      errorBody = await response.text();
    }
    throw new Error(`Allegro API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

// ============================================================================
// CATEGORY MAPPING (gastro equipment → Allegro IDs)
// ============================================================================

function getCategoryId(categoryHint: string): string {
  const mapping: Record<string, string> = {
    // Chłodnictwo (323107)
    lodówka: "323107",
    lodowka: "323107",
    witryna: "323107",
    "witryna chłodnicza": "323107",
    zamrażarka: "323107",
    zamrazarka: "323107",
    "szafa chłodnicza": "323107",
    "stół chłodniczy": "323107",
    "stol chlodniczy": "323107",
    chłodnictwo: "323107",

    // Obróbka mechaniczna (323109)
    krajalnica: "323109",
    obieraczka: "323109",

    // Obróbka termiczna (323110)
    piekarnik: "323110",
    piec: "323110",
    "piec konwekcyjny": "323110",
    "płyta grillowa": "323110",
    grill: "323110",
    frytkownica: "323110",
    kuchenka: "323110",

    // Przechowywanie żywności (323112)
    pojemnik: "323112",
    gastronorm: "323112",

    // Meble technologiczne (121534)
    taboret: "121534",
    stół: "121534",
    stol: "121534",
    wózek: "121534",

    // Wyposażenie lokalu (323108)
    wentylator: "323108",
    szuflady: "323108",

    // Fallback: Gastronomia ogólna (323106)
    gastronomia: "323106",
    "sprzęt gastronomiczny": "323106",
  };

  // If already a numeric Allegro ID, use directly
  if (/^\d+$/.test(categoryHint)) {
    return categoryHint;
  }

  const normalized = categoryHint.toLowerCase().trim();

  // Exact match
  if (mapping[normalized]) return mapping[normalized];

  // Partial match — check if hint contains a mapped keyword
  for (const [keyword, id] of Object.entries(mapping)) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      return id;
    }
  }

  // Default: Gastronomia
  return "323106";
}

function mapCondition(condition: string): string {
  const upper = condition.toUpperCase();
  if (upper === "NEW") return "NEW";
  return "USED";
}

// ============================================================================
// #1 publish_to_allegro
// ============================================================================

const publishToAllegroTool: V3ToolDefinition = {
  definition: {
    name: "publish_to_allegro",
    description:
      "Opublikuj ofertę sprzedaży na Allegro. Tworzy ogłoszenie z ceną, opisem, kategorią i zdjęciami. Używaj gdy user chce coś sprzedać na Allegro. Zwraca URL oferty.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_name: {
          type: "string",
          description:
            "Nazwa produktu (max 50 znaków). Np. 'Piekarnik RATIONAL SCC 61'",
        },
        description: {
          type: "string",
          description:
            "Opis produktu. Może zawierać HTML. Powinien być konkretny — parametry, stan, wymiary.",
        },
        price: {
          type: "number",
          description: "Cena w PLN (np. 8500)",
        },
        condition: {
          type: "string",
          enum: ["NEW", "USED"],
          description: "Stan produktu: NEW lub USED",
        },
        category: {
          type: "string",
          description:
            "Kategoria: nazwa polska (np. 'piekarnik', 'lodówka') lub ID Allegro. Domyślnie: gastronomia.",
        },
        brand: {
          type: "string",
          description: "Marka producenta (np. 'RATIONAL', 'Hendi')",
        },
        model: {
          type: "string",
          description: "Model produktu (np. 'SCC 61')",
        },
        image_urls: {
          type: "array",
          items: { type: "string" },
          description:
            "Publiczne URL-e zdjęć produktu (max 16). Muszą być dostępne przez HTTPS.",
        },
      },
      required: ["product_name", "description", "price", "condition"],
    },
  },
  timeoutMs: 30_000,
  async execute(input, _tenantId) {
    const productName = (input.product_name as string).substring(0, 50);
    const description = input.description as string;
    const price = input.price as number;
    const condition = mapCondition((input.condition as string) || "USED");
    const categoryHint = (input.category as string) || "gastronomia";
    const brand = input.brand as string | undefined;
    const model = input.model as string | undefined;
    const imageUrls = (input.image_urls as string[]) || [];

    try {
      // 1. Resolve category
      const categoryId = getCategoryId(categoryHint);

      logger.info("[publish_to_allegro] Publishing", {
        productName,
        price,
        categoryId,
      });

      // 2. Get category parameters (best-effort)
      let parameters: Array<{ id: string; values: string[] }> = [];
      try {
        const paramResponse = await allegroApiRequest<{
          parameters: Array<{
            id: string;
            name: string;
            required: boolean;
            type: string;
            restrictions?: { allowedValues?: Array<{ value: string }> };
          }>;
        }>(`/sale/categories/${categoryId}/parameters`);

        for (const param of paramResponse.parameters) {
          if (!param.required) continue;

          let value: string | undefined;
          const pName = param.name.toLowerCase();

          if (pName.includes("marka") || param.id === "11323") {
            value = brand;
          } else if (pName.includes("model") || param.id === "11324") {
            value = model;
          } else if (pName.includes("stan")) {
            value = condition;
          }

          if (value) {
            if (param.restrictions?.allowedValues) {
              const allowed = param.restrictions.allowedValues.find(
                (v) => v.value.toLowerCase() === value!.toLowerCase(),
              );
              if (allowed) {
                parameters.push({ id: param.id, values: [allowed.value] });
              }
            } else {
              parameters.push({ id: param.id, values: [value] });
            }
          }
        }
      } catch (e) {
        logger.warn("[publish_to_allegro] Could not fetch category params", e);
      }

      // 3. Build offer
      const offer = {
        category: { id: categoryId },
        name: productName,
        description: {
          sections: [
            {
              items: [
                {
                  type: "TEXT",
                  content: description,
                },
              ],
            },
          ],
        },
        product: {
          condition,
          ...(parameters.length > 0 ? { parameters } : {}),
        },
        sellingMode: {
          format: "BUY_NOW",
          price: {
            amount: price.toFixed(2),
            currency: "PLN",
          },
        },
        ...(imageUrls.length > 0 ? { images: imageUrls.slice(0, 16) } : {}),
        location: {
          city: process.env.ALLEGRO_LOCATION_CITY || "Warszawa",
          province: process.env.ALLEGRO_LOCATION_PROVINCE || "mazowieckie",
          postCode: process.env.ALLEGRO_LOCATION_POSTCODE || "02-786",
        },
        delivery: {
          shippingRates: {
            id: "f041aa82-9700-4248-aed0-df298f766b25", // Odbiór osobisty
          },
          handlingTime: "PT24H",
        },
        payments: {
          invoice: "VAT",
        },
        publication: {
          status: "ACTIVE",
        },
      };

      // 4. Create offer
      const result = await allegroApiRequest<{ id: string }>("/sale/offers", {
        method: "POST",
        body: JSON.stringify(offer),
      });

      const isSandbox = process.env.ALLEGRO_SANDBOX === "true";
      const offerUrl = isSandbox
        ? `https://allegro.pl.allegrosandbox.pl/oferta/${result.id}`
        : `https://allegro.pl/oferta/${result.id}`;

      logger.info("[publish_to_allegro] Published!", {
        offerId: result.id,
        offerUrl,
      });

      return JSON.stringify({
        success: true,
        offerId: result.id,
        url: offerUrl,
        category: categoryId,
        price: `${price} PLN`,
        message: `Oferta "${productName}" opublikowana na Allegro: ${offerUrl}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[publish_to_allegro] Failed:", { error: message });
      return JSON.stringify({
        success: false,
        error: message,
        hint: "Sprawdź ALLEGRO_CLIENT_ID i ALLEGRO_CLIENT_SECRET w env vars. Upewnij się że credentials są ważne.",
      });
    }
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export const marketplaceTools: V3ToolDefinition[] = [publishToAllegroTool];
