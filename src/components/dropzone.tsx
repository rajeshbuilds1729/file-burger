"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Plus, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";
import { usePaste } from "@/hooks/use-paste";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import { cn } from "@/lib/utils";

export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** hero: large primary dropzone; compact: "add more files" variant. */
  variant?: "hero" | "compact";
  title?: string;
  subtitle?: string;
  pasteEnabled?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Drag-and-drop + click-to-browse + clipboard paste.
 * Fully keyboard accessible: the dropzone is a focusable button; Enter or
 * Space opens the file picker.
 */
export function Dropzone({
  onFiles,
  variant = "hero",
  title,
  subtitle,
  pasteEnabled = true,
  disabled = false,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const reduceMotion = useReducedMotionSafe();

  const isHero = variant === "hero";
  const heading = title ?? (isHero ? "Drop your files here" : "Add more files");
  const sub = subtitle ?? (isHero ? "or click to browse" : "or click to browse");

  const handleFiles = useCallback(
    (files: File[]) => {
      if (disabled || files.length === 0) return;
      onFiles(files);
    },
    [disabled, onFiles],
  );

  usePaste(handleFiles, pasteEnabled && !disabled);

  const onDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      if (disabled) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      handleFiles(files);
    },
    [disabled, handleFiles],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        inputRef.current?.click();
      }
    },
    [disabled],
  );

  const icon = useMemo(
    () =>
      isHero ? (
        <UploadCloud className="h-10 w-10 text-accent sm:h-12 sm:w-12" aria-hidden="true" />
      ) : (
        <Plus className="h-5 w-5 text-accent" aria-hidden="true" />
      ),
    [isHero],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${heading}. ${sub}. Opens the file picker.`}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-active={dragActive}
      className={cn(
        "dropzone-border group flex cursor-pointer flex-col items-center justify-center rounded-2xl text-center",
        isHero ? "min-h-56 gap-3 p-8 sm:min-h-72 sm:gap-4 sm:p-10" : "min-h-28 gap-2 p-5",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          handleFiles(files);
          event.target.value = "";
        }}
      />
      {reduceMotion ? (
        icon
      ) : (
        <motion.div
          animate={dragActive ? { scale: 1.12, y: -2 } : { scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
        >
          {icon}
        </motion.div>
      )}
      <div>
        <p className={cn("font-semibold tracking-tight", isHero ? "text-lg sm:text-xl" : "text-sm")}>
          {heading}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      </div>
      {isHero && pasteEnabled && (
        <p className="text-xs text-muted-foreground/80">
          You can also paste files from your clipboard (Ctrl/Cmd+V)
        </p>
      )}
    </div>
  );
}
