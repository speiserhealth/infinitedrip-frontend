"use client";

import { useEffect, useState } from "react";

export default function TestBackendPage() {
  const [status, setStatus] = useState("Checking...");

  useEffect(() => {
    const base =
      (process.env.NEXT_PUBLIC_API_BASE && process.env.NEXT_PUBLIC_API_BASE.trim()) ||
      "https://infinitedrip-backend.onrender.com";

    fetch(`${base}/health`, { cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text || String(r.status));
        return text;
      })
      .then((text) => setStatus(`OK: ${text}`))
      .catch((e) => setStatus(`FAILED: ${String(e?.message || e)}`));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Backend Test</h1>
      <p>{status}</p>
    </div>
  );
}
