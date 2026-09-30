"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Dropzone } from "@/components/dropzone";
import type { FaqItem } from "@/lib/faq";

export function Hero({
  onFiles,
  bullets,
}: {
  onFiles: (files: File[]) => void;
  bullets: string[];
}) {
  return (
    <section className="ambient-glow border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <Badge tone="accent" className="mb-5">
            Peer-to-peer · No account · Nothing stored
          </Badge>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Send files.{" "}
            <span className="bg-gradient-to-r from-accent-strong to-accent bg-clip-text text-transparent">
              Skip the upload.
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Send files directly from your browser to another browser. Files
            never touch an intermediary server — they travel peer-to-peer over
            an encrypted WebRTC connection.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
          className="mt-10 max-w-3xl"
        >
          <Dropzone onFiles={onFiles} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          className="mt-6 flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
        >
          {bullets.map((bullet) => (
            <span key={bullet} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent" />
              {bullet}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export function HowItWorks({
  steps,
}: {
  steps: Array<{ title: string; description: string; icon: React.ReactNode }>;
}) {
  return (
    <SectionShell
      title="How it works"
      subtitle="Three steps. No accounts, no uploads, no waiting rooms."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                {step.icon}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                0{index + 1}
              </span>
            </div>
            <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </motion.div>
        ))}
      </div>
    </SectionShell>
  );
}

export function PrivacySection({
  points,
}: {
  points: Array<{ title: string; description: string }>;
}) {
  return (
    <SectionShell
      title="Private by architecture, not by promise"
      subtitle="File contents are not stored on an intermediary server — the server never sees them at all."
      className="border-t border-border"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {points.map((point, index) => (
          <motion.div
            key={point.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
            className="flex gap-3.5 rounded-2xl border border-border bg-card p-5"
          >
            <span
              aria-hidden="true"
              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent"
            />
            <div>
              <h3 className="text-sm font-semibold">{point.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {point.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </SectionShell>
  );
}

export function Features({
  features,
}: {
  features: Array<{ title: string; description: string; icon: React.ReactNode }>;
}) {
  return (
    <SectionShell
      title="Everything you need to just send"
      subtitle="Built for real transfers — large files, flaky networks, and people who care about privacy."
      className="border-t border-border"
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              {feature.icon}
            </div>
            <h3 className="mt-3.5 text-sm font-semibold tracking-tight">
              {feature.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>
    </SectionShell>
  );
}

export function FaqPreview({ items }: { items: FaqItem[] }) {
  return (
    <SectionShell
      title="Questions, answered"
      subtitle="The short version. The full FAQ has more."
      className="border-t border-border"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.question}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <h3 className="text-sm font-semibold">{item.question}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function SectionShell({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="mt-9">{children}</div>
      </div>
    </section>
  );
}
