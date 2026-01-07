
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import Link from "next/link";

export default function Home() {

  return (
    <div className="flex flex-col min-h-screen">
      <header className="py-4 px-6 md:px-10 flex items-center justify-between border-b">
        <Logo />
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost">
            <Link href="/login">Log In</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Sign Up</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
      <section className="relative h-[60vh] md:h-[70vh] flex items-center justify-center text-center text-white px-4 bg-gradient-to-br from-primary to-primary/80">          
          <div className="space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold font-headline drop-shadow-lg">
              Driver & Load management for owner-operators
            </h1>
            <p className="text-lg md:text-xl max-w-3xl mx-auto drop-shadow-md">
              Xtrafleet uses AI to seamlessly connect owner-operators with the
              perfect loads, optimizing routes and maximizing profits and ITS AMAZING!.
            </p>
            <Button asChild size="lg" variant="accent">
              <Link href="/register">Get Started Today</Link>
            </Button>
          </div>
        </section>
        
        <section className="py-16 px-6 md:px-10 bg-background">
            <div className="max-w-5xl mx-auto text-center">
                <h2 className="text-3xl font-bold font-headline mb-4">Why Xtrafleet?</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto mb-12">
                    Stop searching and start hauling. Our platform is built for owner-operators who want to work smarter, not harder.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="p-6 border rounded-lg bg-card">
                        <h3 className="text-xl font-semibold font-headline mb-2">AI-Powered Matching</h3>
                        <p className="text-muted-foreground">Our smart algorithms find the most profitable loads based on your drivers, equipment, and location.</p>
                    </div>
                    <div className="p-6 border rounded-lg bg-card">
                        <h3 className="text-xl font-semibold font-headline mb-2">Streamlined Operations</h3>
                        <p className="text-muted-foreground">Manage your drivers, loads, and billing all in one place. Less paperwork, more time on the road.</p>
                    </div>
                     <div className="p-6 border rounded-lg bg-card">
                        <h3 className="text-xl font-semibold font-headline mb-2">Simple, Transparent Fees</h3>
                        <p className="text-muted-foreground">No hidden charges. For just $49.99 and a small flat fee per successful match, so you always know what you're paying.</p>
                    </div>
                </div>
            </div>
        </section>
      </main>

      <footer className="py-6 px-6 md:px-10 border-t bg-muted">
          <div className="container mx-auto text-center text-muted-foreground text-sm">
              &copy; {new Date().getFullYear()} Xtrafleet. All rights reserved.
          </div>
      </footer>
    </div>
  );
}
