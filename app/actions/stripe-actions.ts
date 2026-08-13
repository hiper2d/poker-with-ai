'use server';

/**
 * Stripe checkout (the user comes from the session, never from the client). Every
 * checkout session is stamped `metadata.app: 'poker'` and the webhook processes only
 * events carrying that stamp — the Stripe account may host other apps, and poker
 * neither knows nor cares which.
 */
import Stripe from 'stripe';
import { auth } from '@/auth';
import { CREDIT_PACKAGES } from '@/config/credit-packages';
import { COLLECTIONS, db } from '@/lib/firebase/server';
import { setStripeCustomerId } from '@/lib/user-balance';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Top-ups are not configured yet (STRIPE_SECRET_KEY is missing).');
  return new Stripe(key);
}

export async function createCheckoutSession(packageId: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error('Not authenticated');
  const email = session.user.email;

  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Invalid package: ${packageId}`);
  if (!pkg.stripePriceId) {
    throw new Error(`Stripe price ID not configured for package: ${packageId}`);
  }

  const stripe = getStripe();
  const userSnapshot = await db.collection(COLLECTIONS.users).doc(email).get();

  // Get or create the Stripe customer. A stored ID may point at a deleted customer or
  // one from a different Stripe environment (test vs live) — verify before reusing.
  let customerId = userSnapshot.data()?.stripeCustomerId as string | undefined;
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if (existing.deleted) customerId = undefined;
    } catch {
      customerId = undefined;
    }
  }
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name: userSnapshot.data()?.name ?? undefined,
      metadata: { userId: email, app: 'poker' },
    });
    customerId = customer.id;
    await setStripeCustomerId(email, customerId);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const checkout = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
    mode: 'payment',
    success_url: `${baseUrl}/profile?payment=success`,
    cancel_url: `${baseUrl}/profile?payment=cancelled`,
    metadata: {
      app: 'poker',
      userId: email,
      packageId: pkg.id,
      amountUsd: pkg.amountUsd.toString(),
    },
  });

  if (!checkout.url) throw new Error('Failed to create checkout session');
  return checkout.url;
}
