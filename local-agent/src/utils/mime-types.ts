/**
 * Extension → MIME type mapping (mirrors ExoSkull API)
 */

export const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export const ALLOWED_EXTENSIONS = new Set(Object.keys(EXT_TO_MIME));

export function getExtension(filePath: string): string {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function isSupported(filePath: string): boolean {
  return ALLOWED_EXTENSIONS.has(getExtension(filePath));
}

export function getMimeType(filePath: string): string | null {
  const ext = getExtension(filePath);
  return EXT_TO_MIME[ext] || null;
}
