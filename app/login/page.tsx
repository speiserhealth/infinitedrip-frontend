"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://infinitedrip-backend.onrender.com";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const pre = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!pre.ok) {
        const body = await pre.json().catch(() => ({}));
        const err = String(body?.error || "");
        if (pre.status === 403 && err === "pending_approval") {
          setError("Your account is pending admin approval.");
          return;
        }
        if (pre.status === 403 && err === "access_disabled") {
          setError("Your account access is currently disabled. Contact support.");
          return;
        }
        setError("Invalid email or password.");
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Login failed. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-blue-700/20 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-sky-700/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 px-4 py-10">
        <div className="w-full max-w-2xl text-center">
          <p className="text-xs tracking-[0.32em] text-cyan-200/80">INFINITE DRIP</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-100">Welcome Back</h1>
        </div>

        <div className="relative w-full max-w-md">
          <Card className="w-full border-sky-400/20 bg-slate-900/75 backdrop-blur-md">
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-slate-700 bg-slate-950/70 text-slate-100"
                />

                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-slate-700 bg-slate-950/70 text-slate-100"
                />

                {error ? <p className="text-sm text-rose-300">{error}</p> : null}

                <Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <p className="mt-4 text-sm text-slate-300">
                Need an account?{" "}
                <Link href="/signup" className="text-cyan-300 hover:underline">
                  Sign up
                </Link>
              </p>
              <p className="mt-2 text-sm text-slate-300">
                <Link href="/forgot-password" className="text-cyan-300 hover:underline">
                  Forgot password?
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
