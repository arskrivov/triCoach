"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Goal } from "@/lib/types";

const RACE_TYPE_OPTIONS = [
  { value: "marathon", label: "Marathon" },
  { value: "half_marathon", label: "Half Marathon" },
  { value: "ironman", label: "Ironman" },
  { value: "ironman_70_3", label: "Ironman 70.3" },
  { value: "olympic_tri", label: "Olympic Triathlon" },
  { value: "10k", label: "10K" },
  { value: "century_ride", label: "Century Ride" },
  { value: "custom", label: "Custom" },
] as const;

const RACE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RACE_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

interface RaceFormState {
  description: string;
  target_date: string;
  sport: string;
  race_type: string;
  priority: number;
}

const INITIAL_FORM: RaceFormState = {
  description: "",
  target_date: "",
  sport: "",
  race_type: "",
  priority: 1,
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface RacesSectionProps {
  races: Goal[];
  onRacesChange: (races: Goal[]) => void;
  onGeneratePlan?: () => void;
  generatingPlan?: boolean;
  hasActivePlan?: boolean;
}

export function RacesSection({
  races,
  onRacesChange,
  onGeneratePlan,
  generatingPlan,
  hasActivePlan,
}: RacesSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRace, setEditingRace] = useState<Goal | null>(null);
  const [form, setForm] = useState<RaceFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [racesChanged, setRacesChanged] = useState(false);

  function openAdd() {
    setEditingRace(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  }

  function openEdit(race: Goal) {
    setEditingRace(race);
    setForm({
      description: race.description,
      target_date: race.target_date ?? "",
      sport: race.sport ?? "",
      race_type: race.race_type ?? "",
      priority: race.priority ?? 1,
    });
    setDialogOpen(true);
  }

  async function saveRace() {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        description: form.description.trim(),
      };
      if (form.target_date) payload.target_date = form.target_date;
      if (form.sport) payload.sport = form.sport;
      if (form.race_type) payload.race_type = form.race_type;
      payload.priority = form.priority;

      if (editingRace) {
        // Update — the backend doesn't have a PUT for goals, so delete + recreate
        await api.delete(`/coach/goals/${editingRace.id}`);
        const res = await api.post<Goal>("/coach/goals", payload);
        onRacesChange(
          races
            .filter((r) => r.id !== editingRace.id)
            .concat([res.data])
            .sort(
              (a, b) =>
                new Date(b.target_date ?? 0).getTime() -
                new Date(a.target_date ?? 0).getTime()
            )
        );
      } else {
        const res = await api.post<Goal>("/coach/goals", payload);
        onRacesChange([res.data, ...races]);
      }
      setDialogOpen(false);
      setRacesChanged(true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRace(id: string) {
    if (!confirm("Delete this race?")) return;
    await api.delete(`/coach/goals/${id}`);
    onRacesChange(races.filter((r) => r.id !== id));
    setRacesChanged(true);
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground">Races</h2>
        <Button variant="outline" size="sm" onClick={openAdd}>
          + Add Race
        </Button>
      </div>

      {races.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">
              No races yet. Add a race to generate a training plan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {races.map((race) => (
              <Card key={race.id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground">
                      {race.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {race.race_type && (
                        <span>
                          {RACE_TYPE_LABELS[race.race_type] ?? race.race_type}
                        </span>
                      )}
                      {race.target_date && (
                        <span>{formatDate(race.target_date)}</span>
                      )}
                      {race.priority === 1 && (
                        <span className="text-primary font-medium">A-race</span>
                      )}
                      {race.priority === 2 && (
                        <span className="text-muted-foreground">B-race</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(race)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRace(race.id)}
                      className="text-muted-foreground hover:text-red-400"
                    >
                      ×
                    </Button>
                  </div>
                </CardContent>
              </Card>
          ))}
          {onGeneratePlan && races.length > 0 && !hasActivePlan && (
            <div className="pt-2">
              <Button
                className="w-full"
                onClick={() => { onGeneratePlan(); setRacesChanged(false); }}
                disabled={generatingPlan}
              >
                {generatingPlan ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Generating Season Plan…
                  </span>
                ) : (
                  `Generate Season Plan (${races.length} race${races.length > 1 ? "s" : ""})`
                )}
              </Button>
            </div>
          )}
          {onGeneratePlan && races.length > 0 && hasActivePlan && (
            <div className="pt-2">
              {racesChanged && (
                <p className="text-xs text-amber-500 mb-2 text-center">
                  Races changed — regenerate your plan to reflect the updates.
                </p>
              )}
              <Button
                variant={racesChanged ? "default" : "outline"}
                className="w-full"
                onClick={() => { onGeneratePlan(); setRacesChanged(false); }}
                disabled={generatingPlan}
              >
                {generatingPlan ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Regenerating Plan…
                  </span>
                ) : (
                  `Regenerate Plan (${races.length} race${races.length > 1 ? "s" : ""})`
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Race Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRace ? "Edit Race" : "Add Race"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="race-description">Description</Label>
              <Input
                id="race-description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="e.g. Ironman 70.3 Muskoka"
                className="text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="race-type">Race Type</Label>
              <select
                id="race-type"
                value={form.race_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, race_type: e.target.value }))
                }
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Select race type…</option>
                {RACE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="race-date">Race Date</Label>
                <Input
                  id="race-date"
                  type="date"
                  value={form.target_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, target_date: e.target.value }))
                  }
                  className="text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="race-sport">Sport</Label>
                <Input
                  id="race-sport"
                  value={form.sport}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sport: e.target.value }))
                  }
                  placeholder="e.g. triathlon"
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, priority: 1 }))}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    form.priority === 1
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  Primary
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, priority: 2 }))}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    form.priority === 2
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  Secondary
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={saveRace}
              disabled={saving || !form.description.trim()}
            >
              {saving
                ? "Saving…"
                : editingRace
                  ? "Save Changes"
                  : "Add Race"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
