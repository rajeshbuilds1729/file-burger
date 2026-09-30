import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BurgerMark } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <BurgerMark className="h-14 w-16 opacity-60" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {"This page doesn\u2019t exist. If you followed a transfer link, it may have expired or been revoked."}
      </p>
      <div className="mt-7 flex gap-3">
        <Link href="/" tabIndex={-1}>
          <Button tabIndex={-1}>Go home</Button>
        </Link>
        <Link href="/send" tabIndex={-1}>
          <Button variant="secondary" tabIndex={-1}>
            Send files
          </Button>
        </Link>
      </div>
    </div>
  );
}
