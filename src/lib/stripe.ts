import Stripe from 'stripe';

// Lazy initialization - only create Stripe instance when actually used
// This prevents build-time errors when env vars aren't set
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    });
  }
  return _stripe;
}

// Export a proxy that lazily initializes Stripe
export const stripe = new Proxy({} as Stripe, {
  get: (target, prop) => {
    const stripeInstance = getStripe();
    const value = (stripeInstance as any)[prop];
    return typeof value === 'function' ? value.bind(stripeInstance) : value;
  }
});

// Price IDs - these will be set after creating products in Stripe
export const STRIPE_PRICES = {
  MONTHLY: process.env.STRIPE_PRICE_MONTHLY || '', // $49.99/mo
  SIX_MONTH: process.env.STRIPE_PRICE_SIX_MONTH || '', // $269.99 (6 months)
  ANNUAL: process.env.STRIPE_PRICE_ANNUAL || '', // $499.99 (12 months)
} as const;

export const MATCH_FEE_AMOUNT = 2500; // $25.00 in cents

export const TRIAL_PERIOD_DAYS = {
  BETA: 90,
  STANDARD: 14,
} as const;

/**
 * Create or retrieve a Stripe customer for a user
 */
export async function getOrCreateCustomer(params: {
  userId: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  const { userId, email, name, metadata = {} } = params;

  // Try to find existing customer
  const existingCustomers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0];
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      userId,
      ...metadata,
    },
  });

  return customer;
}

/**
 * Get subscription status for a customer
 */
export async function getSubscriptionStatus(customerId: string): Promise<{
  hasActiveSubscription: boolean;
  subscription: Stripe.Subscription | null;
  status: string | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
}> {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return {
        hasActiveSubscription: false,
        subscription: null,
        status: null,
        trialEnd: null,
        currentPeriodEnd: null,
      };
    }

    const subscription = subscriptions.data[0];
    const isActive = ['active', 'trialing'].includes(subscription.status);

    return {
      hasActiveSubscription: isActive,
      subscription,
      status: subscription.status,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    };
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return {
      hasActiveSubscription: false,
      subscription: null,
      status: null,
      trialEnd: null,
      currentPeriodEnd: null,
    };
  }
}

/**
 * Create a checkout session for subscription
 */
export async function createSubscriptionCheckout(params: {
  customerId: string;
  priceId: string;
  trialPeriodDays?: number;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  const { customerId, priceId, trialPeriodDays, successUrl, cancelUrl, metadata = {} } = params;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: trialPeriodDays
      ? {
          trial_period_days: trialPeriodDays,
          metadata,
        }
      : { metadata },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  return session;
}

/**
 * Create a payment intent for match fee
 */
export async function createMatchFeePayment(params: {
  customerId: string;
  amount: number;
  tlaId: string;
  matchId: string;
  description?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  const { customerId, amount, tlaId, matchId, description, metadata = {} } = params;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: customerId,
    description: description || `Match fee for TLA ${tlaId}`,
    metadata: {
      tlaId,
      matchId,
      type: 'match_fee',
      ...metadata,
    },
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return paymentIntent;
}

/**
 * Create a customer portal session
 */
export async function createCustomerPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const { customerId, returnUrl } = params;

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}
