"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AthleteProfile } from "@/lib/types";

const FIELDS: { key: keyof AthleteProfile; label: string; unit: string; hint?: string }[] = [
  { key: "ftp_watts", label: "FTP", unit: "W", hint: "Functional threshold power (cycling)" },
  { key: "threshold_pace_sec_per_km", label: "Run threshold pace", unit: "sec/km", hint: "e.g. 270 = 4:30/km" },
  { key: "swim_css_sec_per_100m", label: "Swim CSS", unit: "sec/100m", hint: "Critical swim speed" },
  { key: "max_hr", label: "Max HR", unit: "bpm" },
  { key: "resting_hr", label: "Resting HR", unit: "bpm" },
  { key: "weight_kg", label: "Weight", unit: "kg" },
  { key: "squat_1rm_kg", label: "Squat 1RM", unit: "kg" },
  { key: "deadlift_1rm_kg", label: "Deadlift 1RM", unit: "kg" },
  { key: "bench_1rm_kg", label: "Bench 1RM", unit: "kg" },
  { key: "overhead_press_1rm_kg", label: "Overhead Press 1RM", unit: "kg" },
  { key: "mobility_sessions_per_week_target", label: "Mobility target", unit: "sessions/week" },
];

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
};

export function AthleteProfileCard() {
  const [profile, setProfile] = useState<AthleteProfile>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<AthleteProfile>("/activities/profile/athlete")
      .then((r) => setProfile(r.data))
      .catch(() => {});
  }, []);

  function set(key: keyof AthleteProfile, val: string) {
    setProfile((p) => ({ ...p, [key]: val === "" ? null : Number(val) }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const response = await api.put<AthleteProfile>("/activities/profile/athlete", profile);
      setProfile(response.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Athlete Profile</CardTitle>
        <CardDescription>
          Thresholds and 1RMs used by the AI coach. Missing values are auto-filled
          from Garmin data when enough signal exists, and saved values override them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map(({ key, label, unit, hint }) => (
            <div key={key}>
              <Label htmlFor={key} className="text-sm">
                {label}{unit ? ` (${unit})` : ""}
              </Label>
              {hint && <p className="text-xs text-zinc-400 mb-1">{hint}</p>}
              <Input
                id={key}
                type="number"
                value={profile[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
                placeholder="—"
                className="mt-1"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-5">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </CardContent>
    </Card>
  );
}
