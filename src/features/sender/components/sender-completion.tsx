"use client";

import { motion } from "framer-motion";
import { BurgerMark } from "@/components/logo";
import { ConnectionBadge } from "@/components/status-badge";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import type { SenderEngineState } from "../engine";

/** Completion state for the sender: burger served + stats. */
export function SenderCompletion({ state }: { state: SenderEngineState }) {
  const reduceMotion = useReducedMotionSafe();
  const completedReceivers = state.receivers.filter(
    (receiver) => receiver.state === "completed",
  ).length;
  const failedReceivers = state.receivers.filter(
    (receiver) => receiver.state === "failed" || receiver.state === "cancelled",
  ).length;

  return (
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
        {completedReceivers > 0
          ? `Your files were successfully transferred to ${completedReceivers} ${
              completedReceivers === 1 ? "receiver" : "receivers"
            }.`
          : "The transfer session ended."}
        {failedReceivers > 0 &&
          ` ${failedReceivers} ${failedReceivers === 1 ? "receiver" : "receivers"} didn't finish.`}
      </p>

      <dl className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-3 text-left sm:grid-cols-4">
        <Stat label="Files" value={String(state.files.length)} />
        <Stat label="Total size" value={formatBytes(state.totalSize)} />
        <Stat label="Duration" value={formatDuration(state.durationSeconds)} />
        <Stat label="Avg speed" value={formatSpeed(state.speed)} />
      </dl>

      <div className="mt-6 flex justify-center">
        <ConnectionBadge quality={state.connectionQuality} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}
