import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_FULL_SRC = "/images/xtrafleet-logo.svg";
const LOGO_ICON_SRC = "/images/xtrafleet-logomark.svg";

// brightness(0) flattens any color to black; invert(1) flips it to white.
// Result: an all-white knockout of the SVG regardless of source fills.
// Applied on dark surfaces (forceLight or .dark parent).
const whiteFilter = "[filter:brightness(0)_invert(1)]";
const darkWhiteFilter = "dark:[filter:brightness(0)_invert(1)]";

function LogoFull({ className, forceLight }: { className?: string; forceLight?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_FULL_SRC}
      alt="XtraFleet"
      className={cn(className, forceLight ? whiteFilter : darkWhiteFilter)}
    />
  );
}

function LogoIcon({ className, forceLight }: { className?: string; forceLight?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_ICON_SRC}
      alt="XtraFleet"
      className={cn(className, forceLight ? whiteFilter : darkWhiteFilter)}
    />
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
        <LogoIcon className="h-10 w-auto" forceLight={forceLight} />
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
