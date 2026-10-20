import { z } from "zod";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const MAX_SEGMENT = 128;
const MAX_DEPTH = 32;

/**
 * Normalize a virtual folder path to the canonical `/a/b` form (root = `/`).
 * Collapses duplicate slashes, trims segments, drops `.`, and rejects `..`
 * and over-long/over-deep paths. Returns null when the path is invalid.
 */
export function normalizeFolderPath(input: string): string | null {
  const segments: string[] = [];
  for (const raw of input.replace(/\/g, "/").split("/")) {
    const seg = raw.replace(CONTROL_CHARS, "").trim();
    if (seg === "" || seg === ".") continue;
    if (seg === ".." || seg.length > MAX_SEGMENT) return null;
    segments.push(seg);
  }
  if (segments.length > MAX_DEPTH) return null;
  return "/" + segments.join("/");
}

/** Zod schema producing a normalized folder path. */
export const folderPathSchema = z
  .string()
  .max(2048)
  .transform((v, ctx) => {
    const normalized = normalizeFolderPath(v);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message: "Invalid folder path" });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Sanitize a user-visible file name: no control characters or path
 * separators, trimmed, at most 255 characters.
 */
export function sanitizeDisplayName(input: string): string {
  return input
    .replace(CONTROL_CHARS, "")
    .replace(/[\/]+/g, "_")
    .trim()
    .slice(0, 255);
}

/** Zod schema producing a sanitized, non-empty display name. */
export const displayNameSchema = z
  .string()
  .max(1024)
  .transform(sanitizeDisplayName)
  .pipe(z.string().min(1, "Name is required"));

/** A syntactically valid MIME type (`type/subtype`, optional parameters dropped). */
export const mimeTypeSchema = z
  .string()
  .max(127)
  .transform((v) => v.split(";")[0].trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/, "Invalid MIME type"),
  );
