"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { BurgerMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ConnectionBadge } from "@/components/status-badge";
import { FileIcon } from "@/components/file-icon";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { buildZip, downloadBlob } from "@/lib/files/zip";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import type { ReceiverEngineState } from "../engine";

/**
 * Completion state for the receiver: burger served + stats + downloads.
 * The ZIP is built in this browser from already-received data — it never
 * passes through the server.
 */
export function ReceiverCompletion({ state }: { state: ReceiverEngineState }) {
  const reduceMotion = useReducedMotionSafe();
  const [zipping, setZipping] = useState(false);

  const completed = state.files?.filter((file) => file.status === "completed") ?? [];
  const downloadable = completed
    .map((file) => {
      const result = state.results[file.id];
      return result?.blob ? { name: file.name, blob: result.blob } : null;
    })
    .filter((entry): entry is { name: string; blob: Blob } => entry !== null);

  const handleDownloadAll = async () => {
    if (zipping) return;
    setZipping(true);
    try {
      if (downloadable.length === 1) {
        downloadBlob(downloadable[0].blob, downloadable[0].name);
      } else if (downloadable.length > 1) {
        const zip = await buildZip(downloadable);
        downloadBlob(zip, "file-burger-transfer.zip");
      }
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-10">
        {reduceMotion ? (
          <BurgerMark className="mx-auto h-14 w-16" />
        ) : (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            <BurgerMark className="mx-auto h-14 w-16" />
          </motion.div>
        )}
        <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
          Burger served! 🍔
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your files were successfully transferred and verified.
        </p>

        <dl className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-3 text-left sm:grid-cols-4">
          <Stat label="Files" value={String(completed.length)} />
          <Stat label="Total size" value={formatBytes(state.totalSize)} />
          <Stat label="Duration" value={formatDuration(state.durationSeconds)} />
          <Stat label="Avg speed" value={formatSpeed(state.avgSpeed)} />
        </dl>

        <div className="mt-6 flex justify-center">
          <ConnectionBadge quality={state.connectionQuality} />
        </div>
      </div>

      {downloadable.length > 0 && (
        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={() => void handleDownloadAll()} loading={zipping}>
            {downloadable.length > 1 ? "Download All (ZIP)" : "Download"}
          </Button>
        </div>
      )}

      {completed.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h3 className="text-sm font-semibold tracking-tight">Received files</h3>
          <ul className="mt-3.5 space-y-2">
            {completed.map((file) => {
              const blob = state.results[file.id]?.blob ?? null;
              return (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                      <FileIcon name={file.name} />
                    </div>
                    <span className="min-w-0 truncate text-sm" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatBytes(file.size)}
                    </span>
                    {blob ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadBlob(blob, file.name)}
                        aria-label={`Download ${file.name}`}
                      >
                        Download
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Saved to disk</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
