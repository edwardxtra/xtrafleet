'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Footer() {
  const pathname = usePathname();

  // Hide footer on dashboard pages where the sidebar already provides navigation
  const isDashboard = pathname?.startsWith('/dashboard') || pathname?.startsWith('/driver-dashboard') || pathname?.startsWith('/admin');
  if (isDashboard) return null;

  return (
    <footer className="border-t border-border bg-background mt-auto z-10 relative">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} XtraFleet. All rights reserved.
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-sm">
            <Link href="/legal/terms" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/legal/privacy" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/legal/user-agreement" className="text-muted-foreground hover:text-foreground transition-colors">User Agreement</Link>
            <Link href="/legal/esign-consent" className="text-muted-foreground hover:text-foreground transition-colors">E-Sign Agreement</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
