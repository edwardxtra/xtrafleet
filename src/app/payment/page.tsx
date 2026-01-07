
'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { createPaymentIntent } from '@/lib/actions';
import { CheckoutForm } from '@/components/checkout-form';
import { Skeleton } from '@/components/ui/skeleton';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

function PaymentContent() {
    const [clientSecret, setClientSecret] = useState('');

    useEffect(() => {
        createPaymentIntent()
        .then((secret) => {
            if (typeof secret === 'string') {
            setClientSecret(secret);
            } else {
                console.error('Failed to create payment intent:', secret);
            }
        })
        .catch((err) => console.error('Error creating payment intent:', err));
    }, []);

    const appearance = {
        theme: 'stripe',
    };

    const options = {
        clientSecret,
        appearance,
    };
    
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="mx-auto w-full max-w-lg">
        <CardHeader className="space-y-4 text-center">
          <Link href="/" passHref className="inline-block">
            <Logo />
          </Link>
          <CardTitle className="font-headline text-2xl">
            Set Up Your Payment Method
          </CardTitle>
          <CardDescription>
            Enter your card details below. This will be used for matching fees.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {clientSecret ? (
            <Elements options={options} stripe={stripePromise}>
              <CheckoutForm />
            </Elements>
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          <p className="px-8 text-center text-sm text-muted-foreground">
            You can change your payment method at any time in your account
            settings.
          </p>
        </CardContent>
        <CardFooter className="flex-col items-center justify-center">
            <Button asChild variant="link">
                <Link href="/dashboard/getting-started">Skip for now and go to dashboard</Link>
            </Button>
        </CardFooter>
      </Card>
    </div>
    )
}

export default function PaymentPage() {
  return (
    <Suspense>
        <PaymentContent />
    </Suspense>
  );
}
