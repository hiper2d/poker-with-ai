import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

/**
 * NextAuth v5. The session email is the user key (poker_users/{email} in Firestore),
 * same model as werewolf. User upsert happens in the signIn event; the import is dynamic
 * so the Firebase Admin SDK never loads in edge/middleware contexts.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  events: {
    async signIn({ user }) {
      if (!user.email) return;
      const { upsertUser } = await import('@/app/actions/user-actions');
      await upsertUser(user.email, user.name ?? null);
    },
  },
});
