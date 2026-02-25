"use client";

import Image from "next/image";
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
      } catch (preErr) {
        // Local dev can block this browser-side precheck via CORS;
        // we still attempt signIn through NextAuth server route.
        console.warn("Login precheck skipped:", preErr);
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
    } catch {
      setError("Login failed. Please try again.");
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

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl -translate-y-16 flex-col items-center justify-center gap-8 px-4 py-10 md:-translate-y-24 lg:-translate-y-28">
        <div className="w-full max-w-5xl overflow-hidden rounded-2xl">
          <Image
            src="/TestImage1.png"
            alt="Infinite symbol brand artwork"
            width={1536}
            height={1024}
            priority
            className="h-auto w-full object-cover"
          />
        </div>

        <div className="w-full max-w-2xl text-center">
          <p className="bg-gradient-to-r from-sky-100 via-cyan-300 to-blue-400 bg-clip-text text-5xl font-extrabold tracking-[0.2em] text-transparent drop-shadow-[0_0_20px_rgba(56,189,248,0.45)] md:text-6xl">
            INFINITE DRIP
          </p>
          <h1 className="mt-2 text-base font-semibold text-slate-100 md:text-lg">Welcome Back</h1>
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
