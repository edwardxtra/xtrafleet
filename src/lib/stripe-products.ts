/**
 * Stripe Products and Prices
 * 
 * Run this file once to create products in Stripe:
 * node -r esbuild-register src/lib/stripe-products.ts
 * 
 * Or create them manually in Stripe Dashboard
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export const STRIPE_PRODUCTS = {
  MONTHLY: {
    name: 'XtraFleet Monthly',
    description: 'Monthly subscription to XtraFleet platform',
    price: 4999, // $49.99
    interval: 'month' as const,
  },
  SIX_MONTH: {
    name: 'XtraFleet 6-Month',
    description: '6-month subscription to XtraFleet platform (10% discount)',
    price: 26999, // $269.99 ($45/mo)
    interval: 'month' as const,
    interval_count: 6,
  },
  ANNUAL: {
    name: 'XtraFleet Annual',
    description: 'Annual subscription to XtraFleet platform (16% discount)',
    price: 49999, // $499.99 ($41.67/mo)
    interval: 'year' as const,
  },
};

/**
 * Create products in Stripe
 * Run this once during setup
 */
export async function createStripeProducts() {
  try {
    // Create Monthly Plan
    const monthlyProduct = await stripe.products.create({
      name: STRIPE_PRODUCTS.MONTHLY.name,
      description: STRIPE_PRODUCTS.MONTHLY.description,
      metadata: {
        planType: 'monthly',
      },
    });

    const monthlyPrice = await stripe.prices.create({
      product: monthlyProduct.id,
      currency: 'usd',
      unit_amount: STRIPE_PRODUCTS.MONTHLY.price,
      recurring: {
        interval: STRIPE_PRODUCTS.MONTHLY.interval,
      },
      metadata: {
        planType: 'monthly',
      },
    });

    console.log('✅ Monthly plan created:');
    console.log('   Product ID:', monthlyProduct.id);
    console.log('   Price ID:', monthlyPrice.id);

    // Create 6-Month Plan
    const sixMonthProduct = await stripe.products.create({
      name: STRIPE_PRODUCTS.SIX_MONTH.name,
      description: STRIPE_PRODUCTS.SIX_MONTH.description,
      metadata: {
        planType: 'six_month',
      },
    });

    const sixMonthPrice = await stripe.prices.create({
      product: sixMonthProduct.id,
      currency: 'usd',
      unit_amount: STRIPE_PRODUCTS.SIX_MONTH.price,
      recurring: {
        interval: STRIPE_PRODUCTS.SIX_MONTH.interval,
        interval_count: STRIPE_PRODUCTS.SIX_MONTH.interval_count,
      },
      metadata: {
        planType: 'six_month',
      },
    });

    console.log('✅ 6-Month plan created:');
    console.log('   Product ID:', sixMonthProduct.id);
    console.log('   Price ID:', sixMonthPrice.id);

    // Create Annual Plan
    const annualProduct = await stripe.products.create({
      name: STRIPE_PRODUCTS.ANNUAL.name,
      description: STRIPE_PRODUCTS.ANNUAL.description,
      metadata: {
        planType: 'annual',
      },
    });

    const annualPrice = await stripe.prices.create({
      product: annualProduct.id,
      currency: 'usd',
      unit_amount: STRIPE_PRODUCTS.ANNUAL.price,
      recurring: {
        interval: STRIPE_PRODUCTS.ANNUAL.interval,
      },
      metadata: {
        planType: 'annual',
      },
    });

    console.log('✅ Annual plan created:');
    console.log('   Product ID:', annualProduct.id);
    console.log('   Price ID:', annualPrice.id);

    console.log('\n📝 Add these Price IDs to your environment variables:');
    console.log(`NEXT_PUBLIC_STRIPE_PRICE_MONTHLY=${monthlyPrice.id}`);
    console.log(`NEXT_PUBLIC_STRIPE_PRICE_SIX_MONTH=${sixMonthPrice.id}`);
    console.log(`NEXT_PUBLIC_STRIPE_PRICE_ANNUAL=${annualPrice.id}`);

    return {
      monthly: { product: monthlyProduct.id, price: monthlyPrice.id },
      sixMonth: { product: sixMonthProduct.id, price: sixMonthPrice.id },
      annual: { product: annualProduct.id, price: annualPrice.id },
    };
  } catch (error) {
    console.error('Error creating Stripe products:', error);
    throw error;
  }
}

// Uncomment to run:
// createStripeProducts();
