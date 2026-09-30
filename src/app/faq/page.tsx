import type { Metadata } from "next";
import { FAQ_ITEMS } from "@/lib/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about File Burger — storage, accounts, file sizes, NAT traversal, encryption and more.",
};

export default function FaqPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Frequently asked questions
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
          Short, honest answers. No fine print.
        </p>
      </header>

      <section aria-label="Questions" className="mt-8 space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.question}
            className="group rounded-2xl border border-border bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="cursor-pointer text-sm font-semibold tracking-tight marker:content-none">
              <span className="flex items-center justify-between gap-4">
                {item.question}
                <span
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </section>
    </div>
  );
}
