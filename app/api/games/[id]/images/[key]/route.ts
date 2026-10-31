import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { COLLECTIONS, db } from '@/lib/firebase/server';

/**
 * Serves a game's stored image — a seat portrait (`p{seat}`), the dealer, the welcome scene —
 * from the `poker_images` subcollection (base64 JPEG docs; lib/images/portraits.ts). Owner only.
 * URLs carry `?v=<images.version>`, so a response never changes and caches as immutable.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; key: string }> }) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id, key } = await params;
  const gameRef = db.collection(COLLECTIONS.games).doc(id);
  const game = await gameRef.get();
  if (!game.exists || game.data()?.createdBy !== email) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const doc = await gameRef.collection(COLLECTIONS.images).doc(key).get();
  const data = doc.data() as { data?: string; mime?: string } | undefined;
  if (!data?.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(Buffer.from(data.data, 'base64')), {
    headers: {
      'Content-Type': data.mime || 'image/jpeg',
      'Cache-Control': 'private, max-age=86400, immutable',
    },
  });
}
