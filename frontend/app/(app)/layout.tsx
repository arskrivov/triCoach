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
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/workouts", label: "Workouts", icon: "🏋️" },
  { href: "/routes", label: "Routes", icon: "🗺️" },
  { href: "/coach", label: "AI Coach", icon: "🤖" },
  { href: "/account", label: "Account", icon: "⚙️" },
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
    <div className="min-h-screen bg-background">
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${navOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setNavOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200 lg:translate-x-0 lg:z-auto ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div>
            <p className="text-sm font-bold tracking-tight"><span className="text-foreground">Tri</span><span className="text-primary">Coach</span></p>
            <p className="text-xs text-muted-foreground">Training workspace</p>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                style={active ? { background: "var(--gradient-accent)" } : undefined}
              >
                <span className="text-base leading-none">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3 flex flex-col gap-1">
          <ThemeToggle />
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={syncing ? "inline-block animate-spin" : "inline-block"}>↻</span>
            {syncMsg || (syncing ? "Syncing…" : "Sync Garmin")}
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-64">
        <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open navigation"
            >
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
            </button>

            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight text-foreground">TriCoach</p>
              <p className="truncate text-xs text-muted-foreground">{currentNav?.label ?? "Workspace"}</p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
