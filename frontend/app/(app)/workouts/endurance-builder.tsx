"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StepType = "warmup" | "interval" | "recovery" | "cooldown" | "repeat";
type TargetType = "hr_zone" | "pace" | "power_zone" | "rpe" | "open";

interface Step {
  id: string;
  type: StepType;
  duration_type: "time" | "distance";
  duration_value: number;
  duration_unit: string;
  target_type: TargetType;
  target_value: object;
  repeat_count?: number;
  repeat_steps?: Step[];
}

interface Props {
  content: object;
  onChange: (c: object) => void;
}

function newStep(): Step {
  return {
    id: crypto.randomUUID(),
    type: "interval",
    duration_type: "time",
    duration_value: 300,
    duration_unit: "seconds",
    target_type: "hr_zone",
    target_value: { zone: 3 },
  };
}

const STEP_COLORS: Record<StepType, string> = {
  warmup: "bg-yellow-50 border-yellow-200",
  interval: "bg-orange-50 border-orange-200",
  recovery: "bg-green-50 border-green-200",
  cooldown: "bg-blue-50 border-blue-200",
  repeat: "bg-purple-50 border-purple-200",
};

export function EnduranceBuilder({ content, onChange }: Props) {
  const steps: Step[] = (content as { steps?: Step[] }).steps ?? [];

  function update(newSteps: Step[]) {
    onChange({ steps: newSteps });
  }

  function addStep() {
    update([...steps, newStep()]);
  }

  function removeStep(id: string) {
    update(steps.filter((s) => s.id !== id));
  }

  function updateStep(id: string, patch: Partial<Step>) {
    update(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  const totalSeconds = steps.reduce((acc, s) => {
    if (s.duration_type === "time") return acc + (s.duration_value || 0);
    return acc;
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      {steps.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-4">Add steps to build your workout</p>
      )}

      {steps.map((step, i) => (
        <div key={step.id} className={`p-3 rounded-lg border ${STEP_COLORS[step.type]}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-zinc-500 w-5">{i + 1}</span>

            <select
              value={step.type}
              onChange={(e) => updateStep(step.id, { type: e.target.value as StepType })}
              className="text-sm border border-zinc-200 rounded px-2 py-1 bg-white"
            >
              {["warmup", "interval", "recovery", "cooldown", "repeat"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={step.duration_value}
                onChange={(e) => updateStep(step.id, { duration_value: +e.target.value })}
                className="w-20 h-8 text-sm"
              />
              <select
                value={step.duration_unit}
                onChange={(e) => updateStep(step.id, { duration_unit: e.target.value,
                  duration_type: e.target.value === "seconds" ? "time" : "distance" })}
                className="text-sm border border-zinc-200 rounded px-2 py-1 bg-white h-8"
              >
                <option value="seconds">sec</option>
                <option value="meters">m</option>
              </select>
            </div>

            <select
              value={step.target_type}
              onChange={(e) => updateStep(step.id, { target_type: e.target.value as TargetType,
                target_value: e.target.value === "hr_zone" ? { zone: 3 } : {} })}
              className="text-sm border border-zinc-200 rounded px-2 py-1 bg-white"
            >
              {["hr_zone", "pace", "power_zone", "rpe", "open"].map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </select>

            {step.target_type === "hr_zone" && (
              <div className="flex items-center gap-1 text-sm">
                Z<Input
                  type="number"
                  min={1} max={5}
                  value={(step.target_value as { zone?: number }).zone ?? 3}
                  onChange={(e) => updateStep(step.id, { target_value: { zone: +e.target.value } })}
                  className="w-14 h-8 text-sm"
                />
              </div>
            )}

            {step.type === "repeat" && (
              <div className="flex items-center gap-1 text-sm">
                ×<Input
                  type="number" min={1}
                  value={step.repeat_count ?? 4}
                  onChange={(e) => updateStep(step.id, { repeat_count: +e.target.value })}
                  className="w-14 h-8 text-sm"
                />
              </div>
            )}

            <button onClick={() => removeStep(step.id)}
              className="ml-auto text-zinc-400 hover:text-red-500 text-lg leading-none">×</button>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addStep}>+ Add step</Button>

      {totalSeconds > 0 && (
        <p className="text-xs text-zinc-400">
          Estimated: ~{Math.round(totalSeconds / 60)} min
        </p>
      )}
    </div>
  );
}
