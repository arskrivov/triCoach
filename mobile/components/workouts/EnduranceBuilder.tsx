/**
 * EnduranceBuilder — Step-based workout construction for endurance disciplines.
 *
 * Supports warmup, interval, recovery, cooldown, and repeat step types.
 * Each step has a duration and optional target (HR zone, pace, power zone, RPE, open).
 *
 * Exports a pure `calculateEnduranceDuration` function for property-based testing.
 *
 * @see Requirements 9.2
 */

import React, { useCallback } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useThemeColors } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Types (re-exported from shared module)
// ---------------------------------------------------------------------------

export type {
  EnduranceStepType,
  TargetType,
  EnduranceStep,
} from "@/lib/workout-types";

// Re-export pure calculation for backward compatibility
export { calculateEnduranceDuration } from "@/lib/workout-calculations";

import type { EnduranceStep, TargetType } from "@/lib/workout-types";
import { calculateEnduranceDuration } from "@/lib/workout-calculations";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_TYPES: { value: EnduranceStepType; label: string; emoji: string }[] =
  [
    { value: "warmup", label: "Warm-up", emoji: "🔥" },
    { value: "interval", label: "Interval", emoji: "⚡" },
    { value: "recovery", label: "Recovery", emoji: "🌿" },
    { value: "cooldown", label: "Cool-down", emoji: "❄️" },
    { value: "repeat", label: "Repeat", emoji: "🔁" },
  ];

const TARGET_TYPES: { value: TargetType; label: string }[] = [
  { value: "hr_zone", label: "HR Zone" },
  { value: "pace", label: "Pace" },
  { value: "power_zone", label: "Power Zone" },
  { value: "rpe", label: "RPE" },
  { value: "open", label: "Open" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 1;
function generateId(): string {
  return `step-${Date.now()}-${nextId++}`;
}

function createDefaultStep(): EnduranceStep {
  return {
    id: generateId(),
    type: "interval",
    duration_min: 5,
    target_type: "open",
    target_value: "",
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnduranceBuilderProps {
  steps: EnduranceStep[];
  onStepsChange: (steps: EnduranceStep[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EnduranceBuilder({
  steps,
  onStepsChange,
}: EnduranceBuilderProps) {
  const colors = useThemeColors();

  const addStep = useCallback(() => {
    onStepsChange([...steps, createDefaultStep()]);
  }, [steps, onStepsChange]);

  const removeStep = useCallback(
    (id: string) => {
      onStepsChange(steps.filter((s) => s.id !== id));
    },
    [steps, onStepsChange]
  );

  const updateStep = useCallback(
    (id: string, updates: Partial<EnduranceStep>) => {
      onStepsChange(
        steps.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    [steps, onStepsChange]
  );

  const totalDuration = calculateEnduranceDuration(steps);

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View
        style={[styles.summaryRow, { backgroundColor: colors.muted }]}
      >
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
          Total Duration
        </Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>
          {totalDuration} min
        </Text>
      </View>

      {/* Steps */}
      {steps.map((step, index) => (
        <Card key={step.id} style={styles.stepCard}>
          {/* Step header */}
          <View style={styles.stepHeader}>
            <Text style={[styles.stepIndex, { color: colors.mutedForeground }]}>
              #{index + 1}
            </Text>
            <Pressable
              onPress={() => removeStep(step.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove step ${index + 1}`}
              style={styles.removeButton}
            >
              <Text style={[styles.removeText, { color: colors.destructive }]}>
                ✕
              </Text>
            </Pressable>
          </View>

          {/* Step type picker */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Type
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {STEP_TYPES.map((st) => (
              <Pressable
                key={st.value}
                onPress={() => updateStep(step.id, { type: st.value })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      step.type === st.value ? colors.primary : colors.muted,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: step.type === st.value }}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        step.type === st.value
                          ? colors.primaryForeground
                          : colors.foreground,
                    },
                  ]}
                >
                  {st.emoji} {st.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Duration */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Duration (min)
          </Text>
          <TextInput
            value={String(step.duration_min)}
            onChangeText={(text) => {
              const num = parseInt(text, 10);
              if (!isNaN(num) && num >= 0) {
                updateStep(step.id, { duration_min: num });
              } else if (text === "") {
                updateStep(step.id, { duration_min: 0 });
              }
            }}
            keyboardType="numeric"
            style={[
              styles.textInput,
              {
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.cardBorder,
              },
            ]}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Step duration in minutes"
          />

          {/* Target type */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Target
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {TARGET_TYPES.map((tt) => (
              <Pressable
                key={tt.value}
                onPress={() => updateStep(step.id, { target_type: tt.value })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      step.target_type === tt.value
                        ? colors.primary
                        : colors.muted,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: step.target_type === tt.value }}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        step.target_type === tt.value
                          ? colors.primaryForeground
                          : colors.foreground,
                    },
                  ]}
                >
                  {tt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Target value (hidden for "open") */}
          {step.target_type !== "open" && (
            <>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                Target Value
              </Text>
              <TextInput
                value={step.target_value}
                onChangeText={(text) =>
                  updateStep(step.id, { target_value: text })
                }
                placeholder={getTargetPlaceholder(step.target_type)}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.muted,
                    color: colors.foreground,
                    borderColor: colors.cardBorder,
                  },
                ]}
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Target value"
              />
            </>
          )}
        </Card>
      ))}

      {/* Add step button */}
      <Button title="+ Add Step" onPress={addStep} variant="secondary" />
    </View>
  );
}

function getTargetPlaceholder(targetType: TargetType): string {
  switch (targetType) {
    case "hr_zone":
      return "e.g. Zone 2";
    case "pace":
      return "e.g. 5:30/km";
    case "power_zone":
      return "e.g. Zone 3";
    case "rpe":
      return "e.g. 6/10";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  stepCard: {
    gap: 8,
  },
  stepHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepIndex: {
    fontSize: 13,
    fontWeight: "600",
  },
  removeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    fontSize: 16,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  chipRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  textInput: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 16,
  },
});
