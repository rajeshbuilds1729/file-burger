"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Files,
  KeyRound,
  Link2,
  QrCode as QrCodeIcon,
  Radio,
  ShieldCheck,
  Smartphone,
  Timer,
} from "lucide-react";
import {
  FaqPreview,
  Features,
  Hero,
  HowItWorks,
  PrivacySection,
} from "@/components/landing/sections";
import { addSelectedFiles } from "@/lib/files/client-store";
import { FAQ_ITEMS } from "@/lib/faq";

export function Landing() {
  const router = useRouter();

  const handleFiles = useCallback(
    (files: File[]) => {
      addSelectedFiles(files);
      router.push("/send");
    },
    [router],
  );

  return (
    <>
      <Hero
        onFiles={handleFiles}
        bullets={[
          "Drop files, get a link",
          "Transfer runs in your browser",
          "Keep the tab open until it finishes",
        ]}
      />
      <HowItWorks
        steps={[
          {
            title: "Pick files",
            description:
              "Drag, browse or paste any files — big or small, one or many. Nothing is uploaded anywhere.",
            icon: <Files className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "Share the link",
            description:
              "File Burger creates a private transfer link with a QR code. Send it however you like.",
            icon: <Link2 className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "Transfer directly",
            description:
              "Both browsers connect and files flow straight between them — encrypted end to end.",
            icon: <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />,
          },
        ]}
      />
      <PrivacySection
        points={[
          {
            title: "The server never sees your files",
            description:
              "Only connection metadata passes through the signaling server. File contents travel directly between the two browsers.",
          },
          {
            title: "Encrypted by protocol",
            description:
              "WebRTC connections are always DTLS-encrypted — it's built into the protocol, not an option we toggled.",
          },
          {
            title: "Ephemeral by default",
            description:
              "Transfer sessions hold only metadata and expire automatically. Nothing persists, nothing to leak.",
          },
          {
            title: "No accounts, no analytics",
            description:
              "No sign-up, no email, no tracking scripts. The link is the only thing you leave behind.",
          },
        ]}
      />
      <Features
        features={[
          {
            title: "P2P transfers",
            description: "Browser-to-browser over WebRTC DataChannels, encrypted with DTLS.",
            icon: <Radio className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "No account",
            description: "Open the page and send. No sign-up, no email, ever.",
            icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "Multiple files",
            description: "Queue many files, mixed types, duplicate names — all in one transfer.",
            icon: <Files className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "Password protection",
            description: "Optional. Derived in your browser — the server never sees it.",
            icon: <KeyRound className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "QR sharing",
            description: "Scan to open the transfer on another device in seconds.",
            icon: <QrCodeIcon className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "Real-time progress",
            description: "Live speed, ETA and per-file progress on both sides.",
            icon: <Timer className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "Large-file support",
            description: "Streamed in chunks with backpressure — gigabytes without memory blowups.",
            icon: <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />,
          },
          {
            title: "Works on mobile",
            description: "Responsive UI with native share-sheet support on phones.",
            icon: <Smartphone className="h-5 w-5" aria-hidden="true" />,
          },
        ]}
      />
      <FaqPreview items={FAQ_ITEMS.slice(0, 4)} />
    </>
  );
}
