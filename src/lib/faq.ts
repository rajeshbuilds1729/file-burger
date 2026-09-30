export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Are my files stored on your servers?",
    answer:
      "No. File Burger never receives your files. The server only brokers the connection between the two browsers — file contents travel directly between them over an encrypted WebRTC connection. Session metadata (filenames, sizes) is ephemeral and expires automatically.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. No sign-up, no email, no installation. Open File Burger, drop your files, and share the link.",
  },
  {
    question: "How large can files be?",
    answer:
      "There's no hard limit. Files are transferred in small chunks and streamed, so multi-gigabyte files work — the practical limit is your browser's memory (or disk, when you save directly to disk) and how long both of you keep the tabs open.",
  },
  {
    question: "Does the browser need to stay open?",
    answer:
      "Yes — on both sides. The connection is browser-to-browser, so the transfer only runs while the sender's tab stays open. If a connection drops, File Burger tries to reconnect and resume automatically.",
  },
  {
    question: "What happens if the connection fails?",
    answer:
      "File Burger attempts to reconnect and resume from where the transfer stopped — already-received data is kept. If reconnection isn't possible, you'll see a clear error and nothing is lost beyond what was already transferred.",
  },
  {
    question: "Does it work on mobile?",
    answer:
      "Yes. The interface is responsive, with proper file pickers and native share-sheet support on mobile browsers. WebRTC support on mobile browsers varies, but modern Chromium browsers work well.",
  },
  {
    question: "What happens behind NAT?",
    answer:
      "File Burger uses STUN servers to discover public addresses so most connections are direct. Networks that block direct connections fall back to a TURN relay if one is configured — transfers still work, just routed. The app tells you which one you got.",
  },
  {
    question: "Are transfers encrypted?",
    answer:
      "Yes. WebRTC connections are always encrypted with DTLS — it's not optional in the protocol. Optional passwords add another layer: the password is never sent to the server, only a derived verifier.",
  },
];
