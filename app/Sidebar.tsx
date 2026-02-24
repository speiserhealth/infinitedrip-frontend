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
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

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
    <aside className="relative z-10 flex w-64 flex-col border-r border-sky-400/20 bg-slate-900/70 p-4 text-slate-100 backdrop-blur-md">
      <div className="mb-6">
        <div className="text-xl font-semibold text-slate-100">InfiniteDrip</div>
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
                  ? "bg-cyan-600/85 text-white shadow-sm shadow-cyan-900/50"
                  : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">
        <ThemeToggle />
      </div>

      <button
        onClick={handleLogout}
        className="mt-3 rounded border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700/80"
      >
        Logout
      </button>
    </aside>
  );
}
