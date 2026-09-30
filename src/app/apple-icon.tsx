import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "File Burger";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon generated from the File Burger brand. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0a09",
        }}
      >
        <svg width="120" height="107" viewBox="0 0 36 32" fill="none">
          <defs>
            <linearGradient id="fb" x1="4" y1="4" x2="32" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fbb25c" />
              <stop offset="1" stopColor="#e95d0c" />
            </linearGradient>
          </defs>
          <path d="M6 13.2C6 7.6 11.4 4 18 4s12 3.6 12 9.2v1.4a.8.8 0 0 1-.8.8H6.8a.8.8 0 0 1-.8-.8v-1.4Z" fill="url(#fb)" />
          <rect x="5" y="17.4" width="26" height="2.4" rx="1.2" fill="url(#fb)" opacity="0.72" />
          <rect x="6.5" y="21.8" width="23" height="2.8" rx="1.4" fill="url(#fb)" />
          <path d="M6 26.4h24v.4c0 .66-.54 1.2-1.2 1.2H7.2A1.2 1.2 0 0 1 6 26.8v-.4Z" fill="url(#fb)" />
        </svg>
      </div>
    ),
    size,
  );
}
