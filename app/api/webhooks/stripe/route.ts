import { NextResponse } from 'next/server';

/**
 * Stripe webhook — STUB. The real implementation is a straight port of werewolf's
 * app/api/webhooks/stripe/route.ts:
 *   1. Verify the signature: `stripe.webhooks.constructEvent(await request.text(),
 *      request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)`.
 *   2. On 'checkout.session.completed': idempotency-check a `poker_stripeEvents/{event.id}`
 *      doc (skip if it exists), then `addBalance(metadata.userId, metadata.amountUsd)`
 *      from lib/user-balance — which also flips the user to the paid tier — and record
 *      the processed event doc.
 *   3. Always answer { received: true } so Stripe stops retrying.
 */
export async function POST() {
  return NextResponse.json({ error: 'Stripe webhook is not implemented yet' }, { status: 501 });
}
