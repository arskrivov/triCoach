import { WorkoutBuilder } from "../workout-builder";

export default function NewWorkoutPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New Workout</h1>
      <WorkoutBuilder />
    </div>
  );
}
