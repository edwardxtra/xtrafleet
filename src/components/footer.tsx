import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border bg-background mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} XtraFleet. All rights reserved.
          </div>
          <nav className="flex flex-wrap justify-center gap-4 text-sm">
            <Link 
              href="/legal/terms" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
            <Link 
              href="/legal/privacy" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <Link 
              href="/legal/user-agreement" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              User Agreement
            </Link>
            <Link 
              href="/legal/esign-consent" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              E-Sign Agreement
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
