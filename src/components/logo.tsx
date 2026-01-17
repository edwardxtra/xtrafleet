import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
        "flex items-center gap-2 text-primary transition-opacity hover:opacity-80",
        className
      )}
    >
      {variant === "full" ? (
        <svg 
          width="180" 
          height="40" 
          viewBox="0 0 180 40" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-auto"
        >
          {/* Truck Icon */}
          <g transform="translate(0, 8)">
            {/* Truck cab */}
            <rect x="0" y="8" width="12" height="12" rx="1.5" fill="currentColor" opacity="0.9"/>
            {/* Truck trailer */}
            <rect x="12" y="6" width="18" height="14" rx="1.5" fill="currentColor"/>
            {/* Front wheel */}
            <circle cx="8" cy="20" r="2.5" fill="currentColor" stroke="white" strokeWidth="1.5"/>
            {/* Back wheels */}
            <circle cx="18" cy="20" r="2.5" fill="currentColor" stroke="white" strokeWidth="1.5"/>
            <circle cx="24" cy="20" r="2.5" fill="currentColor" stroke="white" strokeWidth="1.5"/>
            {/* Window */}
            <rect x="2" y="10" width="4" height="4" rx="0.5" fill="white" opacity="0.3"/>
            {/* Speed lines */}
            <line x1="-4" y1="12" x2="-1" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
            <line x1="-6" y1="16" x2="-1" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
          </g>
          
          {/* XtraFleet Text */}
          <text x="40" y="28" fontFamily="system-ui, -apple-system, sans-serif" fontSize="20" fontWeight="700" fill="currentColor" letterSpacing="-0.5">
            <tspan>Xtra</tspan><tspan fill="currentColor" opacity="0.8">Fleet</tspan>
          </text>
        </svg>
      ) : (
        <svg 
          width="40" 
          height="40" 
          viewBox="0 0 40 40" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
        >
          {/* Truck Icon Only */}
          <g transform="translate(5, 12)">
            {/* Truck cab */}
            <rect x="0" y="4" width="12" height="12" rx="2" fill="currentColor" opacity="0.9"/>
            {/* Truck trailer */}
            <rect x="12" y="2" width="18" height="14" rx="2" fill="currentColor"/>
            {/* Front wheel */}
            <circle cx="8" cy="16" r="3" fill="currentColor" stroke="white" strokeWidth="2"/>
            {/* Back wheels */}
            <circle cx="18" cy="16" r="3" fill="currentColor" stroke="white" strokeWidth="2"/>
            <circle cx="24" cy="16" r="3" fill="currentColor" stroke="white" strokeWidth="2"/>
            {/* Window */}
            <rect x="2" y="6" width="4" height="4" rx="1" fill="white" opacity="0.4"/>
          </g>
        </svg>
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
