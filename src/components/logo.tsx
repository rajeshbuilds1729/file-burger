import { useId } from "react";

/**
 * File Burger logo: a stylized burger built from simple geometric layers —
 * bun, lettuce, patty, base — with a restrained grill gradient.
 * Generated branding, no external artwork.
 */
export function BurgerMark({ className }: { className?: string }) {
  const id = useId();
  const gradientId = `fb-grill-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox="0 0 36 32"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="4" x2="32" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbb25c" />
          <stop offset="1" stopColor="#e95d0c" />
        </linearGradient>
      </defs>
      {/* top bun */}
      <path
        d="M6 13.2C6 7.6 11.4 4 18 4s12 3.6 12 9.2v1.4a.8.8 0 0 1-.8.8H6.8a.8.8 0 0 1-.8-.8v-1.4Z"
        fill={`url(#${gradientId})`}
      />
      {/* sesame dots */}
      <circle cx="13" cy="9.2" r="0.9" fill="rgba(255,255,255,0.55)" />
      <circle cx="19" cy="7.8" r="0.9" fill="rgba(255,255,255,0.55)" />
      <circle cx="24" cy="10" r="0.9" fill="rgba(255,255,255,0.55)" />
      {/* lettuce */}
      <rect x="5" y="17.4" width="26" height="2.4" rx="1.2" fill={`url(#${gradientId})`} opacity="0.72" />
      {/* patty */}
      <rect x="6.5" y="21.8" width="23" height="2.8" rx="1.4" fill={`url(#${gradientId})`} />
      {/* bottom bun */}
      <path
        d="M6 26.4h24v.4c0 .66-.54 1.2-1.2 1.2H7.2A1.2 1.2 0 0 1 6 26.8v-.4Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

/** Full wordmark: mark + "File Burger". */
export function BurgerLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <BurgerMark className="h-7 w-8 shrink-0" />
      <span className="text-[17px] font-semibold tracking-tight">
        File<span className="text-accent">Burger</span>
      </span>
    </span>
  );
}
