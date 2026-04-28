"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AthleteProfile } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type NumericProfileKey = {
  [K in keyof AthleteProfile]: AthleteProfile[K] extends number | null
    ? K
    : AthleteProfile[K] extends number
      ? K
      : never;
}[keyof AthleteProfile];

interface FieldDef {
  key: NumericProfileKey;
  label: string;
  unit: string;
  hint?: string;
}

interface Section {
  label: string;
  fields: FieldDef[];
}

/* ------------------------------------------------------------------ */
/*  Section configuration (Task 5.1)                                   */
/* ------------------------------------------------------------------ */

export const SECTIONS: Section[] = [
  {
    label: "Training Preferences",
    fields: [
      {
        key: "weekly_training_hours",
        label: "Weekly training hours",
        unit: "h",
        hint: "How many hours per week you can train (3–30)",
      },
      {
        key: "mobility_sessions_per_week_target",
        label: "Mobility target",
        unit: "sessions/week",
        hint: "How many mobility sessions per week you aim for (0–7)",
      },
    ],
  },
  {
    label: "Endurance Thresholds",
    fields: [
      {
        key: "ftp_watts",
        label: "FTP",
        unit: "W",
        hint: "Functional threshold power (cycling)",
      },
      {
        key: "threshold_pace_sec_per_km",
        label: "Run threshold pace",
        unit: "sec/km",
        hint: "e.g. 270 = 4:30/km",
      },
      {
        key: "swim_css_sec_per_100m",
        label: "Swim CSS",
        unit: "sec/100m",
        hint: "Critical swim speed",
      },
    ],
  },
  {
    label: "Heart Rate",
    fields: [
      { key: "max_hr", label: "Max HR", unit: "bpm" },
      { key: "resting_hr", label: "Resting HR", unit: "bpm" },
    ],
  },
  {
    label: "Strength",
    fields: [
      { key: "squat_1rm_kg", label: "Squat 1RM", unit: "kg" },
      { key: "deadlift_1rm_kg", label: "Deadlift 1RM", unit: "kg" },
      { key: "bench_1rm_kg", label: "Bench 1RM", unit: "kg" },
      { key: "overhead_press_1rm_kg", label: "Overhead Press 1RM", unit: "kg" },
    ],
  },
  {
    label: "Body",
    fields: [{ key: "weight_kg", label: "Weight", unit: "kg" }],
  },
];

/* ------------------------------------------------------------------ */
/*  SourceBadge (Task 5.2)                                             */
/* ------------------------------------------------------------------ */

const SOURCE_VARIANTS = {
  manual: "default",
  garmin: "outline",
  default: "secondary",
} as const;

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  garmin: "Garmin",
  default: "Default",
};

export function SourceBadge({
  source,
}: {
  source: "manual" | "garmin" | "default";
}) {
  return (
    <Badge
      variant={SOURCE_VARIANTS[source]}
      className={cn(
        source === "garmin" &&
          "border-teal-500/50 text-teal-600 dark:text-teal-400"
      )}
    >
      {SOURCE_LABELS[source]}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty profile default                                              */
/* ------------------------------------------------------------------ */

const EMPTY: AthleteProfile = {
  ftp_watts: null,
  threshold_pace_sec_per_km: null,
  swim_css_sec_per_100m: null,
  max_hr: null,
  resting_hr: null,
  weight_kg: null,
  squat_1rm_kg: null,
  deadlift_1rm_kg: null,
  bench_1rm_kg: null,
  overhead_press_1rm_kg: null,
  mobility_sessions_per_week_target: 2,
  weekly_training_hours: null,
  notes: null,
  field_sources: {},
  garmin_values: {},
};

/* ------------------------------------------------------------------ */
/*  AthleteProfileCard                                                 */
/* ------------------------------------------------------------------ */

export function AthleteProfileCard() {
  const [profile, setProfile] = useState<AthleteProfile>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AthleteProfile>("/activities/profile/athlete")
      .then((r) => setProfile(r.data))
      .catch(() => {});
  }, []);

  function set(key: NumericProfileKey, val: string) {
    setProfile((p) => ({ ...p, [key]: val === "" ? null : Number(val) }));
  }

  function setNotes(val: string) {
    setProfile((p) => ({ ...p, notes: val === "" ? null : val }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await api.put<AthleteProfile>(
        "/activities/profile/athlete",
        profile
      );
      setProfile(response.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save profile";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Athlete Profile</CardTitle>
        <CardDescription>
          Thresholds and 1RMs used by the AI coach. Missing values are
          auto-filled from Garmin data when enough signal exists, and saved
          values override them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          {SECTIONS.map((section) => (
            <fieldset key={section.label}>
              <legend className="text-sm font-semibold text-foreground mb-3">
                {section.label}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map(({ key, label, unit, hint }) => {
                  const source: "manual" | "garmin" | "default" =
                    profile.field_sources?.[key] ?? "default";
                  const garminValue: number | null =
                    profile.garmin_values?.[key] ?? null;
                  const effectiveValue = profile[key];

                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={key} className="text-sm">
                          {label} ({unit})
                        </Label>
                        <SourceBadge source={source} />
                      </div>
                      {hint && (
                        <p className="text-xs text-muted-foreground">{hint}</p>
                      )}
                      <Input
                        id={key}
                        type="number"
                        value={effectiveValue ?? ""}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder="—"
                        className="min-h-[44px]"
                      />
                      {source === "manual" && garminValue != null && (
                        <p className="text-xs text-muted-foreground">
                          Garmin: {garminValue}
                          {unit}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <fieldset>
            <legend className="text-sm font-semibold text-foreground mb-3">
              Athlete Notes
            </legend>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="athlete-notes" className="text-sm">
                  Health and coaching notes
                </Label>
                <SourceBadge source="manual" />
              </div>
              <p className="text-xs text-muted-foreground">
                Injuries, pain, contraindications, equipment limits, or coaching
                preferences. Example: knee pain, avoid deep squats and downhill
                running.
              </p>
              <textarea
                id="athlete-notes"
                value={profile.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add constraints the AI coach should respect when building workouts."
                className="min-h-32 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
              />
            </div>
          </fieldset>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <Button
            onClick={save}
            disabled={saving}
            className="min-h-[44px] min-w-[44px]"
          >
            {saving ? "Saving…" : "Save profile"}
          </Button>
          {saved && (
            <span className="text-sm text-[--status-positive]">Saved!</span>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
