"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EnduranceBuilder } from "./endurance-builder";
import { StrengthBuilder } from "./strength-builder";
import { YogaBuilder } from "./yoga-builder";

type BuilderType = "ENDURANCE" | "STRENGTH" | "YOGA";

const DISCIPLINES: { label: string; icon: string; value: string; builderType: BuilderType }[] = [
  { label: "Run", icon: "🏃", value: "RUN", builderType: "ENDURANCE" },
  { label: "Swim", icon: "🏊", value: "SWIM", builderType: "ENDURANCE" },
  { label: "Road Bike", icon: "🚴", value: "RIDE_ROAD", builderType: "ENDURANCE" },
  { label: "Gravel", icon: "🚵", value: "RIDE_GRAVEL", builderType: "ENDURANCE" },
  { label: "Strength", icon: "🏋️", value: "STRENGTH", builderType: "STRENGTH" },
  { label: "Yoga", icon: "🧘", value: "YOGA", builderType: "YOGA" },
  { label: "Mobility", icon: "🤸", value: "MOBILITY", builderType: "YOGA" },
];

interface Props {
  initial?: {
    id?: string;
    name?: string;
    discipline?: string;
    builder_type?: string;
    content?: object;
    is_template?: boolean;
    scheduled_date?: string | null;
  };
}

export function WorkoutBuilder({ initial }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [discipline, setDiscipline] = useState(initial?.discipline ?? "RUN");
  const [builderType, setBuilderType] = useState<BuilderType>(
    (initial?.builder_type as BuilderType) ?? "ENDURANCE"
  );
  const [content, setContent] = useState<object>(initial?.content ?? {});
  const [isTemplate, setIsTemplate] = useState(initial?.is_template ?? false);
  const [scheduledDate, setScheduledDate] = useState(initial?.scheduled_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function selectDiscipline(disc: string, bt: BuilderType) {
    setDiscipline(disc);
    setBuilderType(bt);
    setContent({});
  }

  async function save() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        discipline,
        builder_type: builderType,
        content,
        is_template: isTemplate,
        scheduled_date: isTemplate ? null : scheduledDate || null,
      };
      if (initial?.id) {
        await api.put(`/workouts/${initial.id}`, payload);
      } else {
        await api.post("/workouts", payload);
      }
      router.push("/workouts");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail ?? "Failed to save workout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Name */}
      <div>
        <Label htmlFor="name">Workout name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Threshold intervals" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="scheduled-date">Scheduled date</Label>
        <Input
          id="scheduled-date"
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="mt-1 max-w-xs"
          disabled={isTemplate}
        />
        <p className="mt-1 text-xs text-zinc-400">
          Optional. Planned workouts show up on the dashboard and in weekly compliance.
        </p>
      </div>

      {/* Discipline picker */}
      <div>
        <Label>Discipline</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {DISCIPLINES.map((d) => (
            <button
              key={d.value}
              onClick={() => selectDiscipline(d.value, d.builderType)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                discipline === d.value
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Builder */}
      <Card>
        <CardContent className="pt-4">
          {builderType === "ENDURANCE" && (
            <EnduranceBuilder content={content} onChange={setContent} />
          )}
          {builderType === "STRENGTH" && (
            <StrengthBuilder content={content} onChange={setContent} />
          )}
          {builderType === "YOGA" && (
            <YogaBuilder content={content} onChange={setContent} />
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={(e) => {
              const nextValue = e.target.checked;
              setIsTemplate(nextValue);
              if (nextValue) {
                setScheduledDate("");
              }
            }}
            className="rounded" />
          Save as template
        </label>
        <div className="flex-1" />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button variant="outline" onClick={() => router.push("/workouts")}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save workout"}</Button>
      </div>
    </div>
  );
}
