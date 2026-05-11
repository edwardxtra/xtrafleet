import Link from "next/link";
import { cn } from "@/lib/utils";

const BRAND_BLUE = "#1E9BD7";
const BRAND_DARK = "#2A2D31";

// DEV-160 logomark: clean curved-V (top blue, bottom dark charcoal) forming a
// stylized X with a horizontal gap. On dark surfaces (forceLight or .dark),
// both halves render white as a knockout/reverse treatment.
function LogomarkPaths({ forceLight }: { forceLight?: boolean }) {
  const topClass = forceLight ? "fill-white" : "dark:fill-white";
  const bottomClass = forceLight ? "fill-white" : "dark:fill-white";
  const topFill = forceLight ? undefined : BRAND_BLUE;
  const bottomFill = forceLight ? undefined : BRAND_DARK;
  return (
    <>
      <path
        d="M 80 110 C 250 180, 550 180, 720 110 C 650 200, 480 280, 400 360 C 320 280, 150 200, 80 110 Z"
        fill={topFill}
        className={topClass}
      />
      <path
        d="M 80 690 C 250 620, 550 620, 720 690 C 650 600, 480 520, 400 440 C 320 520, 150 600, 80 690 Z"
        fill={bottomFill}
        className={bottomClass}
      />
    </>
  );
}

function LogoFull({ className, forceLight }: { className?: string; forceLight?: boolean }) {
  const textClass = forceLight ? "fill-white" : "dark:fill-white";
  const textFill = forceLight ? undefined : BRAND_DARK;
  return (
    <svg
      viewBox="0 0 3600 800"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="XtraFleet"
    >
      <LogomarkPaths forceLight={forceLight} />
      <text
        x="860"
        y="540"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="500"
        fontWeight="700"
        fill={textFill}
        className={textClass}
        letterSpacing="-15"
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
