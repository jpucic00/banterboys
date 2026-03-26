import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";

export const authConfig = {
  providers: [Discord],
  session: { strategy: "jwt" as const },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
        token.alias = (user as { alias?: string | null }).alias ?? null;
      }
      if (trigger === "update" && session?.alias !== undefined) {
        token.alias = session.alias;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.alias = token.alias as string | null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
