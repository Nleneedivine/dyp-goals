import goalsLogo from "@/assets/goals-logo.png.asset.json";
import dypLogo from "@/assets/dyp-logo.jpg.asset.json";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  brand?: "goals" | "dyp";
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ brand = "dyp", className, compact = false }: BrandLogoProps) {
  const asset = brand === "goals" ? goalsLogo : dypLogo;
  return (
    <img
      src={asset.url}
      alt={brand === "goals" ? "GOALS" : "DYP — Discover Your Purpose"}
      className={cn("object-contain", compact ? "h-10 w-auto max-w-[132px]" : "h-14 w-auto max-w-[190px]", className)}
    />
  );
}