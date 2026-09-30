import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service for File Burger.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Terms of service
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
          Plain-language terms for using File Burger.
        </p>
      </header>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">The service</h2>
          <p className="mt-2">
            File Burger is a browser-based tool that helps two people transfer
            files directly between their browsers. The service is provided as
            open-source software you can self-host. It is provided “as is”,
            without warranty of any kind.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Your responsibility
          </h2>
          <p className="mt-2">
            {
              "You are responsible for the files you send and for complying with the laws that apply to you. Don\u2019t use File Burger to send unlawful content, malware, or material you don\u2019t have the right to share. Don\u2019t attempt to abuse, overload, or attack the service."
            }
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Transfers and availability
          </h2>
          <p className="mt-2">
            Transfers only work while both browsers are online with the
            transfer page open. Transfer sessions are ephemeral and expire
            automatically. The signaling server may rate-limit or refuse
            requests to prevent abuse. Availability of a self-hosted instance
            depends on your infrastructure.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Privacy</h2>
          <p className="mt-2">
            File contents never pass through the application server. See the{" "}
            <a href="/privacy" className="text-accent underline-offset-2 hover:underline">
              privacy policy
            </a>{" "}
            for details.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Liability</h2>
          <p className="mt-2">
            To the maximum extent permitted by law, the authors of File Burger
            are not liable for any damages or data loss arising from the use of
            this software. Always keep your own copy of important files.
          </p>
        </section>
      </div>
    </div>
  );
}
