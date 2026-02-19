/**
 * IORS Google Drive Tools
 *
 * Exposes Google Drive adapter as IORS tools callable by AI.
 */

import type { ToolDefinition } from "./shared";
import {
  searchFiles,
  readFileContent,
  listFiles,
  uploadFile,
  createFolder,
} from "@/lib/integrations/google-drive-adapter";

export const googleDriveTools: ToolDefinition[] = [
  {
    definition: {
      name: "search_drive",
      description:
        "Przeszukaj Google Drive uzytkownika. Znajdz pliki po nazwie lub tresci. Uzywaj gdy user pyta o pliki, dokumenty na Dysku.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Fraza wyszukiwania (nazwa pliku lub tresc)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await searchFiles(tenantId, input.query as string);
        if (!result.ok) return result.error || "Blad wyszukiwania na Drive.";
        return result.results!;
      } catch (err) {
        return `Blad Google Drive: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "read_drive_file",
      description:
        "Przeczytaj tresc pliku z Google Drive (DOCX, PDF, Google Docs, TXT, CSV). Uzywaj po search_drive gdy user chce zobaczyc tresc pliku.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_id: {
            type: "string",
            description: "ID pliku z wynikow search_drive",
          },
        },
        required: ["file_id"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await readFileContent(tenantId, input.file_id as string);
        if (!result.ok) return result.error || "Nie udalo sie odczytac pliku.";

        let output = result.content || "(brak tresci)";
        if (result.images?.length) {
          output += `\n\nZnaleziono ${result.images.length} obrazow w dokumencie.`;
        }
        return output;
      } catch (err) {
        return `Blad odczytu pliku: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 30000,
  },
  {
    definition: {
      name: "list_drive_files",
      description:
        "Pokaz liste plikow na Google Drive (ostatnio modyfikowane). Uzywaj gdy user pyta co jest na dysku.",
      input_schema: {
        type: "object" as const,
        properties: {
          folder_id: {
            type: "string",
            description: "ID folderu (opcjonalnie — domyslnie root)",
          },
          limit: {
            type: "number",
            description: "Ile plikow pokazac (domyslnie 15)",
          },
        },
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await listFiles(
          tenantId,
          undefined,
          (input.limit as number) || 15,
          input.folder_id as string,
        );
        if (!result.ok) return result.error || "Blad listowania plikow.";
        if (!result.files?.length) return "Dysk jest pusty lub brak dostepu.";

        const lines = result.files.map((f) => {
          const date = new Date(f.modifiedTime).toLocaleDateString("pl-PL");
          const size = f.size ? `${Math.round(parseInt(f.size) / 1024)}KB` : "";
          return `- ${f.name} [${f.mimeType.split(".").pop() || f.mimeType}] ${size} (${date}) id:${f.id}`;
        });

        return `Pliki na Drive (${result.files.length}):\n${lines.join("\n")}`;
      } catch (err) {
        return `Blad listowania: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
  {
    definition: {
      name: "upload_drive_file",
      description: "Prześlij plik tekstowy na Google Drive użytkownika.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_name: {
            type: "string",
            description: "Nazwa pliku (np. notes.txt)",
          },
          content: { type: "string", description: "Treść pliku" },
          mime_type: {
            type: "string",
            description: "Typ MIME (domyślnie text/plain)",
          },
          folder_id: {
            type: "string",
            description: "ID folderu docelowego (opcjonalnie)",
          },
        },
        required: ["file_name", "content"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await uploadFile(
          tenantId,
          input.file_name as string,
          input.content as string,
          (input.mime_type as string) || "text/plain",
          input.folder_id as string | undefined,
        );
        if (!result.ok) return result.error || "Nie udało się przesłać pliku.";
        return result.formatted!;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
    timeoutMs: 30000,
  },
  {
    definition: {
      name: "create_drive_folder",
      description: "Utwórz nowy folder na Google Drive.",
      input_schema: {
        type: "object" as const,
        properties: {
          folder_name: { type: "string", description: "Nazwa folderu" },
          parent_folder_id: {
            type: "string",
            description: "ID folderu nadrzędnego (opcjonalnie)",
          },
        },
        required: ["folder_name"],
      },
    },
    execute: async (input, tenantId) => {
      try {
        const result = await createFolder(
          tenantId,
          input.folder_name as string,
          input.parent_folder_id as string | undefined,
        );
        if (!result.ok)
          return result.error || "Nie udało się utworzyć folderu.";
        return result.formatted!;
      } catch (err) {
        return `Błąd: ${err instanceof Error ? err.message : err}`;
      }
    },
  },
];
