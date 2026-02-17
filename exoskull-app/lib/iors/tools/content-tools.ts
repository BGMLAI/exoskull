/**
 * IORS Content Generation Tools
 *
 * Exposes document, image, video, and social media generation as IORS tools.
 */

import type { ToolDefinition } from "./shared";
import { generateDocument } from "@/lib/content-generation/document-generator";
import {
  generateImage,
  estimateCost,
} from "@/lib/content-generation/image-generator";
import {
  generateVideo,
  estimateVideoCost,
} from "@/lib/content-generation/video-generator";
import {
  generateMultiChannelContent,
  generateContentCalendar,
} from "@/lib/content-generation/social-media-engine";
import type { DocumentType } from "@/lib/content-generation/document-generator";
import type { SocialChannel } from "@/lib/content-generation/social-media-engine";

export const contentTools: ToolDefinition[] = [
  // ─── Document generation ───
  {
    definition: {
      name: "generate_document",
      description:
        "Wygeneruj profesjonalny dokument: Word (docx), PDF, HTML, Markdown, prezentacje. Uzywaj gdy user potrzebuje raportu, listu, dokumentu, prezentacji.",
      input_schema: {
        type: "object" as const,
        properties: {
          type: {
            type: "string",
            enum: ["docx", "pdf", "html", "md"],
            description: "Format dokumentu",
          },
          title: {
            type: "string",
            description: "Tytul dokumentu",
          },
          description: {
            type: "string",
            description: "Co ma zawierac dokument — szczegolowy opis",
          },
          sections: {
            type: "array",
            items: { type: "string" },
            description: "Lista sekcji/rozdzialow (opcjonalnie)",
          },
          tone: {
            type: "string",
            enum: ["formal", "casual", "academic", "business"],
            description: "Ton dokumentu (domyslnie business)",
          },
          language: {
            type: "string",
            description: "Jezyk (domyslnie pl)",
          },
        },
        required: ["title", "description"],
      },
    },
    execute: async (input) => {
      try {
        const result = await generateDocument({
          type: (input.type as DocumentType) || "md",
          title: input.title as string,
          description: input.description as string,
          sections: input.sections as string[],
          tone:
            (input.tone as "formal" | "casual" | "academic" | "business") ||
            "business",
          language: (input.language as string) || "pl",
        });

        return `Dokument wygenerowany: "${result.filename}"\nFormat: ${input.type || "md"}\nSlow: ${result.wordCount}\n\n${result.content?.slice(0, 2000) || "(plik binarny — do pobrania)"}${result.content && result.content.length > 2000 ? "\n...(skrocone)" : ""}`;
      } catch (err) {
        return `Blad generowania dokumentu: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 55000,
  },

  // ─── Image generation ───
  {
    definition: {
      name: "generate_image",
      description:
        "Wygeneruj obraz AI. Flux (~$0.003) dla social media, DALL-E 3 (~$0.04) dla premium. Uzywaj gdy user chce obrazek, grafike, ilustracje.",
      input_schema: {
        type: "object" as const,
        properties: {
          prompt: {
            type: "string",
            description: "Opis obrazu (im bardziej szczegolowy, tym lepiej)",
          },
          quality: {
            type: "string",
            enum: ["draft", "standard", "premium"],
            description:
              "Jakosc: draft/standard (Flux $0.003), premium (DALL-E $0.04)",
          },
          size: {
            type: "string",
            enum: ["square", "landscape", "portrait", "story"],
            description:
              "Rozmiar: square (1:1), landscape (16:9), portrait (9:16), story (9:16 tall)",
          },
          style: {
            type: "string",
            description: "Styl: vivid, natural (tylko DALL-E)",
          },
        },
        required: ["prompt"],
      },
    },
    execute: async (input) => {
      try {
        const result = await generateImage({
          prompt: input.prompt as string,
          quality:
            (input.quality as "draft" | "standard" | "premium") || "standard",
          size:
            (input.size as "square" | "landscape" | "portrait" | "story") ||
            "square",
          style: input.style as string,
        });

        return `Obraz wygenerowany!\nProvider: ${result.provider}\nKoszt: $${result.cost.toFixed(3)}\nURL: ${result.url}\n${result.revisedPrompt ? `Zmieniony prompt: ${result.revisedPrompt}` : ""}`;
      } catch (err) {
        return `Blad generowania obrazu: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 120000,
  },

  // ─── Video generation ───
  {
    definition: {
      name: "generate_video",
      description:
        "Wygeneruj krotki film AI (Kling ~$0.07/5s). Do social media, reels, demo. Uzywaj gdy user chce film, animacje, video.",
      input_schema: {
        type: "object" as const,
        properties: {
          prompt: {
            type: "string",
            description: "Opis sceny/filmu",
          },
          duration_seconds: {
            type: "number",
            description: "Dlugosc w sekundach (5-10)",
          },
          image_url: {
            type: "string",
            description: "URL obrazu startowego (image-to-video, opcjonalnie)",
          },
          aspect_ratio: {
            type: "string",
            enum: ["16:9", "9:16", "1:1"],
            description:
              "Proporcje (16:9 landscape, 9:16 portrait/reel, 1:1 square)",
          },
        },
        required: ["prompt"],
      },
    },
    execute: async (input) => {
      const duration = (input.duration_seconds as number) || 5;
      const cost = estimateVideoCost(duration);

      try {
        const result = await generateVideo({
          prompt: input.prompt as string,
          durationSeconds: duration,
          imageUrl: input.image_url as string,
          aspectRatio:
            (input.aspect_ratio as "16:9" | "9:16" | "1:1") || "16:9",
        });

        if (result.status === "processing") {
          return `Film w trakcie generowania (task: ${result.taskId}). Moze to potrwac 1-5 minut. Szacowany koszt: $${cost.toFixed(2)}.`;
        }

        return `Film wygenerowany!\nProvider: ${result.provider}\nKoszt: $${result.cost.toFixed(2)}\nURL: ${result.url}`;
      } catch (err) {
        return `Blad generowania filmu: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 120000,
  },

  // ─── Social media content ───
  {
    definition: {
      name: "generate_social_content",
      description:
        "Wygeneruj tresci na social media — rozne dla kazdej platformy (LinkedIn, X, Instagram, YouTube, Facebook, TikTok). Spojny brand voice.",
      input_schema: {
        type: "object" as const,
        properties: {
          topic: {
            type: "string",
            description: "Temat/przekaz postow",
          },
          channels: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "linkedin",
                "x",
                "instagram",
                "youtube",
                "facebook",
                "tiktok",
              ],
            },
            description: "Platformy docelowe",
          },
          tone: {
            type: "string",
            enum: [
              "professional",
              "casual",
              "inspiring",
              "educational",
              "controversial",
            ],
            description: "Ton komunikacji",
          },
          audience: {
            type: "string",
            description: "Docelowa grupa odbiorcow",
          },
          cta: {
            type: "string",
            description: "Call-to-action (co ma zrobic odbiorca)",
          },
        },
        required: ["topic", "channels"],
      },
    },
    execute: async (input) => {
      try {
        const result = await generateMultiChannelContent({
          topic: input.topic as string,
          channels: (input.channels as SocialChannel[]) || ["linkedin", "x"],
          tone: (input.tone as "professional") || "professional",
          audience: input.audience as string,
          cta: input.cta as string,
        });

        const lines = [`Tresci na temat: "${result.topic}"`, ""];

        for (const ch of result.channels) {
          lines.push(
            `--- ${ch.channel.toUpperCase()} (${ch.characterCount} zn.) ---`,
          );
          lines.push(ch.text);
          if (ch.hashtags?.length)
            lines.push(`Hashtagi: ${ch.hashtags.join(" ")}`);
          if (ch.bestTime) lines.push(`Najlepszy czas: ${ch.bestTime}`);
          lines.push("");
        }

        if (result.imagePrompt)
          lines.push(`Sugerowany obraz: ${result.imagePrompt}`);
        if (result.scheduleSuggestion)
          lines.push(`Plan publikacji: ${result.scheduleSuggestion}`);

        return lines.join("\n");
      } catch (err) {
        return `Blad generowania tresci: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 55000,
  },
];
