import Link from "next/link";
import { BurgerMark } from "./logo";
import { ShieldCheck } from "lucide-react";

const groups = [
  {
    title: "Product",
    links: [
      { href: "/send", label: "Send files" },
      { href: "/about", label: "How it works" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto_auto]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <BurgerMark className="h-6 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">
              File<span className="text-accent">Burger</span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Send files directly from your browser to another browser.
            Peer-to-peer, no accounts, nothing stored on the way.
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            No analytics. No tracking. No file storage.
          </p>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </h2>
            <ul className="mt-3 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border py-5">
        <p className="mx-auto w-full max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} File Burger. Files are transferred
          directly between browsers over encrypted WebRTC connections.
        </p>
      </div>
    </footer>
  );
}
