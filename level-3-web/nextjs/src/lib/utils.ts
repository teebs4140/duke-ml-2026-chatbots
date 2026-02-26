import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 * This is the standard pattern used by shadcn/ui components.
 *
 * Example: cn("px-4 py-2", isActive && "bg-primary", "px-6")
 * Result: "py-2 px-6 bg-primary" (px-4 gets overridden by px-6)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
