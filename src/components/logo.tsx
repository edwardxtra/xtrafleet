import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_FULL_LIGHT = "/images/xtrafleet-logo.svg";
const LOGO_FULL_DARK = "/images/xtrafleet-logo-dark.svg";
const LOGO_ICON_LIGHT = "/images/xtrafleet-logomark.svg";
const LOGO_ICON_DARK = "/images/xtrafleet-logomark-dark.svg";

// Dark-surface treatment swaps the charcoal half of the X for white while
// keeping the brand blue intact — standard reverse/knockout. We render the
// alternate file via Tailwind dark: utilities. forceLight bypasses the
// .dark-class check and always uses the dark-surface variant (used in light-
// mode pages whose sidebar/nav surface is dark navy).
function LogoFull({ className, forceLight }: { className?: string; forceLight?: boolean }) {
  if (forceLight) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={LOGO_FULL_DARK} alt="XtraFleet" className={className} />
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_FULL_LIGHT} alt="XtraFleet" className={cn(className, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_FULL_DARK} alt="XtraFleet" className={cn(className, "hidden dark:block")} />
    </>
  );
}

function LogoIcon({ className, forceLight }: { className?: string; forceLight?: boolean }) {
  if (forceLight) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={LOGO_ICON_DARK} alt="XtraFleet" className={className} />
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_ICON_LIGHT} alt="XtraFleet" className={cn(className, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_ICON_DARK} alt="XtraFleet" className={cn(className, "hidden dark:block")} />
    </>
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
