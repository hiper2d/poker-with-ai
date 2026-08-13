'use server';

/**
 * Stripe checkout — STUB. The real implementation is a straight port of werewolf's
 * app/api/stripe-actions.ts:
 *   1. `new Stripe(process.env.STRIPE_SECRET_KEY)`.
 *   2. Get-or-create a Stripe customer for the session user (retrieve-to-verify the
 *      stored poker_users.stripeCustomerId — it may belong to a deleted customer or a
 *      different Stripe environment), persisting it via setStripeCustomerId (lib/user-balance).
 *   3. Create a mode:'payment' checkout session for the package's stripePriceId with
 *      metadata { userId, packageId, amountUsd } and success_url /profile?payment=success.
 *   4. Return session.url; the client redirects to it.
 * The webhook (app/api/webhooks/stripe/route.ts) credits the balance on completion.
 * Needs: `npm i stripe`, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PRICE_*.
 */
import { auth } from '@/auth';
import { CREDIT_PACKAGES } from '@/config/credit-packages';

export async function createCheckoutSession(packageId: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error('Not authenticated');
  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Invalid package: ${packageId}`);

  throw new Error('Top-ups are not open yet — Stripe checkout is coming soon.');
}
