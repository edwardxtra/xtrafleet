import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg font-headline">XtraFleet</h3>
            <p className="text-sm text-muted-foreground">
              Compliance-first driver management platform for trucking owner-operators.
            </p>
          </div>

          {/* Product */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/dashboard" className="hover:text-foreground transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/dashboard/drivers" className="hover:text-foreground transition-colors">
                  Drivers
                </Link>
              </li>
              <li>
                <Link href="/dashboard/loads" className="hover:text-foreground transition-colors">
                  Loads
                </Link>
              </li>
              <li>
                <Link href="/dashboard/matches" className="hover:text-foreground transition-colors">
                  Matches
                </Link>
              </li>
              <li>
                <Link href="/dashboard/messages" className="hover:text-foreground transition-colors">
                  Messages
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="mailto:support@xtrafleet.com" className="hover:text-foreground transition-colors">
                  Contact Support
                </a>
              </li>
              <li>
                <a href="mailto:support@xtrafleet.com" className="hover:text-foreground transition-colors">
                  Report an Issue
                </a>
              </li>
              <li>
                <a href="mailto:support@xtrafleet.com" className="hover:text-foreground transition-colors">
                  Feature Request
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/legal/terms" className="hover:text-foreground transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/esign-consent" className="hover:text-foreground transition-colors">
                  E-Sign Consent
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {currentYear} XtraFleet. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <a href="mailto:support@xtrafleet.com" className="hover:text-foreground transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
