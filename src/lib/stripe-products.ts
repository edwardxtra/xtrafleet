/**
 * Script to create Stripe products and prices
 * Run this once to set up your Stripe account with the correct products
 */

import { stripe } from './stripe';

export async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  try {
    // Create Monthly Subscription
    const monthlyProduct = await stripe.products.create({
      name: 'XtraFleet Monthly',
      description: 'Monthly subscription to XtraFleet platform',
      metadata: {
        type: 'subscription',
        billing_period: 'monthly',
      },
    });

    const monthlyPrice = await stripe.prices.create({
      product: monthlyProduct.id,
      currency: 'usd',
      unit_amount: 4999, // $49.99
      recurring: {
        interval: 'month',
      },
      metadata: {
        plan_name: 'Monthly',
      },
    });

    console.log('✅ Monthly Product:', monthlyProduct.id);
    console.log('✅ Monthly Price:', monthlyPrice.id);

    // Create 6-Month Subscription
    const sixMonthProduct = await stripe.products.create({
      name: 'XtraFleet 6-Month',
      description: '6-month subscription to XtraFleet platform (10% discount)',
      metadata: {
        type: 'subscription',
        billing_period: '6_months',
      },
    });

    const sixMonthPrice = await stripe.prices.create({
      product: sixMonthProduct.id,
      currency: 'usd',
      unit_amount: 26999, // $269.99
      recurring: {
        interval: 'month',
        interval_count: 6,
      },
      metadata: {
        plan_name: '6-Month',
        discount: '10%',
      },
    });

    console.log('✅ 6-Month Product:', sixMonthProduct.id);
    console.log('✅ 6-Month Price:', sixMonthPrice.id);

    // Create Annual Subscription
    const annualProduct = await stripe.products.create({
      name: 'XtraFleet Annual',
      description: 'Annual subscription to XtraFleet platform (16% discount)',
      metadata: {
        type: 'subscription',
        billing_period: 'annual',
      },
    });

    const annualPrice = await stripe.prices.create({
      product: annualProduct.id,
      currency: 'usd',
      unit_amount: 49999, // $499.99
      recurring: {
        interval: 'year',
      },
      metadata: {
        plan_name: 'Annual',
        discount: '16%',
      },
    });

    console.log('✅ Annual Product:', annualProduct.id);
    console.log('✅ Annual Price:', annualPrice.id);

    console.log('\n📋 Add these to your .env.local:');
    console.log(`STRIPE_PRICE_MONTHLY=${monthlyPrice.id}`);
    console.log(`STRIPE_PRICE_SIX_MONTH=${sixMonthPrice.id}`);
    console.log(`STRIPE_PRICE_ANNUAL=${annualPrice.id}`);

    return {
      monthly: { product: monthlyProduct, price: monthlyPrice },
      sixMonth: { product: sixMonthProduct, price: sixMonthPrice },
      annual: { product: annualProduct, price: annualPrice },
    };
  } catch (error) {
    console.error('Error creating products:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  createStripeProducts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}