/**
 * IORS Emotion Tools
 *
 * - tau_assess: Run Tau 4-quadrant decision assessment on a situation
 */

import type { ToolDefinition } from "./index";

export const emotionTools: ToolDefinition[] = [
  {
    definition: {
      name: "tau_assess",
      description:
        "Przeprowadź analizę Tau (4 kwadranty) dla sytuacji decyzyjnej. Użyj gdy user stoi przed wyborem i chce zrozumieć emocjonalny wymiar opcji. Zwraca ocenę każdej opcji w 4 kwadrantach: known_want (tego chcę), known_unwant (tego nie chcę), unknown_want (może chcę — nieświadomie), unknown_unwant (może nie chcę — ukryty opór).",
      input_schema: {
        type: "object" as const,
        properties: {
          situation: {
            type: "string",
            description: "Opis sytuacji decyzyjnej",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Lista opcji do oceny (2-5)",
          },
        },
        required: ["situation", "options"],
      },
    },
    execute: async (input) => {
      const situation = input.situation as string;
      const options = input.options as string[];

      if (!options || options.length < 2) {
        return "Potrzebuję przynajmniej 2 opcje do oceny.";
      }

      // Build structured Tau assessment prompt
      // The assessment is returned as text for the AI to include in its response
      const assessmentLines = options.map((option, i) => {
        return `Opcja ${i + 1}: "${option}"
  - known_want: Co user ŚWIADOMIE chce z tej opcji?
  - known_unwant: Czego user ŚWIADOMIE nie chce?
  - unknown_want: Co NIEŚWIADOMIE może go przyciągać?
  - unknown_unwant: Jaki UKRYTY opór może się pojawić?`;
      });

      return `## Analiza Tau — ${situation}

Oceń każdą opcję w 4 kwadrantach:

${assessmentLines.join("\n\n")}

Podsumowanie: Która opcja ma najzdrowszy profil Tau (wysoki known_want, niski unknown_unwant)?`;
    },
  },
];
