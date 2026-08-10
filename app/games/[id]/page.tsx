import { getGame, getGameMessages } from '@/app/actions/game-actions';
import { auth } from '@/auth';
import GameRoom from '@/components/GameRoom';

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-400">Sign in to view this game.</p>
      </main>
    );
  }
  const [game, messages] = await Promise.all([getGame(id), getGameMessages(id)]);
  return (
    <main className="flex flex-1 flex-col">
      <GameRoom game={game} messages={messages} />
    </main>
  );
}
