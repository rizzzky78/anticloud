/**
 * Build safe, unique entry names for ZIP archives.
 *
 * Display names are user-controlled: strip path separators and control
 * characters (no zip-slip), and de-duplicate so two files called `report.pdf`
 * become `report.pdf` and `report (2).pdf` instead of one overwriting the other.
 */
export function createZipNamer() {
  const used = new Set<string>();

  return function entryName(displayName: string): string {
    const cleaned =
      displayName
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[\/]+/g, "_")
        .replace(/^\.+/, "")
        .trim() || "file";

    if (!used.has(cleaned.toLowerCase())) {
      used.add(cleaned.toLowerCase());
      return cleaned;
    }

    const dot = cleaned.lastIndexOf(".");
    const base = dot > 0 ? cleaned.slice(0, dot) : cleaned;
    const ext = dot > 0 ? cleaned.slice(dot) : "";
    for (let n = 2; ; n++) {
      const candidate = `${base} (${n})${ext}`;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        return candidate;
      }
    }
  };
}
