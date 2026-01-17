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
        "flex items-center transition-opacity hover:opacity-80",
        className
      )}
    >
      {variant === "full" ? (
        <Image
          src="/images/xtrafleet-logo.png"
          alt="XtraFleet"
          width={200}
          height={50}
          className="h-8 w-auto dark:invert"
          priority
        />
      ) : (
        <Image
          src="/images/xtrafleet-logomark.png"
          alt="XtraFleet"
          width={40}
          height={40}
          className="h-8 w-8 dark:invert"
          priority
        />
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
