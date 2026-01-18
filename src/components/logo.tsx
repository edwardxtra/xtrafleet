import Link from "next/link";
import { cn } from "@/lib/utils";

// Inline SVG components for theme-adaptive coloring
function LogoFull({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 250"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="XtraFleet"
    >
      <g transform="translate(0, 10)">
        {/* Blue top chevron - brand color */}
        <path d="M115 110 L20 15 L55 15 L115 75 L175 15 L210 15 L115 110 Z" fill="#1E9BD7"/>
        {/* Bottom chevron - adapts to theme */}
        <path d="M115 130 L20 225 L55 225 L115 165 L175 225 L210 225 L115 130 Z" className="fill-gray-900 dark:fill-white"/>
      </g>
      {/* "traFleet" text - adapts to theme */}
      <text x="220" y="170" fontFamily="Arial, Helvetica, sans-serif" fontSize="140" fontWeight="700" className="fill-gray-900 dark:fill-white" letterSpacing="-3">
        traFleet
      </text>
    </svg>
  );
}

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 800"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="XtraFleet"
    >
      {/* Blue top chevron - brand color */}
      <path d="M400 380 L100 80 L180 80 L400 300 L620 80 L700 80 L400 380 Z" fill="#1E9BD7"/>
      {/* Bottom chevron - adapts to theme */}
      <path d="M400 420 L100 720 L180 720 L400 500 L620 720 L700 720 L400 420 Z" className="fill-gray-900 dark:fill-white"/>
    </svg>
  );
}

export function Logo({
  className,
  variant = "full",
  linkTo = "/"
}: {
  className?: string;
  variant?: "full" | "icon";
  linkTo?: string;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center transition-opacity hover:opacity-80",
        className
      )}
    >
      {variant === "full" ? (
        <LogoFull className="h-10 w-auto" />
      ) : (
        <LogoIcon className="h-10 w-10" />
      )}
    </div>
  );

  if (linkTo) {
    return (
      <Link href={linkTo}>
        {content}
      </Link>
    );
  }

  return content;
}
