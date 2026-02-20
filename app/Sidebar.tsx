"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Funnel" },
  { href: "/stats", label: "Stats" },
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
    ? [...baseNavItems, { href: "/admin/users", label: "User Approvals" }, { href: "/admin/audit", label: "Audit Log" }]
    : baseNavItems;

  const handleLogout = async () => {
    // This clears the NextAuth session cookie and then redirects.
    await signOut({ redirect: false });

    // Extra safety: hard navigate to login
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="w-64 border-r bg-white p-4 flex flex-col">
      <div className="mb-6">
        <div className="text-xl font-semibold">InfiniteDrip</div>
        <div className="text-sm text-gray-500">AI SMS Appointment Setter</div>
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
                active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={handleLogout}
        className="mt-4 rounded bg-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-200"
      >
        Logout
      </button>
    </aside>
  );
}
