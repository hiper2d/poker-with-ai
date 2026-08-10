import { COLLECTIONS, db, stripUndefined } from '@/lib/firebase/server';
import type { GameMessage } from '@/models/game';

/**
 * Persist a message with the werewolf-style ordered custom id
 * `000123-author-to-recipient`, incrementing game.messageCounter transactionally.
 */
export async function addMessageToGame(
  gameId: string,
  message: Omit<GameMessage, 'id' | 'timestamp'>,
): Promise<string> {
  const gameRef = db.collection(COLLECTIONS.games).doc(gameId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(gameRef);
    if (!snapshot.exists) throw new Error(`Game ${gameId} not found`);
    const counter = ((snapshot.data()?.messageCounter as number) ?? 0) + 1;
    const id = `${String(counter).padStart(6, '0')}-${sanitize(message.authorName)}-to-${sanitize(message.recipientName)}`;
    tx.update(gameRef, { messageCounter: counter });
    tx.set(gameRef.collection('messages').doc(id), stripUndefined({ ...message, id, timestamp: Date.now() }));
    return id;
  });
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
}

/** All messages for a game, in counter order. Internal — callers handle authorization. */
export async function fetchMessages(gameId: string): Promise<GameMessage[]> {
  const snapshot = await db
    .collection(COLLECTIONS.games)
    .doc(gameId)
    .collection('messages')
    .orderBy('__name__')
    .get();
  return snapshot.docs.map((d) => d.data() as GameMessage);
}
