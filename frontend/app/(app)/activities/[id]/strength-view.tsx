import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ExerciseRecord } from "@/lib/types";

interface Props {
  exercises: ExerciseRecord[];
  muscleGroups: string[] | null;
}

export function StrengthView({ exercises, muscleGroups }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {muscleGroups && muscleGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {muscleGroups.map((mg) => (
            <Badge key={mg} variant="secondary">
              {mg}
            </Badge>
          ))}
        </div>
      )}

      {exercises.map((ex) => (
        <Card key={ex.name} className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{ex.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left pb-1 font-medium">Set</th>
                  <th className="text-right pb-1 font-medium">Reps</th>
                  <th className="text-right pb-1 font-medium">Weight</th>
                  <th className="text-right pb-1 font-medium">RPE</th>
                </tr>
              </thead>
              <tbody>
                {ex.sets.map((set, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 text-right">{set.reps ?? "—"}</td>
                    <td className="py-1.5 text-right">
                      {set.weight_kg != null ? `${set.weight_kg} kg` : "—"}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {set.rpe ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ex.sets.some((s) => s.weight_kg && s.reps) && (
              <p className="text-xs text-muted-foreground mt-2">
                Volume:{" "}
                {ex.sets
                  .reduce(
                    (acc, s) => acc + (s.weight_kg ?? 0) * (s.reps ?? 0),
                    0
                  )
                  .toFixed(0)}{" "}
                kg
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
