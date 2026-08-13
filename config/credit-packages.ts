/**
 * Prepaid balance packages, werewolf's set. Each maps to a Stripe Price created in the
 * dashboard; until Stripe is wired up (checkout is stubbed) the price IDs may be empty.
 */
export interface CreditPackage {
  id: string;
  amountUsd: number;
  label: string;
  stripePriceId: string;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'small', amountUsd: 1, label: '$1.00', stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_1 || '' },
  { id: 'medium-small', amountUsd: 3, label: '$3.00', stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_3 || '' },
  { id: 'medium', amountUsd: 5, label: '$5.00', stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_5 || '' },
  { id: 'large', amountUsd: 10, label: '$10.00', stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_10 || '' },
];
