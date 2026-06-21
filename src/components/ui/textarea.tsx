import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        dir="auto"
        className={cn(
          "flex min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-start text-base shadow-sm transition-[background-color,border-color,box-shadow] duration-200 ease-out placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground disabled:shadow-none md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
