'use client';

import { useState, useTransition } from 'react';
import { deleteApiKey, setApiKey } from '@/app/actions/user-actions';
import { Button, CapsLabel, Pill } from '@/components/ui';
import type { ApiKeyName } from '@/config/models';
import { SUPPORTED_MODELS } from '@/config/models';
import type { UserProfile } from '@/models/user';

const PROVIDERS = [...new Set(SUPPORTED_MODELS.map((m) => m.apiKeyName))];

export default function ProfileKeys({ initial }: { initial: UserProfile }) {
  const [profile, setProfile] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<UserProfile>) =>
    startTransition(async () => {
      setError(null);
      try {
        setProfile(await fn());
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="r-md border border-loss bg-panel px-4 py-3 text-sm text-loss">{error}</p>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <CapsLabel className="px-5 pb-2.5 pt-4.5">API keys</CapsLabel>
        {PROVIDERS.map((name) => {
          const saved = profile.apiKeys.find((k) => k.name === name);
          return (
            <div key={name} className="flex items-center gap-3 border-t border-line-soft px-5 py-3.5">
              <span className="w-44 flex-none text-sm text-body">{name.replace('_API_KEY', '')}</span>
              {saved ? (
                <>
                  <span className="flex-1 font-mono text-sm text-sage-dim">{saved.masked}</span>
                  <Pill
                    onClick={() => run(() => deleteApiKey(name as ApiKeyName))}
                    disabled={isPending}
                    className="min-h-9 text-loss disabled:opacity-50"
                  >
                    Remove
                  </Pill>
                </>
              ) : (
                <>
                  <input
                    type="password"
                    value={drafts[name] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [name]: e.target.value }))}
                    placeholder="paste key"
                    className="min-h-10 flex-1 r-sm border border-line bg-transparent px-3.5 text-sm text-cream outline-none placeholder:text-sage focus:border-gold"
                  />
                  <Button
                    variant="moss"
                    onClick={() => run(() => setApiKey(name as ApiKeyName, drafts[name] ?? ''))}
                    disabled={isPending || !(drafts[name] ?? '').trim()}
                    className="min-h-10"
                  >
                    Save
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-olive">
        Keys are stored in your user document and used server-side only. Keys from the
        server&rsquo;s env fill in anything you leave blank here.
      </p>
    </div>
  );
}
