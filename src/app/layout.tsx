import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_URL } from "@/lib/config";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ThemeProvider } from "@/components/theme-provider";

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  display: "swap",
  variable: "--font-inter",
  weight: "100 900",
});

const description =
  "Private peer-to-peer file sharing directly between browsers. No account. No upload queue. Just send.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL || "http://localhost:3000"),
  title: {
    default: "File Burger — Send Files Directly",
    template: "%s — File Burger",
  },
  description,
  applicationName: "File Burger",
  keywords: [
    "file sharing",
    "peer-to-peer",
    "WebRTC",
    "send files",
    "private file transfer",
  ],
  openGraph: {
    type: "website",
    siteName: "File Burger",
    title: "File Burger — Send Files Directly",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "File Burger — Send Files Directly",
    description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
  ],
};

/** Applies the stored theme before hydration (no flash). */
const themeScript = `(function(){try{var s=localStorage.getItem('file-burger:theme');var dark=s?s==='dark':(window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)').matches:true);if(dark){document.documentElement.classList.add('dark');}document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-svh flex-col">
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main-content" className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
