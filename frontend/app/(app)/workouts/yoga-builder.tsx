"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Pose { id: string; name: string; duration_seconds: number; side: string; notes: string }
interface Props { content: object; onChange: (c: object) => void }

const SIDES = ["both", "left", "right"];

export function YogaBuilder({ content, onChange }: Props) {
  const sequence: Pose[] = (content as { sequence?: Pose[] }).sequence ?? [];

  function update(s: Pose[]) { onChange({ sequence: s }); }

  function addPose() {
    update([...sequence, { id: crypto.randomUUID(), name: "", duration_seconds: 30, side: "both", notes: "" }]);
  }

  function patch(id: string, p: Partial<Pose>) {
    update(sequence.map((pose) => pose.id !== id ? pose : { ...pose, ...p }));
  }

  const total = sequence.reduce((a, p) => a + p.duration_seconds, 0);

  return (
    <div className="flex flex-col gap-2">
      {sequence.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-4">Add poses or stretches to your sequence</p>
      )}
      {sequence.map((pose, i) => (
        <div key={pose.id} className="flex items-center gap-2 p-2 border border-zinc-100 rounded-lg">
          <span className="text-xs text-zinc-400 w-5 shrink-0">{i + 1}</span>
          <Input value={pose.name} onChange={(e) => patch(pose.id, { name: e.target.value })}
            placeholder="Pose name" className="flex-1 h-8 text-sm" />
          <Input type="number" value={pose.duration_seconds}
            onChange={(e) => patch(pose.id, { duration_seconds: +e.target.value })}
            className="w-20 h-8 text-sm" />
          <span className="text-xs text-zinc-400 shrink-0">sec</span>
          <select value={pose.side} onChange={(e) => patch(pose.id, { side: e.target.value })}
            className="text-sm border border-zinc-200 rounded px-2 h-8 bg-white">
            {SIDES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input value={pose.notes} onChange={(e) => patch(pose.id, { notes: e.target.value })}
            placeholder="Notes" className="w-32 h-8 text-sm" />
          <button onClick={() => update(sequence.filter((p) => p.id !== pose.id))}
            className="text-zinc-300 hover:text-red-400 text-lg leading-none shrink-0">×</button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addPose}>+ Add pose</Button>
      {total > 0 && (
        <p className="text-xs text-zinc-400">Total: ~{Math.round(total / 60)} min</p>
      )}
    </div>
  );
}
