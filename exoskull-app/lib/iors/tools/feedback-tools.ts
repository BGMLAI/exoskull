/**
 * IORS Feedback Tools
 *
 * Tools for capturing user feedback during conversation.
 * - submit_feedback: User rates or comments on IORS behavior
 * - get_feedback_summary: IORS reviews own feedback for self-improvement
 */

import type { ToolDefinition } from "./index";
import {
  submitFeedback,
  getFeedbackSummary,
  type FeedbackType,
} from "../feedback";

export const feedbackTools: ToolDefinition[] = [
  {
    definition: {
      name: "submit_feedback",
      description:
        "Zapisz feedback uzytkownika o IORS. Uzyj gdy user mowi 'dobra robota', 'to nie tak', 'zmien to', ocenia odpowiedz, zglasza blad, lub prosi o nowa funkcjonalnosc. Tez uzyj po kazdej wazniejszej akcji autonomicznej.",
      input_schema: {
        type: "object" as const,
        properties: {
          feedback_type: {
            type: "string",
            enum: [
              "response_quality",
              "personality",
              "action",
              "feature_request",
              "bug_report",
              "general",
            ],
            description:
              "Typ feedbacku: response_quality (ocena odpowiedzi), personality (styl IORS), action (ocena akcji), feature_request (nowa funkcja), bug_report (blad), general (ogolny)",
          },
          rating: {
            type: "number",
            description:
              "Ocena 1-5 (1=bardzo zle, 5=swietnie). Podaj jesli user wyrazil pozytywna/negatywna opinie.",
          },
          message: {
            type: "string",
            description:
              "Tresc feedbacku — co dokladnie user powiedzial lub co ocenia.",
          },
        },
        required: ["feedback_type"],
      },
    },
    execute: async (input, tenantId) => {
      const type = input.feedback_type as FeedbackType;
      const rating = input.rating as number | undefined;
      const message = input.message as string | undefined;

      const result = await submitFeedback(tenantId, {
        type,
        rating,
        message,
      });

      if (!result.success) {
        return "Nie udalo sie zapisac feedbacku. Sprobuj ponownie.";
      }

      if (rating && rating >= 4) {
        return "Dzieki za pozytywny feedback! Staram sie jak moge.";
      }
      if (rating && rating <= 2) {
        return "Dzieki za szczerosc. Zapisalem i bede sie poprawiac.";
      }
      return "Zapisalem Twoj feedback. Dzieki!";
    },
  },
  {
    definition: {
      name: "get_feedback_summary",
      description:
        "Sprawdz podsumowanie feedbacku uzytkownika. Uzyj gdy chcesz zobaczyc jak user ocenia IORS, lub gdy user pyta 'jak Ci idzie?', 'jaka jest Twoja ocena?'.",
      input_schema: {
        type: "object" as const,
        properties: {
          days: {
            type: "number",
            description: "Liczba dni wstecz (domyslnie 30)",
            default: 30,
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      const days = (input.days as number) || 30;
      const summary = await getFeedbackSummary(tenantId, days);

      if (summary.total === 0) {
        return `Brak feedbacku z ostatnich ${days} dni. Jak Ci sie ze mna pracuje? Mozesz powiedziec co myslisc!`;
      }

      const lines = [
        `Feedback z ostatnich ${days} dni:`,
        `- Lacznie: ${summary.total} opinii`,
        `- Srednia ocena: ${summary.avgRating}/5`,
        `- Pozytywne (4-5): ${summary.positive}`,
        `- Negatywne (1-2): ${summary.negative}`,
      ];

      const typeLines = Object.entries(summary.byType).map(
        ([type, data]) =>
          `  ${type}: ${data.count}x (avg ${Math.round(data.avgRating * 10) / 10}/5)`,
      );
      if (typeLines.length > 0) {
        lines.push("- Wedlug typu:", ...typeLines);
      }

      return lines.join("\n");
    },
  },
];
