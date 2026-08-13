import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { creditBalanceOnce } from '@/lib/user-balance';

/**
 * Stripe webhook — credits the balance when a checkout completes. Webhook endpoints
 * receive account-wide events, so only checkouts this app stamped `metadata.app:
 * 'poker'` are processed; everything else is acknowledged and skipped unread.
 * Crediting is idempotent per event id (creditBalanceOnce): Stripe retries deliveries —
 * and deliveries can arrive concurrently — and a top-up must never credit twice.
 */
export async function POST(request: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !webhookSecret) {
    console.error('Stripe webhook called but STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are not configured');
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
  }

  const stripe = new Stripe(key);
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', String(err));
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Not a poker checkout — answer 200 unread so Stripe doesn't retry it here forever.
    if (session.metadata?.app !== 'poker') {
      return NextResponse.json({ received: true });
    }

    const userId = session.metadata?.userId;
    const amountUsd = parseFloat(session.metadata?.amountUsd || '0');
    if (!userId || !(amountUsd > 0)) {
      console.error('Invalid checkout session metadata:', session.metadata);
      return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
    }

    try {
      // Credits the balance and flips the user to paid, exactly once per event.
      await creditBalanceOnce(event.id, userId, amountUsd, {
        packageId: session.metadata?.packageId ?? null,
      });
    } catch (error) {
      console.error('Failed to add balance:', String(error));
      return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
