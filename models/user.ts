export type UserTier = 'free' | 'api' | 'paid';

export interface PokerUser {
  email: string;
  name: string | null;
  tier: UserTier;
  /** Keyed by ApiKeyName (e.g. ANTHROPIC_API_KEY). Never sent to the client raw. */
  apiKeys: Record<string, string>;
  createdAt: number;
}

/** Client-safe view: key values are masked to their last 4 characters. */
export interface UserProfile {
  email: string;
  name: string | null;
  tier: UserTier;
  apiKeys: { name: string; masked: string }[];
}
