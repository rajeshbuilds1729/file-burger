import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "File Burger — Send Files Directly";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Open Graph image generated from the File Burger brand. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "96px",
          background: "linear-gradient(135deg, #0c0a09 0%, #1c1310 100%)",
          color: "#f4efe8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="88" height="78" viewBox="0 0 36 32" fill="none">
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
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>
            File<span style={{ color: "#fb923c" }}>Burger</span>
          </div>
        </div>
        <div style={{ marginTop: 40, fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>
          Send files. Skip the upload.
        </div>
        <div style={{ marginTop: 28, fontSize: 34, color: "#a39b8f", maxWidth: 900, lineHeight: 1.4 }}>
          Private peer-to-peer file sharing directly between browsers.
          No account. No upload queue. Just send.
        </div>
      </div>
    ),
    size,
  );
}
