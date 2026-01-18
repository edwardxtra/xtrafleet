import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { CheckCircle, Clock, Shield } from "lucide-react";
import { PricingSection } from "@/components/pricing-section";

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-3xl md:text-4xl font-bold text-white/90">{number}</div>
      <div className="text-sm text-white/70 mt-1">{label}</div>
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
        <section className="relative h-[70vh] md:h-[80vh] flex items-center justify-center text-center text-white px-4 overflow-hidden">
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
          <div className="relative z-10 space-y-8 max-w-4xl">
            <h1 className="text-4xl md:text-6xl font-bold font-headline drop-shadow-lg">
              Find Perfect Drivers for Every Load
              <span className="block text-white/90 text-3xl md:text-5xl mt-2">
                In Minutes, Not Days
              </span>
            </h1>
            <p className="text-lg md:text-xl max-w-3xl mx-auto drop-shadow-md">
              Stop wasting time on paperwork and phone calls. XtraFleet's AI matches 
              your loads with qualified drivers instantly—
              <strong className="text-white font-semibold"> saving you 10+ hours per week.</strong>
            </p>
            
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-6 md:gap-12 max-w-2xl mx-auto pt-6">
              <StatCard number="10hrs" label="Saved Per Week" />
              <StatCard number="30sec" label="Avg Match Time" />
              <StatCard number="100%" label="FMCSA Compliant" />
            </div>

            <div className="pt-4">
              <Button asChild size="lg" variant="accent" className="text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-shadow">
                <Link href="/register">Get Started Free</Link>
              </Button>
              <p className="text-sm text-white/70 mt-3">No credit card required • 90-Day Free Trial</p>
            </div>
          </div>
        </section>
        
        {/* Features Section */}
        <section className="py-16 px-6 md:px-10 bg-background">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-3xl font-bold font-headline mb-4">Why XtraFleet?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-12">
              Stop searching and start hauling. Our platform is built for owner-operators who want to work smarter, not harder.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-6 border rounded-lg bg-card hover:shadow-lg transition-shadow">
                <div className="flex justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold font-headline mb-2">AI-Powered Matching</h3>
                <p className="text-muted-foreground">Our smart algorithms find the most profitable loads based on your drivers, equipment, and location.</p>
              </div>
              <div className="p-6 border rounded-lg bg-card hover:shadow-lg transition-shadow">
                <div className="flex justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold font-headline mb-2">Streamlined Operations</h3>
                <p className="text-muted-foreground">Manage your drivers, loads, and billing all in one place. Less paperwork, more time on the road.</p>
              </div>
              <div className="p-6 border rounded-lg bg-card hover:shadow-lg transition-shadow">
                <div className="flex justify-center mb-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold font-headline mb-2">Simple, Transparent Fees</h3>
                <p className="text-muted-foreground">No hidden charges. Just $49.99/month and a small flat fee per successful match, so you always know what you're paying.</p>
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
          <span className="ml-2 opacity-50">• v1.0.1 • Deployed {new Date().toLocaleDateString()}</span>
        </div>
      </footer>
    </div>
  );
}
