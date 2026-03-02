"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import * as React from "react";
import { apiFetch } from "@/lib/apiFetch";

type Activity = {
  leads_waiting: number;
  email_leads_waiting: number;
};

type NavItem = {
  href: string;
  label: string;
  badgeKey?: "leads" | "email_leads";
  indent?: boolean;
};

const billingNavItem = { href: "/billing", label: "Billing" };

function toNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [emailLeadImportAccess, setEmailLeadImportAccess] = React.useState(false);
  const [activity, setActivity] = React.useState<Activity>({
    leads_waiting: 0,
    email_leads_waiting: 0,
  });

  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await apiFetch("/api/me", { cache: "no-store" });
        if (!r.ok) return;
        const body = await r.json().catch(() => ({}));
        const role = String(body?.user?.role || "").toLowerCase();
        const access = role === "admin" || body?.user?.email_lead_import_access === true;
        if (!dead) {
          setIsAdmin(role === "admin");
          setEmailLeadImportAccess(access);
        }
      } catch {}
    })();
    return () => {
      dead = true;
    };
  }, []);

  React.useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await apiFetch("/api/navigation/activity", { cache: "no-store" });
        if (r.ok) {
          const body = await r.json().catch(() => ({}));
          const next = body?.activity || {};
          if (!dead) {
            setActivity({
              leads_waiting: Math.max(0, toNumber(next?.leads_waiting)),
              email_leads_waiting: Math.max(0, toNumber(next?.email_leads_waiting)),
            });
          }
        }
      } catch {}
      if (!dead) timer = setTimeout(tick, 12000);
    }

    tick();
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/calendar", label: "Calendar" },
    { href: "/leads", label: "Leads", badgeKey: "leads" },
    ...(emailLeadImportAccess
      ? [{ href: "/email-leads", label: "Email Leads", badgeKey: "email_leads" as const, indent: true }]
      : []),
    { href: "/pipeline", label: "Funnel" },
    { href: "/stats", label: "Stats" },
    { href: "/settings", label: "Settings" },
    ...(isAdmin
      ? [
          { href: "/admin/users", label: "User Approvals" },
          { href: "/admin/audit", label: "Audit Log" },
          { href: "/admin/textdrip", label: "Textdrip Debug" },
          { href: "/admin/email", label: "Email Debug" },
        ]
      : []),
  ];

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  function isActive(href: string) {
    if (href === "/leads") return pathname === "/leads" || pathname.startsWith("/leads/");
    if (href === "/email-leads") return pathname === "/email-leads" || pathname.startsWith("/email-leads/");
    return pathname === href;
  }

  function badgeCount(item: NavItem) {
    if (item.badgeKey === "leads") return activity.leads_waiting;
    if (item.badgeKey === "email_leads") return activity.email_leads_waiting;
    return 0;
  }

  return (
    <aside className="relative z-10 flex w-64 flex-col border-r border-sky-300/25 bg-slate-900/85 p-4 text-slate-100 shadow-[0_0_30px_rgba(56,189,248,0.10)] backdrop-blur-md">
      <div className="mb-6">
        <div className="text-3xl font-extrabold tracking-[0.12em] text-cyan-300 drop-shadow-[0_0_24px_rgba(56,189,248,0.72)]">
          INFINITE DRIP
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const count = badgeCount(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center justify-between rounded px-3 py-2.5 text-base font-medium",
                item.indent ? "ml-3 text-sm" : "",
                active
                  ? "bg-cyan-600/85 text-white shadow-[0_0_14px_rgba(56,189,248,0.45)]"
                  : "text-cyan-100 hover:bg-slate-800/75 hover:text-white",
              ].join(" ")}
            >
              <span>{item.label}</span>
              {count > 0 ? (
                <span className="ml-2 inline-flex min-w-[20px] justify-center rounded-full border border-amber-300/50 bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <Link
        href={billingNavItem.href}
        className={[
          "mb-3 block rounded px-3 py-2.5 text-base font-medium",
          pathname === billingNavItem.href
            ? "bg-cyan-600/85 text-white shadow-[0_0_14px_rgba(56,189,248,0.45)]"
            : "text-cyan-100 hover:bg-slate-800/75 hover:text-white",
        ].join(" ")}
      >
        {billingNavItem.label}
      </Link>

      <button
        onClick={handleLogout}
        className="rounded border border-slate-600 bg-slate-800/85 px-3 py-2 text-sm text-cyan-100 hover:bg-slate-700/90"
      >
        Logout
      </button>
    </aside>
  );
}
