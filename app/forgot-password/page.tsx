"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://infinitedrip-backend.onrender.com";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Forgot Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
          {done ? (
            <p className="mt-3 text-sm text-green-700">
              If an account exists, a reset link has been sent.
            </p>
          ) : null}
          <p className="mt-4 text-sm text-gray-600">
            <Link href="/login" className="text-blue-600 hover:underline">Back to login</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
