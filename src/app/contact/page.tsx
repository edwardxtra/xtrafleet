import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Phone, ArrowLeft, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-2xl mx-auto py-12 px-4">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </Button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-headline mb-2">Contact Us</h1>
          <p className="text-muted-foreground">
            Have questions? We're here to help.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Get in Touch
            </CardTitle>
            <CardDescription>
              Reach out to our support team for any questions or assistance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email */}
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="p-2 bg-primary/10 rounded-full">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Email Support</p>
                <a 
                  href="mailto:support@xtrafleet.com" 
                  className="text-primary hover:underline"
                >
                  support@xtrafleet.com
                </a>
                <p className="text-sm text-muted-foreground mt-1">
                  We typically respond within 24 hours.
                </p>
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="p-2 bg-primary/10 rounded-full">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Phone Support</p>
                <p className="text-muted-foreground">Coming Soon</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Phone support will be available soon.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground text-center">
                For urgent matters, please email us with "URGENT" in the subject line.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>XtraFleet Technologies, Inc.</p>
          <p>Compliance-first driver management for owner-operators.</p>
        </div>
      </div>
    </div>
  );
}
