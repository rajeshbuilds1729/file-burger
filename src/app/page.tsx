import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "File Burger — Send Files Directly",
  description:
    "Private peer-to-peer file sharing directly between browsers. No account. No upload queue. Just send.",
};

export default function HomePage() {
  return <Landing />;
}
