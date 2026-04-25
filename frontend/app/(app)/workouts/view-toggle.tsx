"use client";

import { Calendar, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  value: "week" | "month";
  onChange: (view: "week" | "month") => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-full bg-muted p-0.5">
      <button
        type="button"
        onClick={() => onChange("week")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          value === "week"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Calendar className="h-3.5 w-3.5" />
        Week
      </button>
      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          value === "month"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Month
      </button>
    </div>
  );
}
