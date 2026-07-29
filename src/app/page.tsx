import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { Network, Truck, Handshake, Layers, Zap, ShieldCheck } from "lucide-react";
import { PricingSection } from "@/components/pricing-section";

function ValueProp({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 px-2">
      <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="text-sm md:text-base font-medium text-white/90 max-w-[14rem] leading-snug">
        {text}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="py-4 px-6 md:px-10 flex items-center justify-between border-b">
        <Logo />
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link href="/login">Log In</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Sign Up</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section with American Truck Background */}
        <section className="relative min-h-[70vh] md:min-h-[80vh] flex items-center justify-center text-center text-white px-4 py-16 md:py-20 overflow-hidden">
          {/* Background Image - Classic American Peterbilt Truck */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: 'url(https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=2070&auto=format&fit=crop)',
            }}
          />

          {/* Dark Overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/60 to-black/70" />

          {/* Content */}
          <div className="relative z-10 space-y-6 max-w-4xl">
            <h1 className="text-4xl md:text-6xl font-bold font-headline drop-shadow-lg">
              Unlock Driver Capacity—On Demand
            </h1>
            <p className="text-lg md:text-2xl max-w-3xl mx-auto drop-shadow-md text-white/90">
              Access qualified drivers from trusted carriers through compliant, per-trip agreements.
            </p>
            <p className="text-base md:text-lg max-w-2xl mx-auto drop-shadow-md text-white/75">
              Move more freight without hiring, long-term contracts, or operational disruption.
            </p>

            {/* Value props row (replaces the prior stat tiles) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-3xl mx-auto pt-4">
              <ValueProp icon={Layers} text="Reduce unused capacity across your network" />
              <ValueProp icon={Zap} text="Fill loads faster with available drivers" />
              <ValueProp icon={ShieldCheck} text="Operate within structured, compliant agreements" />
            </div>

            <div className="pt-4">
              <Button asChild size="lg" variant="accent" className="text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-shadow">
                <Link href="/register">Get Early Access</Link>
              </Button>
              <p className="text-sm text-white/70 mt-3">No commitment. Built for carriers.</p>
            </div>
          </div>
        </section>

        {/* Why XtraFleet Section */}
        <section className="py-16 px-6 md:px-10 bg-background">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-3xl font-bold font-headline mb-4">Built for Carriers—Not Intermediaries</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-12">
              XtraFleet enables carriers to access driver capacity across a trusted network—without giving up control.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-6 border rounded-lg bg-card hover:shadow-lg transition-shadow">
                <div className="flex justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Network className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold font-headline mb-2">Access Additional Driver Capacity</h3>
                <p className="text-muted-foreground">Tap into available drivers from other fleets when your capacity is tight.</p>
              </div>
              <div className="p-6 border rounded-lg bg-card hover:shadow-lg transition-shadow">
                <div className="flex justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Truck className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold font-headline mb-2">Operate Without Disruption</h3>
                <p className="text-muted-foreground">No hiring cycles. No long-term commitments. Keep your operations running as-is.</p>
              </div>
              <div className="p-6 border rounded-lg bg-card hover:shadow-lg transition-shadow">
                <div className="flex justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Handshake className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold font-headline mb-2">Direct Carrier-to-Carrier Execution</h3>
                <p className="text-muted-foreground">Work directly with other fleets under structured agreements—no intermediaries.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <PricingSection />
      </main>

      <footer className="py-6 px-6 md:px-10 border-t bg-muted">
        <div className="container mx-auto text-center text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} XtraFleet. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
