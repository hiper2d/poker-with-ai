import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin SDK — server-side only. Firestore is never read from the browser;
 * all access goes through server actions.
 */
function initAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Missing FIREBASE_* env vars — see .env.example');
  }
  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export const db = getFirestore(initAdmin());
try {
  // optional fields (action.amount, tableTalk) are legitimately undefined
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  // settings() throws if already applied after first use (dev hot-reload) — safe to ignore
}

/**
 * This app shares the werewolf Firebase project. Only `config` is shared between the
 * two games; every other collection is poker-owned and carries the `poker_` prefix.
 */
/**
 * Firestore rejects `undefined` values and db.settings({ignoreUndefinedProperties}) cannot
 * be applied after first use (dev hot-reload). Strip undefined deterministically instead.
 */
export function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const COLLECTIONS = {
  games: 'poker_games',
  users: 'poker_users',
  requestStats: 'poker_requestStats',
  stripeEvents: 'poker_stripeEvents',
  config: 'config',
} as const;
