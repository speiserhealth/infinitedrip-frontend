"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://infinitedrip-backend.onrender.com";

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [agreementOpened, setAgreementOpened] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    setInviteToken(String(params.get("invite") || "").trim());
  }, []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email,
          password,
          inviteToken,
          website,
          agreementAccepted,
          agreementViewed: agreementOpened,
        }),
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const code = String(body?.error || "");
        if (code === "email_exists") setError("An account with that email already exists.");
        else if (code === "invite_required") setError("A valid invite is required to sign up.");
        else if (code === "invite_invalid") setError("This invite is invalid, revoked, or expired.");
        else if (code === "invite_email_mismatch") setError("This invite is for a different email address.");
        else if (code === "agreement_view_required") setError("Please open and review the Beta Tester Agreement.");
        else if (code === "agreement_required") setError("You must accept the User Agreement.");
        else if (code === "weak_password") setError("Password must be at least 8 characters.");
        else setError("Signup failed. Please check your details.");
        return;
      }

      setSuccess("Signup submitted. An admin must approve your account before login.");
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setWebsite("");
      setAgreementOpened(false);
      setAgreementAccepted(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <Input placeholder="Personal phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {inviteToken ? <p className="text-xs text-gray-600">Invite code detected.</p> : null}
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              autoComplete="off"
              tabIndex={-1}
              className="hidden"
              aria-hidden="true"
            />

            <div className="rounded border border-border/70 bg-background/40 p-3">
              <button
                type="button"
                onClick={() => {
                  setAgreementOpened(true);
                  window.open("/agreements/InfiniteDrip_Beta_Tester_Agreement.pdf", "_blank", "noopener,noreferrer");
                }}
                className="rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/25"
              >
                Open Beta Tester Agreement (PDF)
              </button>
              <p className="mt-2 text-xs text-gray-500">
                You must open and review this agreement before signup is allowed.
              </p>
              {agreementOpened ? (
                <p className="mt-1 text-xs text-emerald-600">Agreement opened.</p>
              ) : null}
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(e) => setAgreementAccepted(e.target.checked)}
                className="mt-1"
                disabled={!agreementOpened}
              />
              <span>
                I agree to the{" "}
                <Link href="/agreements/InfiniteDrip_Beta_Tester_Agreement.pdf" className="text-blue-600 hover:underline" target="_blank">
                  InfiniteDrip Beta Tester Agreement
                </Link>
                .
              </span>
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-green-700">{success}</p> : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting..." : "Sign Up"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
