"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SetRow { reps: number; weight_kg: number; rpe: number; rest_seconds: number }
interface Exercise { id: string; name: string; sets: SetRow[] }
interface Block { id: string; type: string; exercises: Exercise[] }

interface Props { content: object; onChange: (c: object) => void }

function newBlock(): Block {
  return {
    id: crypto.randomUUID(),
    type: "exercise",
    exercises: [{ id: crypto.randomUUID(), name: "", sets: [{ reps: 10, weight_kg: 0, rpe: 7, rest_seconds: 90 }] }],
  };
}

export function StrengthBuilder({ content, onChange }: Props) {
  const blocks: Block[] = (content as { blocks?: Block[] }).blocks ?? [];

  function update(b: Block[]) { onChange({ blocks: b }); }
  function addBlock() { update([...blocks, newBlock()]); }
  function removeBlock(id: string) { update(blocks.filter((b) => b.id !== id)); }

  function updateExerciseName(blockId: string, exId: string, name: string) {
    update(blocks.map((b) => b.id !== blockId ? b : {
      ...b, exercises: b.exercises.map((e) => e.id !== exId ? e : { ...e, name }),
    }));
  }

  function updateSet(blockId: string, exId: string, setIdx: number, patch: Partial<SetRow>) {
    update(blocks.map((b) => b.id !== blockId ? b : {
      ...b, exercises: b.exercises.map((e) => e.id !== exId ? e : {
        ...e, sets: e.sets.map((s, i) => i !== setIdx ? s : { ...s, ...patch }),
      }),
    }));
  }

  function addSet(blockId: string, exId: string) {
    update(blocks.map((b) => b.id !== blockId ? b : {
      ...b, exercises: b.exercises.map((e) => e.id !== exId ? e : {
        ...e, sets: [...e.sets, { reps: 10, weight_kg: 0, rpe: 7, rest_seconds: 90 }],
      }),
    }));
  }

  function removeSet(blockId: string, exId: string, setIdx: number) {
    update(blocks.map((b) => b.id !== blockId ? b : {
      ...b, exercises: b.exercises.map((e) => e.id !== exId ? e : {
        ...e, sets: e.sets.filter((_, i) => i !== setIdx),
      }),
    }));
  }

  function addExercise(blockId: string) {
    update(blocks.map((b) => b.id !== blockId ? b : {
      ...b, exercises: [...b.exercises,
        { id: crypto.randomUUID(), name: "", sets: [{ reps: 10, weight_kg: 0, rpe: 7, rest_seconds: 90 }] }],
    }));
  }

  const totalSets = blocks.flatMap((b) => b.exercises).reduce((a, e) => a + e.sets.length, 0);
  const totalVol = blocks.flatMap((b) => b.exercises).reduce(
    (a, e) => a + e.sets.reduce((sa, s) => sa + s.reps * s.weight_kg, 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {blocks.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-4">Add blocks to build your workout</p>
      )}
      {blocks.map((block) => (
        <div key={block.id} className="border border-zinc-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <select value={block.type} className="text-sm font-medium border-none bg-transparent outline-none"
              onChange={(e) => update(blocks.map((b) => b.id !== block.id ? b : { ...b, type: e.target.value }))}>
              {["exercise", "superset", "circuit", "amrap", "emom"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button onClick={() => removeBlock(block.id)} className="text-zinc-400 hover:text-red-500 text-lg">×</button>
          </div>

          {block.exercises.map((ex) => (
            <div key={ex.id} className="mb-3">
              <Input
                value={ex.name}
                onChange={(e) => updateExerciseName(block.id, ex.id, e.target.value)}
                placeholder="Exercise name (e.g. Back Squat)"
                className="mb-2 font-medium"
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-400">
                    <th className="text-left pb-1">Set</th>
                    <th className="text-left pb-1">Reps</th>
                    <th className="text-left pb-1">kg</th>
                    <th className="text-left pb-1">RPE</th>
                    <th className="text-left pb-1">Rest (s)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((s, i) => (
                    <tr key={i}>
                      <td className="py-0.5 text-zinc-400">{i + 1}</td>
                      {(["reps", "weight_kg", "rpe", "rest_seconds"] as (keyof SetRow)[]).map((field) => (
                        <td key={field} className="py-0.5 pr-2">
                          <Input type="number" value={s[field]}
                            onChange={(e) => updateSet(block.id, ex.id, i, { [field]: +e.target.value })}
                            className="w-16 h-7 text-sm" />
                        </td>
                      ))}
                      <td>
                        <button onClick={() => removeSet(block.id, ex.id, i)}
                          className="text-zinc-300 hover:text-red-400 text-sm">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => addSet(block.id, ex.id)}
                className="text-xs text-zinc-400 hover:text-zinc-600 mt-1">+ add set</button>
            </div>
          ))}
          <button onClick={() => addExercise(block.id)}
            className="text-xs text-blue-500 hover:text-blue-700 mt-1">+ add exercise</button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addBlock}>+ Add block</Button>
      {totalSets > 0 && (
        <p className="text-xs text-zinc-400">{totalSets} sets · ~{totalVol.toFixed(0)} kg total volume</p>
      )}
    </div>
  );
}
