"use client";

import { useState } from "react";
import { Check, Copy, Link2, QrCode as QrCodeIcon, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { QrCode } from "@/components/qr-code";
import { useCopy } from "@/hooks/use-copy";
import { useWebShare } from "@/hooks/use-web-share";
import { formatTransferId } from "@/lib/ids";

/**
 * "Your files are ready" — share URL, short transfer code, copy, QR code
 * and native share (Web Share API when supported).
 */
export function ShareCard({
  shareUrl,
  roomId,
  expiresAt,
}: {
  shareUrl: string;
  roomId: string;
  expiresAt: number | null;
}) {
  const { copied, copy } = useCopy();
  const { support, share } = useWebShare();
  const [qrOpen, setQrOpen] = useState(false);

  const handleShare = async () => {
    await share({
      title: "File Burger",
      text: "I'm sending you files — open this link to accept:",
      url: shareUrl,
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <p className="text-base font-semibold tracking-tight">
        Your files are ready
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Send this link to someone — they accept, then the transfer runs
        directly between your browsers.
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted px-3.5 py-2.5">
        <Link2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <code
          className="min-w-0 flex-1 truncate font-mono text-sm"
          aria-label={`Share link: ${shareUrl}`}
        >
          {shareUrl}
        </code>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Code:</span>
        <code className="rounded-lg bg-accent-soft px-2.5 py-1 font-mono text-sm font-semibold tracking-wider text-accent">
          {formatTransferId(roomId)}
        </code>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button size="md" onClick={() => void copy(shareUrl)}>
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy Link"}
        </Button>
        <Button size="md" variant="secondary" onClick={() => setQrOpen(true)}>
          <QrCodeIcon className="h-4 w-4" aria-hidden="true" />
          QR Code
        </Button>
        {support === "supported" && (
          <Button size="md" variant="outline" onClick={() => void handleShare()}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Keep this tab open until the transfer finishes.
        {expiresAt
          ? ` The link expires ${new Date(expiresAt).toLocaleString()}.`
          : ""}
      </p>

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} title="Scan to accept">
        <div className="flex flex-col items-center gap-4">
          <QrCode value={shareUrl} />
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            {"Scan with the recipient\u2019s device to open this transfer."}
          </p>
          <code className="rounded-lg bg-muted px-3 py-1.5 font-mono text-sm">
            {formatTransferId(roomId)}
          </code>
        </div>
      </Dialog>
    </div>
  );
}
