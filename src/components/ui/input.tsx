import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border border-border bg-input px-3.5 text-sm text-foreground",
          "placeholder:text-muted-foreground/70",
          "transition-colors focus:border-accent focus:outline-none focus-visible:outline-none",
          className,
        )}
        {...props}
      />
    );
  },
);
