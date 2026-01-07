
'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { handleSuccessfulPaymentSetup } from '@/lib/actions';

export function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!stripe) {
      return;
    }

    const clientSecret = searchParams.get('setup_intent_client_secret');

    if (!clientSecret) {
      return;
    }

    stripe.retrieveSetupIntent(clientSecret).then(async ({ setupIntent }) => {
      switch (setupIntent?.status) {
        case "succeeded":
          setMessage("Your payment method has been saved!");
          await handleSuccessfulPaymentSetup(setupIntent.id);
           toast({
                title: "Payment Method Saved",
                description: "Your card has been successfully added.",
            });
           router.push('/dashboard/getting-started');
          break;
        case "processing":
          setMessage("Processing payment details. We'll update you when processing is complete.");
          break;
        case "requires_payment_method":
          setMessage("Failed to process payment details. Please try another payment method.");
          break;
        default:
          setMessage("Something went wrong.");
          break;
      }
    });
  }, [stripe, searchParams, router, toast]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js has not yet loaded.
      return;
    }

    setIsLoading(true);

    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${window.location.pathname}`,
      },
    });

    if (error) {
      if (error.type === 'card_error' || error.type === 'validation_error') {
        setMessage(error.message || 'An unexpected error occurred.');
      } else {
        setMessage('An unexpected error occurred.');
      }
    } else {
        // This part is less likely to be reached as the user is redirected.
    }

    setIsLoading(false);
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit}>
      <PaymentElement id="payment-element" />
      <Button
        disabled={isLoading || !stripe || !elements}
        id="submit"
        className="w-full mt-6"
      >
        <span id="button-text">
          {isLoading ? 'Processing...' : 'Save Card and Continue'}
        </span>
      </Button>
      {/* Show any error or success messages */}
      {message && <div id="payment-message" className="text-destructive text-sm mt-2 text-center">{message}</div>}
    </form>
  );
}
