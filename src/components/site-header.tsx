"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BurgerLogo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/about", label: "How it works" },
  { href: "/faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="glass-panel sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-lg focus-visible:outline-offset-4"
          aria-label="File Burger home"
        >
          <BurgerLogo />
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/send" tabIndex={-1}>
            <Button size="md" tabIndex={-1}>
              Send files
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
