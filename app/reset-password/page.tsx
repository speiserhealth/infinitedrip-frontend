"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://infinitedrip-backend.onrender.com";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    setToken(String(params.get("token") || ""));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const code = String(body?.error || "");
        if (code === "invalid_or_expired_token") setError("Reset link is invalid or expired.");
        else if (code === "weak_password") setError("Password must be at least 8 characters.");
        else setError("Reset failed.");
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700">Password updated. You can sign in now.</p>
              <Link href="/login" className="text-blue-600 hover:underline text-sm">Go to login</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
