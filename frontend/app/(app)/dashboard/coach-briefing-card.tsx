/**
 * CoachBriefingCard — displays the daily AI or heuristic coaching briefing.
 *
 * Shows three sections: today's recommendations, sleep analysis, and activity
 * analysis. Renders a placeholder when no briefing is available (before 06:00
 * or when no Garmin data has been synced today).
 *
 * @param briefing - The DashboardBriefing from the API, or null if unavailable.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function CoachBriefingCard({ briefing }: { briefing: DashboardBriefing | null }) {
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
        <BriefingPanel label="Today's Plan" accentClassName="bg-[--status-positive]">
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {briefing.recommendations.map((item, index) => (
              <div
                key={item}
                className="flex gap-3 rounded-2xl border border-border bg-muted/80 px-4 py-4"
              >
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[--status-positive]/15 text-[11px] font-semibold text-[--status-positive]"
                >
                  {index + 1}
                </span>
                <p className={BODY_TEXT_CLASS}>{item}</p>
              </div>
            ))}
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
