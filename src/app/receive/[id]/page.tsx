import type { Metadata } from "next";
import { ReceiverScreen } from "@/features/receiver/components/receiver-screen";

export const metadata: Metadata = {
  title: "Receive Transfer",
  description:
    "Someone is sending you files directly to your browser. Accept to start the transfer.",
  robots: { index: false, follow: false },
};

export default async function ReceivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceiverScreen roomId={id} />;
}
