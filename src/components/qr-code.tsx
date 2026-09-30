"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR code for the share URL, rendered as SVG (crisp at any size). */
export function QrCode({
  value,
  size = 176,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex rounded-xl bg-white p-3 ${className ?? ""}`}
      aria-label={`QR code for ${value}`}
      role="img"
    >
      <QRCodeSVG
        value={value}
        size={size}
        bgColor="#ffffff"
        fgColor="#1a1714"
        level="M"
      />
    </div>
  );
}
