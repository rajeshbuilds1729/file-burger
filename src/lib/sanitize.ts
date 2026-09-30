/**
 * Filename sanitization shared by the server (room creation validation) and
 * the client (ZIP entries, disk writes). Prevents path traversal and hostile
 * names without breaking legitimate filenames.
 */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(CONTROL_CHARS, "")
    // Path separators become underscores.
    .replace(/[/\\]/g, "_")
    // Windows drive prefixes.
    .replace(/^([a-zA-Z]):/, "$1_")
    // Traversal sequences.
    .replace(/\.\.(\/|\\|$)/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : "file";
}
