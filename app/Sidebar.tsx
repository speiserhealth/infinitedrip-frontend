"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";
import ThemeToggle from "./ThemeToggle";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Funnel" },
  { href: "/stats", label: "Stats" },
  { href: "/settings", label: "Settings" },
];
const billingNavItem = { href: "/billing", label: "Billing" };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await apiFetch("/api/me", { cache: "no-store" });
        if (!r.ok) return;
        const body = await r.json().catch(() => ({}));
        const role = String(body?.user?.role || "").toLowerCase();
        if (!dead) setIsAdmin(role === "admin");
      } catch {}
    })();
    return () => {
      dead = true;
    };
  }, []);

  const navItems = isAdmin
    ? [
        ...baseNavItems,
        { href: "/admin/users", label: "User Approvals" },
        { href: "/admin/audit", label: "Audit Log" },
        { href: "/admin/textdrip", label: "Textdrip Debug" },
        { href: "/admin/email", label: "Email Debug" },
      ]
    : baseNavItems;

  const handleLogout = async () => {
    // This clears the NextAuth session cookie and then redirects.
    await signOut({ redirect: false });

    // Extra safety: hard navigate to login
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="relative z-10 flex w-64 flex-col border-r border-sky-300/25 bg-slate-900/85 p-4 text-slate-100 shadow-[0_0_30px_rgba(56,189,248,0.10)] backdrop-blur-md">
      <div className="mb-6">
        <div className="text-2xl font-extrabold tracking-[0.12em] text-cyan-300 drop-shadow-[0_0_24px_rgba(56,189,248,0.72)]">
          INFINITE DRIP
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded px-3 py-2 text-sm",
                active
                  ? "bg-cyan-600/85 text-white shadow-[0_0_14px_rgba(56,189,248,0.45)]"
                  : "text-cyan-100 hover:bg-slate-800/75 hover:text-white",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href={billingNavItem.href}
        className={[
          "mb-3 block rounded px-3 py-2 text-sm",
          pathname === billingNavItem.href
            ? "bg-cyan-600/85 text-white shadow-[0_0_14px_rgba(56,189,248,0.45)]"
            : "text-cyan-100 hover:bg-slate-800/75 hover:text-white",
        ].join(" ")}
      >
        {billingNavItem.label}
      </Link>

      <div>
        <ThemeToggle />
      </div>

      <button
        onClick={handleLogout}
        className="mt-3 rounded border border-slate-600 bg-slate-800/85 px-3 py-2 text-sm text-cyan-100 hover:bg-slate-700/90"
      >
        Logout
      </button>
    </aside>
  );
}
