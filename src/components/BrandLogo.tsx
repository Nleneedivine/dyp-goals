import { cn } from "@/lib/utils";

type BrandLogoProps = {
  brand?: "goals" | "dyp";
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ brand = "dyp", className, compact = false }: BrandLogoProps) {
  const src = brand === "goals" ? "/brand/goals-logo.png" : "/brand/dyp-logo.jpg";
  return (
    <img
      src={src}
      alt={brand === "goals" ? "GOALS" : "DYP — Discover Your Purpose"}
      className={cn("object-contain", compact ? "h-10 w-auto max-w-[132px]" : "h-14 w-auto max-w-[190px]", className)}
    />
  );
}