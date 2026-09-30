import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "File Burger's privacy policy: what we collect (almost nothing), what we never collect (your files), and how transfers work.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Privacy policy
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">
          The short version: your files never touch our servers.
        </p>
      </header>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground">File contents</h2>
          <p className="mt-2">
            File Burger never receives, stores, inspects, or processes the
            contents of your files. Transfers happen directly between the two
            browsers over encrypted WebRTC (DTLS) connections. The application
            server only brokers the initial connection handshake.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Transfer metadata
          </h2>
          <p className="mt-2">
            To establish a connection, the signaling server temporarily holds:
            filenames, file sizes and MIME types (so the recipient can see
            what is on offer), a random transfer identifier, and the WebRTC
            session descriptions and ICE candidates needed to connect. This
            metadata is ephemeral: sessions expire automatically (default six
            hours) and are deleted when revoked. Nothing is written to disk.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Passwords</h2>
          <p className="mt-2">
            {
              "Optional transfer passwords are never sent to the server in plaintext. The sender\u2019s browser derives a cryptographic verifier (PBKDF2-SHA256) from the password; the receiver\u2019s browser derives the same verifier independently. Only the verifier and its salt are stored, and verification uses a constant-time comparison."
            }
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Analytics and tracking
          </h2>
          <p className="mt-2">
            File Burger includes no analytics, no tracking scripts, no cookies
            for advertising, and no third-party requests beyond the STUN/TURN
            configuration used for WebRTC. Your browser may keep the theme
            preference in local storage — that is it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">WebRTC</h2>
          <p className="mt-2">
            Establishing a WebRTC connection involves public STUN servers
            (which see your IP address, as any internet server does when you
            connect) and, when configured, a TURN relay. If you self-host File
            Burger, you control that infrastructure.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Contact</h2>
          <p className="mt-2">
            {
              "File Burger is designed to be self-hosted. When you deploy it yourself, this policy describes the software\u2019s behavior \u2014 you are responsible for the infrastructure you run it on."
            }
          </p>
        </section>
      </div>
    </div>
  );
}
