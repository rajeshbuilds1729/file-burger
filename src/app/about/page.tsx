import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Files, KeyRound, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "File Burger sends files directly from your browser to another browser — peer-to-peer, encrypted, with nothing stored in between.",
};

const steps = [
  {
    title: "Pick files",
    description:
      "Drag files into the page, browse for them, or paste from your clipboard. Files of any size and type work — they're never uploaded to a server. Nothing leaves your device until someone accepts the transfer.",
    icon: <Files className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Share the link",
    description:
      "File Burger creates a transfer session with a secure, non-guessable link and a QR code. Optionally protect it with a password. Send the link however you like — chat, email, or a scan.",
    icon: <Link2 className="h-5 w-5" aria-hidden="true" />,
  },
  {
    title: "Transfer directly",
    description:
      "When the recipient opens the link, the two browsers negotiate a WebRTC connection and files flow directly between them, chunk by chunk, encrypted with DTLS. Both sides see live progress, speed and ETA.",
    icon: <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />,
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          How File Burger works
        </h1>
        <p className="mt-2.5 max-w-2xl text-base leading-relaxed text-muted-foreground">
          A fast, private way to send files: drop them, get a link, send it to
          someone. The files travel directly between the two browsers.
        </p>
      </header>

      <section aria-label="Steps" className="mt-10 space-y-5">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                {step.icon}
              </div>
              <h2 className="text-base font-semibold tracking-tight">
                <span className="mr-2 font-mono text-sm text-muted-foreground">
                  0{index + 1}
                </span>
                {step.title}
              </h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </div>
        ))}
      </section>

      <section aria-label="Under the hood" className="mt-10">
        <h2 className="text-lg font-bold tracking-tight">Under the hood</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            File Burger uses WebRTC DataChannels for the actual transfer. A
            lightweight signaling server (WebSocket, with a polling fallback)
            exchanges only the metadata needed to establish the connection —
            session descriptions and ICE candidates. It never receives file
            contents.
          </p>
          <p>
            Files are read in small chunks that adapt to network conditions,
            with backpressure so the sender never outpaces the receiver. Every
            file is hashed (SHA-256) while streaming and verified on the
            receiving side. Received data is kept in memory, in IndexedDB, or
            streamed straight to disk depending on size and your browser.
          </p>
          <p>
            Most connections are direct, thanks to STUN. Networks that block
            direct connections use a TURN relay when one is configured — the
            app always tells you which path you got.
          </p>
          <p className="inline-flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            Passwords are verified without the server ever seeing them: the
            password is turned into a derived verifier in your browser, and
            only that verifier is compared.
          </p>
        </div>
      </section>

      <div className="mt-10">
        <Link href="/send" tabIndex={-1}>
          <Button size="lg" tabIndex={-1}>
            Send your first transfer
          </Button>
        </Link>
      </div>
    </div>
  );
}
