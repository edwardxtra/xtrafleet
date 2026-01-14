'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  ctaVariant?: 'default' | 'outline';
  popular?: boolean;
  href: string;
}

const pricingTiers: PricingTier[] = [
  {
    name: 'Starter',
    price: '$49',
    description: 'Perfect for small fleets getting started',
    features: [
      'Up to 5 drivers',
      'Up to 20 loads per month',
      'AI-powered matching',
      'Document management',
      'Email support',
      'Basic compliance tracking',
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'outline',
    href: '/register',
  },
  {
    name: 'Professional',
    price: '$99',
    description: 'For growing fleets that need more power',
    features: [
      'Up to 25 drivers',
      'Unlimited loads',
      'AI-powered matching',
      'Document management',
      'Priority email support',
      'Advanced compliance tracking',
      'Automated expiry warnings',
      'Custom reporting',
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'default',
    popular: true,
    href: '/register',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large fleets with complex needs',
    features: [
      'Unlimited drivers',
      'Unlimited loads',
      'AI-powered matching',
      'Document management',
      'Dedicated account manager',
      'Advanced compliance tracking',
      'Automated expiry warnings',
      'Custom reporting',
      'API access',
      'White-label options',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    ctaVariant: 'outline',
    href: '/dashboard/contact',
  },
];

export function PricingSection() {
  return (
    <section className="w-full py-12 md:py-24 lg:py-32">
      <div className="container px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl font-headline">
              Simple, Transparent Pricing
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Choose the plan that fits your fleet. No hidden fees. Cancel anytime.
            </p>
          </div>
          
          {/* Free Trial Banner */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              14-Day Free Trial
            </Badge>
            <span>•</span>
            <span>No credit card required</span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8 max-w-6xl mx-auto">
          {pricingTiers.map((tier, index) => (
            <Card 
              key={index} 
              className={`relative flex flex-col ${
                tier.popular ? 'border-primary shadow-lg scale-105' : ''
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1">
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader>
                <CardTitle className="font-headline">{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tier.price !== 'Custom' && (
                    <span className="text-muted-foreground">/month</span>
                  )}
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

        {/* FAQ/Guarantee */}
        <div className="mt-16 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            All plans include our 30-day money-back guarantee
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <span>No setup fees</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <span>99.9% uptime SLA</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
