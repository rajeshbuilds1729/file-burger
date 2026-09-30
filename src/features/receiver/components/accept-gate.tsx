"use client";

import { useState } from "react";
import { Check, HardDrive, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileIcon } from "@/components/file-icon";
import { formatBytes } from "@/lib/format";
import { supportsFileSystemAccess } from "@/lib/files/sink";
import type { FileMeta } from "@/types/transfer";

/**
 * Receiver consent gate: shows what's on offer and requires an explicit
 * accept. Nothing is transferred before this. Optional password.
 */
export function AcceptGate({
  files,
  requiresPassword,
  onVerify,
  onAccept,
  onDecline,
  connecting,
}: {
  files: FileMeta[];
  requiresPassword: boolean;
  onVerify: (password: string) => Promise<{ ok: boolean; error?: { message: string } }>;
  onAccept: (options: { saveToDisk: boolean }) => void;
  onDecline: () => void;
  connecting: boolean;
}) {
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveToDisk, setSaveToDisk] = useState(false);

  const totalSize = files.reduce((total, file) => total + file.size, 0);
  const canAccept = !requiresPassword || verified;
  const fsaAvailable = supportsFileSystemAccess();

  const handleVerify = async () => {
    if (!password || verifying) return;
    setVerifying(true);
    setError(null);
    const result = await onVerify(password);
    setVerifying(false);
    if (result.ok) {
      setVerified(true);
    } else {
      setError(result.error?.message ?? "That password doesn't match.");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2.5">
        <h2 className="text-base font-semibold tracking-tight">
          {connecting
            ? "Connecting…"
            : `Someone wants to send you ${files.length} ${
                files.length === 1 ? "file" : "files"
              }`}
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {connecting
          ? "Establishing a direct connection with the sender."
          : `${formatBytes(totalSize)} total · nothing is transferred until you accept.`}
      </p>

      <ul className="mt-4 space-y-2" aria-label="Files offered">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-muted/60 p-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
              <FileIcon name={file.name} />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          </li>
        ))}
      </ul>

      {requiresPassword && !verified && (
        <div className="mt-5">
          <label
            htmlFor="receive-password"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            Password required
          </label>
          <div className="flex gap-2">
            <Input
              id="receive-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleVerify();
              }}
              placeholder="Enter the password from the sender"
              autoComplete="off"
              maxLength={128}
            />
            <Button
              variant="secondary"
              onClick={() => void handleVerify()}
              loading={verifying}
              disabled={!password}
            >
              Unlock
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {requiresPassword && verified && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-success">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Password verified
        </p>
      )}

      {fsaAvailable && (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/60 p-3.5">
          <input
            type="checkbox"
            checked={saveToDisk}
            onChange={(event) => setSaveToDisk(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              Save directly to disk
            </span>
            <br />
            Pick a folder when accepting — files stream straight to disk with
            no memory limits. (Chromium browsers)
          </span>
        </label>
      )}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <Button
          size="lg"
          className="flex-1"
          disabled={!canAccept}
          onClick={() => onAccept({ saveToDisk })}
        >
          Accept Transfer
        </Button>
        <Button size="lg" variant="outline" className="flex-1" onClick={onDecline}>
          Decline
        </Button>
      </div>

      <p className="mt-4 inline-flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {
            "Files travel directly from the sender\u2019s browser over an encrypted connection. Scan files with your own tools before opening them \u2014 the password protects this transfer session, not your device."
          }
        </span>
      </p>
    </div>
  );
}
