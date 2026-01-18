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
          src="/images/xtrafleet-logo-no-tagline.svg"
          alt="XtraFleet"
          width={1200}
          height={250}
          className="h-10 w-auto"
          priority
        />
      ) : (
        <Image
          src="/images/xtrafleet-icon.svg"
          alt="XtraFleet"
          width={800}
          height={800}
          className="h-10 w-10"
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
