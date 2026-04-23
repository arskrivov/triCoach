"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { postGarminSync } from "@/lib/garmin-sync-api";
import {
  dispatchGarminSyncCompleted,
  dispatchGarminSyncFailed,
  dispatchGarminSyncStarted,
} from "@/lib/garmin-sync";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/activities", label: "Activities", icon: "⚡" },
  { href: "/workouts", label: "Workouts", icon: "🏋️" },
  { href: "/routes", label: "Routes", icon: "🗺️" },
  { href: "/coach", label: "AI Coach", icon: "🤖" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const currentNav = useMemo(
    () => NAV_ITEMS.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`)),
    [pathname],
  );

  function getTimezone() {
    if (typeof window === "undefined") {
      return "UTC";
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncMsg("");
    dispatchGarminSyncStarted("sidebar");
    try {
      const res = await postGarminSync("/sync/now", { timezone: getTimezone() });
      setSyncMsg(`Synced ${res.activities_synced} activities and ${res.health_days_synced} health days.`);
      dispatchGarminSyncCompleted({
        activitiesSynced: res.activities_synced,
        healthDaysSynced: res.health_days_synced,
        source: "sidebar",
      });
      setTimeout(() => setSyncMsg(""), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed.";
      setSyncMsg(msg);
      dispatchGarminSyncFailed({ message: msg, source: "sidebar" });
      setTimeout(() => setSyncMsg(""), 3000);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div
        className={`fixed inset-0 z-40 bg-zinc-950/20 transition-opacity ${navOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setNavOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-transform duration-200 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div>
            <p className="text-sm font-bold tracking-tight text-zinc-900">TriCoach</p>
            <p className="text-xs text-zinc-400">Training workspace</p>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Close
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setNavOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <span className="text-base leading-none">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50"
          >
            <span className={syncing ? "inline-block animate-spin" : "inline-block"}>↻</span>
            {syncMsg || (syncing ? "Syncing…" : "Sync Garmin")}
          </button>
        </div>
      </aside>

      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
              aria-label="Open navigation"
            >
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
            </button>

            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight text-zinc-900">TriCoach</p>
              <p className="truncate text-xs text-zinc-400">{currentNav?.label ?? "Workspace"}</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
