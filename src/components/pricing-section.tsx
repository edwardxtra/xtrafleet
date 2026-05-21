'use client';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Link from 'next/link';

interface PricingTier {
  name: string;
  /** Big primary label — e.g. "Free". */
  priceLabel: string;
  /** Smaller subtitle under the price label — e.g. "Pay per successful match". */
  priceSubtitle: string;
  features: string[];
  cta: string;
  ctaVariant?: 'default' | 'outline';
  href: string;
}

const pricingTiers: PricingTier[] = [
  {
    name: 'Network Access',
    priceLabel: 'Free',
    priceSubtitle: 'Pay per successful match',
    features: [
      'Access driver capacity across carriers',
      'Post and fulfill load coverage needs',
      'Execute structured trip-based agreements',
      'Full visibility across every transaction',
      'Scale usage as your demand grows',
    ],
    cta: 'Request Access',
    ctaVariant: 'default',
    href: '/register',
  },
];

export function PricingSection() {
  return (
    <section className="w-full py-12 md:py-24 lg:py-32">
      <div className="container mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl font-headline">
              Simple, Usage-Based Pricing
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Pay only when you unlock driver capacity.
            </p>
          </div>
        </div>

        {/* Pricing Card - Centered Single Plan */}
        <div className="flex justify-center max-w-6xl mx-auto">
          {pricingTiers.map((tier, index) => (
            <Card
              key={index}
              className="relative flex flex-col w-full max-w-md border-primary shadow-lg"
            >
              <CardHeader className="text-center">
                <CardTitle className="font-headline text-2xl">{tier.name}</CardTitle>
                <div className="mt-4">
                  <div className="text-5xl font-bold">{tier.priceLabel}</div>
                  <div className="text-muted-foreground text-base mt-2">{tier.priceSubtitle}</div>
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  asChild
                  variant={tier.ctaVariant || 'default'}
                  className="w-full"
                  size="lg"
                >
                  <Link href={tier.href}>
                    {tier.cta}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Footnote */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            No long-term contracts. Carrier-to-carrier execution. You stay in control.
          </p>
        </div>
      </div>
    </section>
  );
}
