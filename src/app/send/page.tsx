"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { KeyRound, Rocket } from "lucide-react";
import { Dropzone } from "@/components/dropzone";
import { FileQueue } from "@/components/file-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/error-state";
import { useSenderCreation, clearQueue } from "@/features/sender/use-sender";
import { addSelectedFiles, removeSelectedFile, getSelectedFiles, type SelectedFile } from "@/lib/files/client-store";

import { formatBytes } from "@/lib/format";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

export default function SendPage() {
  const router = useRouter();
  const [files, setFiles] = useState<SelectedFile[]>(() => getSelectedFiles());
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const reduceMotion = useReducedMotionSafe();

  const { state, createTransfer } = useSenderCreation();

  const totalSize = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files],
  );

  const handleFiles = useCallback((incoming: File[]) => {
    // addSelectedFiles syncs the module store (read by createTransfer).
    setFiles(addSelectedFiles(incoming));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setFiles(removeSelectedFile(id));
  }, []);

  const handleCreate = useCallback(async () => {
    if (files.length === 0 || creating) return;
    setCreating(true);
    const activePassword = passwordEnabled && password.length > 0 ? password : null;
    const result = await createTransfer(activePassword);
    if (result) {
      clearQueue();
      router.push(`/send/${result.roomId}`);
    } else {
      setCreating(false);
    }
  }, [files.length, creating, passwordEnabled, password, createTransfer, router]);

  // Engine error from creation (network, validation, password).
  const creationError = state.phase === "failed" ? state.error : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Send files
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Files stay on your device until someone accepts the transfer.
        </p>
      </header>

      {creationError && (
        <div className="mb-6">
          <ErrorState error={creationError} title="Couldn't create the transfer" />
        </div>
      )}

      <section aria-label="File selection">
        <FileQueue files={files} onRemove={handleRemove} />
        <div className="mt-3">
          <Dropzone onFiles={handleFiles} variant="compact" />
        </div>
        {files.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
            {files.length} {files.length === 1 ? "file" : "files"} ·{" "}
            {formatBytes(totalSize)} total
          </p>
        )}
      </section>

      <section aria-label="Transfer options" className="mt-8">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-accent" aria-hidden="true" />
                <p className="text-sm font-semibold">Require password</p>
              </div>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {"The recipient must enter this password before the transfer is accepted. It protects access to the transfer session \u2014 not the recipient\u2019s device after download. The password is never sent to the server, only a derived verifier."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={passwordEnabled}
              aria-label="Require password"
              onClick={() => setPasswordEnabled((value) => !value)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                passwordEnabled ? "bg-accent" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  passwordEnabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {passwordEnabled && (
            <div className="mt-4">
              <label
                htmlFor="transfer-password"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                Password
              </label>
              <Input
                id="transfer-password"
                type="text"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="e.g. extra-fries-42"
                autoComplete="off"
                maxLength={128}
              />
            </div>
          )}
        </div>
      </section>

      <div className="mt-8 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          The transfer link expires automatically. Keep this tab open until the
          transfer finishes.
        </p>
        {reduceMotion ? (
          <Button
            size="lg"
            onClick={handleCreate}
            loading={creating}
            disabled={files.length === 0}
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            Create transfer
          </Button>
        ) : (
          <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}>
            <Button
              size="lg"
              onClick={handleCreate}
              loading={creating}
              disabled={files.length === 0}
              className="w-full sm:w-auto"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              Create transfer
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
