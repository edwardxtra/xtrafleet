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
          src="/images/xtrafleet-logo.jpg"
          alt="XtraFleet"
          width={1600}
          height={300}
          className="h-8 w-auto"
          priority
        />
      ) : (
        <Image
          src="/images/xtrafleet-logomark.jpg"
          alt="XtraFleet"
          width={800}
          height={800}
          className="h-8 w-8"
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
