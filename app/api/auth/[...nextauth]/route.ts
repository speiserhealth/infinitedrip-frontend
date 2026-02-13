import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://infinitedrip-backend.onrender.com";

const handler = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");

        if (!email || !password) return null;

        try {
          const resp = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          if (!resp.ok) return null;

          const data = await resp.json();

          if (!data?.ok || !data?.token || !data?.user?.email) return null;

          // Return user object; we'll attach token in jwt callback
          return {
            id: String(data.user.email),
            name: String(data.user.email),
            email: String(data.user.email),
            token: String(data.token),
            role: String(data.user.role || "agent"),
          } as any;
        } catch (e) {
          console.error("AUTH ERROR:", e);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      // first login
      if (user) {
        token.userId = (user as any).id;
        token.token = (user as any).token;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).userId = (token as any).userId || "demo";
      (session as any).token = (token as any).token || "";
      (session as any).role = (token as any).role || "agent";
      return session;
    },
  },
});

export { handler as GET, handler as POST };
