import Link from "next/link";
import { cn } from "@/lib/utils";

const BRAND_BLUE = "#1E9BD7";

// Curved-X logomark per DEV-160. Top half is the brand-blue inverted curved-V;
// bottom half mirrors it and adapts to theme (dark in light mode, white in dark).
function LogomarkPaths({ forceLight }: { forceLight?: boolean }) {
  const bottomFill = forceLight ? "fill-white" : "fill-gray-900 dark:fill-white";
  return (
    <>
      <path
        d="M 60 90 L 220 90 C 280 200, 340 290, 400 360 C 460 290, 520 200, 580 90 L 740 90 C 600 360, 480 460, 400 460 C 320 460, 200 360, 60 90 Z"
        fill={BRAND_BLUE}
      />
      <path
        d="M 60 710 L 220 710 C 280 600, 340 510, 400 440 C 460 510, 520 600, 580 710 L 740 710 C 600 440, 480 340, 400 340 C 320 340, 200 440, 60 710 Z"
        className={bottomFill}
      />
    </>
  );
}

function LogoFull({ className, forceLight }: { className?: string; forceLight?: boolean }) {
  const textFill = forceLight ? "fill-white" : "fill-gray-900 dark:fill-white";
  return (
    <svg
      viewBox="0 0 2400 800"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="XtraFleet"
    >
      <LogomarkPaths forceLight={forceLight} />
      <text
        x="860"
        y="560"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="540"
        fontWeight="700"
        className={textFill}
        letterSpacing="-12"
      >
        XtraFleet
      </text>
    </svg>
  );
}

function LogoIcon({ className, forceLight }: { className?: string; forceLight?: boolean }) {
  return (
    <svg
      viewBox="0 0 800 800"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="XtraFleet"
    >
      <LogomarkPaths forceLight={forceLight} />
    </svg>
  );
}

export function Logo({
  className,
  variant = "full",
  linkTo = "/",
  forceLight = false
}: {
  className?: string;
  variant?: "full" | "icon";
  linkTo?: string;
  forceLight?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center transition-opacity hover:opacity-80",
        className
      )}
    >
      {variant === "full" ? (
        <LogoFull className="h-10 w-auto" forceLight={forceLight} />
      ) : (
        <LogoIcon className="h-10 w-10" forceLight={forceLight} />
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
