import {
  FileIcon,
  FileImageIcon,
  FileVideoIcon,
  FileAudioIcon,
  FileTextIcon,
  FileCode2Icon,
  FileArchiveIcon,
} from "lucide-react";

export function getFileIcon(mimeType: string) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return FileImageIcon;
  if (mime.startsWith("video/")) return FileVideoIcon;
  if (mime.startsWith("audio/")) return FileAudioIcon;
  if (mime.startsWith("text/") || mime === "application/pdf" || mime.includes("document") || mime.includes("msword")) return FileTextIcon;
  if (
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("json") ||
    mime.includes("html") ||
    mime.includes("css") ||
    mime.includes("xml") ||
    mime.includes("yaml") ||
    mime.includes("toml")
  )
    return FileCode2Icon;
  if (
    mime.includes("zip") ||
    mime.includes("tar") ||
    mime.includes("gzip") ||
    mime.includes("rar") ||
    mime.includes("7z") ||
    mime.includes("archive") ||
    mime.includes("compressed")
  )
    return FileArchiveIcon;
  return FileIcon;
}
