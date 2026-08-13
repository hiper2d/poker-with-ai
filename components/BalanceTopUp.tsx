'use client';

import { useState } from 'react';
import { createCheckoutSession } from '@/app/actions/stripe-actions';
import { Button, CapsLabel, Panel } from '@/components/ui';
import { CREDIT_PACKAGES } from '@/config/credit-packages';

/**
 * Prepaid balance top-up (werewolf's BalanceTopUp). Each button starts a Stripe checkout
 * for its package and redirects to the returned URL — until checkout is wired up the
 * server action throws and the error is shown inline.
 */
export default function BalanceTopUp() {
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (packageId: string) => {
    if (buying) return;
    setBuying(packageId);
    setError(null);
    try {
      const checkoutUrl = await createCheckoutSession(packageId);
      window.location.assign(checkoutUrl);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBuying(null);
    }
  };

  return (
    <Panel id="add-balance" className="p-5">
      <CapsLabel className="mb-3">Add balance</CapsLabel>
      <div className="flex flex-wrap gap-2.5">
        {CREDIT_PACKAGES.map((pkg) => (
          <Button
            key={pkg.id}
            variant="moss"
            onClick={() => buy(pkg.id)}
            disabled={!!buying}
          >
            {buying === pkg.id ? 'Redirecting…' : pkg.label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-3 text-xs text-loss">{error}</p>}
    </Panel>
  );
}
