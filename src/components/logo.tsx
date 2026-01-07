import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-primary",
        className
      )}
    >
      <Truck className="h-6 w-6" />
      <span className="font-headline text-xl font-semibold">Xtrafleet</span>
    </div>
  );
}
