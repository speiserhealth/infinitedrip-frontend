import { getSession } from "next-auth/react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://infinitedrip-backend.onrender.com";

function resolveUrl(input: string) {
  const s = String(input || "");
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (!s.startsWith("/")) return `${API_BASE}/${s}`;
  return `${API_BASE}${s}`;
}

export async function apiFetch(url: string, init: RequestInit = {}) {
  const session = await getSession();

  const token =
    (session as any)?.token ||
    (session as any)?.accessToken ||
    "";

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(resolveUrl(url), { ...init, headers });
}
