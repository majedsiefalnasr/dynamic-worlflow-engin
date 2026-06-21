import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        dir="auto"
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-start text-base shadow-sm transition-[background-color,border-color,box-shadow] duration-200 ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground disabled:shadow-none md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
