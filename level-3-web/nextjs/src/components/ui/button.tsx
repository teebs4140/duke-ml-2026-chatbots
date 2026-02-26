/**
 * =============================================================
 * Button Component
 * =============================================================
 * A reusable button with multiple visual variants.
 * Built by hand (no shadcn CLI) using class-variance-authority
 * for variant management and tailwind-merge for class deduplication.
 *
 * VARIANTS:
 *   - default:  Solid Duke Blue background, white text
 *   - outline:  Bordered button with transparent background
 *   - ghost:    No border, subtle hover background
 *
 * SIZES:
 *   - default:  Standard padding
 *   - sm:       Compact padding
 *   - lg:       Larger padding
 *   - icon:     Square button for icon-only use
 * =============================================================
 */

"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Define all button variants using class-variance-authority (CVA).
 * CVA generates className strings based on the variant/size props.
 */
const buttonVariants = cva(
  // Base classes applied to ALL buttons regardless of variant
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Solid primary button - Duke Blue
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Bordered button
        outline:
          "border border-border bg-transparent hover:bg-secondary text-foreground",
        // Minimal button - just text with hover
        ghost: "hover:bg-secondary text-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        // Square button - perfect for icons
        icon: "h-10 w-10",
      },
    },
    // Default variant and size if not specified
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/**
 * Button props extend native HTML button attributes
 * plus our custom variant props from CVA.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/**
 * Button component with forwardRef for ref forwarding.
 * forwardRef is needed so parent components can attach
 * refs to the underlying <button> element.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
