"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/user-agreement",
]);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const hideSidebar = PUBLIC_PATHS.has(pathname);

  if (hideSidebar) {
    return <main className="min-h-screen bg-background text-foreground">{children}</main>;
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-[-3rem] h-80 w-80 rounded-full bg-blue-700/20 blur-3xl" />
        <div className="absolute top-24 right-[-4rem] h-96 w-96 rounded-full bg-sky-700/18 blur-3xl" />
      </div>
      <Sidebar />
      <main className="relative z-10 flex-1 p-6">{children}</main>
    </div>
  );
}
