/**
 * Extension → MIME type mapping + blacklist-based filtering.
 * Blacklist approach: exclude known junk, allow everything else.
 */

export const EXT_TO_MIME: Record<string, string> = {
  // Documents
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  rst: "text/x-rst",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  // Office
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Data
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  xml: "text/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "application/toml",
  // Code
  js: "text/javascript",
  ts: "text/typescript",
  jsx: "text/jsx",
  tsx: "text/tsx",
  py: "text/x-python",
  rb: "text/x-ruby",
  go: "text/x-go",
  rs: "text/x-rust",
  java: "text/x-java",
  c: "text/x-c",
  cpp: "text/x-c++",
  h: "text/x-c",
  cs: "text/x-csharp",
  php: "text/x-php",
  swift: "text/x-swift",
  kt: "text/x-kotlin",
  sh: "text/x-shellscript",
  bash: "text/x-shellscript",
  ps1: "text/x-powershell",
  bat: "text/x-bat",
  sql: "application/sql",
  r: "text/x-r",
  lua: "text/x-lua",
  // Config
  ini: "text/plain",
  cfg: "text/plain",
  conf: "text/plain",
  env: "text/plain",
  properties: "text/plain",
  // Web
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  scss: "text/x-scss",
  less: "text/x-less",
  svg: "image/svg+xml",
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  raw: "image/x-raw",
  cr2: "image/x-canon-cr2",
  nef: "image/x-nikon-nef",
  arw: "image/x-sony-arw",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/postscript",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wma: "audio/x-ms-wma",
  m4a: "audio/mp4",
  opus: "audio/opus",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
  m4v: "video/mp4",
  "3gp": "video/3gpp",
  // Archives (useful to preserve)
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/x-rar-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  bz2: "application/x-bzip2",
  xz: "application/x-xz",
  // Ebooks
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  // Fonts
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  // 3D/CAD
  stl: "model/stl",
  obj: "model/obj",
  fbx: "application/octet-stream",
  blend: "application/x-blender",
  // Misc
  log: "text/plain",
  ics: "text/calendar",
  vcf: "text/vcard",
};

/**
 * Extensions to EXCLUDE — system binaries, build artifacts, caches.
 */
export const EXCLUDED_EXTENSIONS = new Set([
  // System binaries
  "exe", "dll", "sys", "msi", "drv", "cpl", "scr",
  // Build artifacts
  "o", "obj", "lib", "a", "so", "dylib", "pdb",
  "class", "jar", "war", "ear",
  "pyc", "pyo", "pyi",
  // Disk images
  "iso", "img", "vmdk", "vhd", "vhdx", "qcow2",
  // Windows system
  "dat", "reg", "lnk", "cab", "wim",
  // Sourcemaps (large, regenerable)
  "map",
  // Database files (binary, often locked)
  "db", "sqlite", "sqlite3", "mdb", "accdb",
  // Temp
  "tmp", "temp", "swp", "swo",
  // Package caches
  "tgz", "whl", "egg",
]);

export function getExtension(filePath: string): string {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/**
 * Blacklist check: returns true if the file should be EXCLUDED.
 */
export function isExcluded(filePath: string): boolean {
  return EXCLUDED_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Returns true if the file should be synced (not excluded).
 */
export function isSupported(filePath: string): boolean {
  const ext = getExtension(filePath);
  if (!ext) return false; // no extension = skip
  return !EXCLUDED_EXTENSIONS.has(ext);
}

export function getMimeType(filePath: string): string {
  const ext = getExtension(filePath);
  return EXT_TO_MIME[ext] || "application/octet-stream";
}
