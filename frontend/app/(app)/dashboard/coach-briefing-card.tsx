/**
 * CoachBriefingCard — displays the daily AI or heuristic coaching briefing.
 *
 * Shows a compact readout: a short summary, 1-2 workout suggestions,
 * and a watchout section.
 * Renders a placeholder when no briefing is available (before 06:00 or when
 * no Garmin data has been synced today).
 *
 * @param briefing - The DashboardBriefing from the API, or null if unavailable.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardBriefing } from "@/lib/types";

const PANEL_LABEL_CLASS = "pl-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground";
const BODY_TEXT_CLASS = "text-[15px] leading-8 text-foreground";

function StatusBadge({ source }: { source: "ai" | "heuristic" }) {
  return (
    <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
      {source === "ai" ? "AI-enhanced" : "Rule-based"}
    </span>
  );
}

function BriefingPanel({
  label,
  accentClassName,
  children,
}: {
  label: string;
  accentClassName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-[1.75rem] border border-border bg-card/80 backdrop-blur px-5 py-5">
      <div className={`absolute inset-y-4 left-0 w-1 rounded-full ${accentClassName}`} />
      <p className={PANEL_LABEL_CLASS}>{label}</p>
      <div className="pl-2">{children}</div>
    </div>
  );
}

export function CoachBriefingCard({
  briefing,
  loading = false,
}: {
  briefing: DashboardBriefing | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Morning Briefing</p>
            <CardTitle className="mt-1 text-lg">Coach Readout</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-[1.75rem] border border-border bg-card/80 px-5 py-5">
            <Skeleton className="h-3 w-28" />
            <div className="mt-4 grid gap-4">
              <div className="rounded-2xl border border-border bg-muted/80 px-4 py-4">
                <Skeleton className="h-16 w-full" />
                <div className="mt-4 grid gap-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-border px-4 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-10 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Morning Briefing</p>
            <CardTitle className="mt-1 text-lg">Coach Readout</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed border-border bg-muted px-5 py-6">
            <p className={BODY_TEXT_CLASS}>Waiting for today&apos;s Garmin data.</p>
            <p className={`mt-2 ${BODY_TEXT_CLASS} text-muted-foreground`}>
              Today&apos;s briefing is saved after 06:00 once a sync brings in today&apos;s recovery or activity data.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summaryText = [briefing.sleep_analysis, briefing.activity_analysis]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Morning Briefing</p>
            <CardTitle className="mt-1 text-lg">Coach Readout</CardTitle>
          </div>
          <StatusBadge source={briefing.source} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <BriefingPanel label="Today's Readout" accentClassName="bg-[--status-positive]">
          <div className="mt-3 rounded-2xl border border-border bg-muted/80 px-4 py-4">
            <p className={BODY_TEXT_CLASS}>{summaryText}</p>
            <div className="mt-4 grid gap-2">
              {briefing.recommendations.slice(0, 2).map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-border bg-card/70 px-4 py-3"
                >
                  <p className={BODY_TEXT_CLASS}>{item}</p>
                </div>
              ))}
            </div>
          </div>

          {briefing.caution && (
            <div className="mt-4 rounded-2xl border border-[--status-caution]/30 bg-[--status-caution]/10 px-4 py-3">
              <p className={PANEL_LABEL_CLASS}>Watchout</p>
              <p className={`mt-1 ${BODY_TEXT_CLASS}`}>{briefing.caution}</p>
            </div>
          )}
        </BriefingPanel>
      </CardContent>
    </Card>
  );
}
