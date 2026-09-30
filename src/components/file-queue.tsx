"use client";

import { X } from "lucide-react";
import { FileIcon, useImagePreview } from "./file-icon";
import { Badge } from "./ui/badge";
import { fileExtension, formatBytes } from "@/lib/format";
import { TRANSFER } from "@/lib/config";
import type { SelectedFile } from "@/lib/files/client-store";

export interface FileQueueProps {
  files: SelectedFile[];
  onRemove: (id: string) => void;
  className?: string;
}

/**
 * File queue shown during selection: filename, extension, size, thumbnail
 * when appropriate, remove button. Duplicate filenames are supported —
 * each card keeps its own identity.
 */
export function FileQueue({ files, onRemove, className }: FileQueueProps) {
  return (
    <ul className={`space-y-2.5 ${className ?? ""}`} aria-label="Selected files">
      {files.map((entry) => (
        <FileCard key={entry.id} entry={entry} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function FileCard({
  entry,
  onRemove,
}: {
  entry: SelectedFile;
  onRemove: (id: string) => void;
}) {
  const preview = useImagePreview(entry.file);
  const extension = fileExtension(entry.name);
  const isLarge = entry.size > TRANSFER.largeFileWarningBytes;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent-soft">
        <FileIcon name={entry.name} previewUrl={preview} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={entry.name}>
          {entry.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatBytes(entry.size)}
          </span>
          {extension && (
            <Badge tone="neutral" className="uppercase">
              {extension}
            </Badge>
          )}
          {isLarge && (
            <Badge tone="warning">Large file — keep both tabs open</Badge>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
        aria-label={`Remove ${entry.name} from the queue`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}
