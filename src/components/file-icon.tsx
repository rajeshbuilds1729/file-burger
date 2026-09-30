"use client";

import { useEffect, useState } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";
import { fileExtension } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  txt: FileText,
  md: FileText,
  rtf: FileText,
  zip: FileArchive,
  rar: FileArchive,
  "7z": FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  svg: FileImage,
  mp4: FileVideo,
  mov: FileVideo,
  avi: FileVideo,
  mkv: FileVideo,
  webm: FileVideo,
  mp3: FileAudio,
  wav: FileAudio,
  flac: FileAudio,
  ogg: FileAudio,
  csv: FileSpreadsheet,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  js: FileCode,
  ts: FileCode,
  tsx: FileCode,
  jsx: FileCode,
  json: FileCode,
  html: FileCode,
  css: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
};

/** Icon or image thumbnail for a file, by extension. */
export function FileIcon({
  name,
  previewUrl,
  className,
}: {
  name: string;
  /** Optional object URL for an image thumbnail. */
  previewUrl?: string | null;
  className?: string;
}) {
  if (previewUrl) {
    // Local object URLs, not remote images.
    return (
      <img
        src={previewUrl}
        alt=""
        className={cn("h-full w-full rounded-lg object-cover", className)}
        loading="lazy"
      />
    );
  }
  const extension = fileExtension(name);
  const Icon = ICON_MAP[extension] ?? File;
  return (
    <Icon className={cn("h-5 w-5 text-accent", className)} aria-hidden="true" />
  );
}

/**
 * Manage an object URL for an image file (revoked on unmount and on file
 * change). State updates are deferred to a microtask so the effect doesn't
 * trigger cascading renders.
 */
export function useImagePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    queueMicrotask(() => {
      if (cancelled) return;
      const isImage =
        file &&
        (file.type.startsWith("image/") ||
          /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name));
      if (!isImage) {
        setUrl((current) => (current === null ? current : null));
        return;
      }
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return url;
}
