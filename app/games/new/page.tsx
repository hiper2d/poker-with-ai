import { auth } from '@/auth';
import NewGameForm from '@/components/NewGameForm';

export default async function NewGamePage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-sage">Sign in to host a table.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-9">
      <div className="label-caps mb-1.5">Host</div>
      <h1 className="mb-7 font-serif text-5xl leading-none text-cream">Build the table</h1>
      <NewGameForm />
    </main>
  );
}
