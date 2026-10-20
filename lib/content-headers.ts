/**
 * Response headers for serving user-uploaded binaries from the app origin.
 *
 * Uploaded content is untrusted: the MIME type comes from the uploading client.
 * Serving `text/html` or `image/svg+xml` inline on the app origin would let an
 * upload execute script with the viewer's session (stored XSS). Rules:
 *   - Raster images, audio, video and PDF render inline.
 *   - Text-like types render inline but are always served as `text/plain`.
 *   - SVG renders inline only under a script-blocking CSP.
 *   - Everything else is forced to download (`attachment`).
 *   - `nosniff` everywhere, plus a sandbox CSP for non-PDF responses.
 */

const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
]);

const TEXT_LIKE_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-sh",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/sql",
]);

function baseType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

/** True when the type is rendered as plain text in previews. */
export function isTextLike(mimeType: string): boolean {
  const t = baseType(mimeType);
  return t.startsWith("text/") || TEXT_LIKE_TYPES.has(t);
}

function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  // ASCII fallback for old clients plus RFC 5987 UTF-8 name.
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Build safe Content-Type / Content-Disposition / security headers.
 *
 * @param forceDownload - serve as attachment regardless of type (`?download=1`).
 */
export function safeContentHeaders(
  mimeType: string,
  filename: string,
  { forceDownload = false }: { forceDownload?: boolean } = {},
): Record<string, string> {
  const t = baseType(mimeType);
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
  };

  if (forceDownload) {
    headers["Content-Type"] = "application/octet-stream";
    headers["Content-Disposition"] = contentDisposition("attachment", filename);
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
    return headers;
  }

  if (t === "application/pdf") {
    // Chrome's PDF viewer does not render under a CSP sandbox.
    headers["Content-Type"] = t;
    headers["Content-Disposition"] = contentDisposition("inline", filename);
    return headers;
  }

  if (INLINE_IMAGE_TYPES.has(t) || t.startsWith("video/") || t.startsWith("audio/")) {
    headers["Content-Type"] = t;
    headers["Content-Disposition"] = contentDisposition("inline", filename);
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
    return headers;
  }

  if (t === "image/svg+xml") {
    headers["Content-Type"] = t;
    headers["Content-Disposition"] = contentDisposition("inline", filename);
    headers["Content-Security-Policy"] =
      "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    return headers;
  }

  if (isTextLike(t)) {
    headers["Content-Type"] = "text/plain; charset=utf-8";
    headers["Content-Disposition"] = contentDisposition("inline", filename);
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
    return headers;
  }

  headers["Content-Type"] = "application/octet-stream";
  headers["Content-Disposition"] = contentDisposition("attachment", filename);
  headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
  return headers;
}
