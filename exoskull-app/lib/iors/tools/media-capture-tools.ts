/**
 * Media Capture IORS Tools
 *
 * Backend API for browser media capture. These tools emit SSE events
 * that instruct the frontend to capture screen/camera/microphone.
 * The actual capture happens client-side; results come back as messages.
 *
 * Also includes analyze_image which sends images to a vision model.
 */

import type { ToolDefinition } from "./shared";
import { logger } from "@/lib/logger";

export const mediaCaptureTools: ToolDefinition[] = [
  {
    definition: {
      name: "request_screenshot",
      description:
        "Poproś użytkownika o screenshot ekranu. " +
        "Frontend pokaże dialog z prośbą o udostępnienie ekranu. " +
        "Screenshot zostanie wysłany jako załącznik w następnej wiadomości.",
      input_schema: {
        type: "object" as const,
        properties: {
          reason: {
            type: "string",
            description:
              "Dlaczego potrzebujesz screenshota (widoczne dla usera)",
          },
        },
        required: ["reason"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const reason = input.reason as string;
      // Return SSE directive for frontend
      return (
        `__SSE__{"type":"media_request","media_type":"screenshot","reason":"${reason.replace(/"/g, '\\"')}"}__SSE__` +
        `Poprosiłem o screenshot. Powód: ${reason}. Czekam na odpowiedź użytkownika.`
      );
    },
  },

  {
    definition: {
      name: "request_camera_photo",
      description:
        "Poproś użytkownika o zdjęcie z kamery. " +
        "Frontend włączy kamerę i pozwoli zrobić zdjęcie. " +
        "Zdjęcie zostanie wysłane jako załącznik w następnej wiadomości.",
      input_schema: {
        type: "object" as const,
        properties: {
          reason: {
            type: "string",
            description: "Dlaczego potrzebujesz zdjęcia (widoczne dla usera)",
          },
        },
        required: ["reason"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const reason = input.reason as string;
      return (
        `__SSE__{"type":"media_request","media_type":"camera","reason":"${reason.replace(/"/g, '\\"')}"}__SSE__` +
        `Poprosiłem o zdjęcie z kamery. Powód: ${reason}. Czekam na odpowiedź użytkownika.`
      );
    },
  },

  {
    definition: {
      name: "analyze_image",
      description:
        "Przeanalizuj obraz (URL lub base64) za pomocą modelu wizyjnego. " +
        "Opisze zawartość, wykryje tekst (OCR), obiekty, sceny. " +
        "Użyj po otrzymaniu screenshota lub zdjęcia od użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          image_url: {
            type: "string",
            description: "URL obrazu do analizy (publiczny URL lub data: URI)",
          },
          question: {
            type: "string",
            description:
              "Co chcesz wiedzieć o obrazie? (domyślnie: opisz zawartość)",
          },
        },
        required: ["image_url"],
      },
    },
    timeoutMs: 30_000,
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const imageUrl = input.image_url as string;
      const question =
        (input.question as string) ||
        "Opisz szczegółowo co widzisz na tym obrazie.";

      if (!imageUrl) {
        return "Error: podaj image_url.";
      }

      try {
        // Use Gemini Vision for image analysis (cheaper than Claude)
        const geminiKey =
          process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
        if (!geminiKey) {
          return "Error: brak klucza API do analizy obrazów (GOOGLE_AI_API_KEY).";
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: question },
                    {
                      inline_data: imageUrl.startsWith("data:")
                        ? {
                            mime_type: imageUrl.split(";")[0].split(":")[1],
                            data: imageUrl.split(",")[1],
                          }
                        : undefined,
                      ...(imageUrl.startsWith("http")
                        ? { file_data: { file_uri: imageUrl } }
                        : {}),
                    },
                  ],
                },
              ],
            }),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          return `Error: analiza obrazu nie powiodła się (${response.status}): ${errText.slice(0, 200)}`;
        }

        const data = await response.json();
        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Nie udało się odczytać analizy.";

        return `Analiza obrazu:\n${text}`;
      } catch (err) {
        logger.error("[MediaCapture] Image analysis failed:", {
          error: err instanceof Error ? err.message : String(err),
        });
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },
];
