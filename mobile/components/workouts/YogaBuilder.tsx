/**
 * YogaBuilder — Pose sequence construction for yoga and mobility disciplines.
 *
 * Each pose has a name, duration, side (left/right/both/none), and notes.
 *
 * @see Requirements 9.4
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

export type { PoseSide, YogaPose } from "@/lib/workout-types";

// Re-export pure calculation for backward compatibility
export { calculateYogaDuration } from "@/lib/workout-calculations";

import type { YogaPose, PoseSide } from "@/lib/workout-types";
import { calculateYogaDuration } from "@/lib/workout-calculations";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDES: { value: PoseSide; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "none", label: "N/A" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextPoseId = 1;
function generatePoseId(): string {
  return `pose-${Date.now()}-${nextPoseId++}`;
}

function createDefaultPose(): YogaPose {
  return {
    id: generatePoseId(),
    name: "",
    duration_seconds: 30,
    side: "both",
    notes: "",
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface YogaBuilderProps {
  poses: YogaPose[];
  onPosesChange: (poses: YogaPose[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function YogaBuilder({ poses, onPosesChange }: YogaBuilderProps) {
  const colors = useThemeColors();

  const addPose = useCallback(() => {
    onPosesChange([...poses, createDefaultPose()]);
  }, [poses, onPosesChange]);

  const removePose = useCallback(
    (id: string) => {
      onPosesChange(poses.filter((p) => p.id !== id));
    },
    [poses, onPosesChange]
  );

  const updatePose = useCallback(
    (id: string, updates: Partial<YogaPose>) => {
      onPosesChange(
        poses.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    [poses, onPosesChange]
  );

  const totalDuration = calculateYogaDuration(poses);

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={[styles.summaryRow, { backgroundColor: colors.muted }]}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
          Total Duration
        </Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>
          ~{totalDuration} min
        </Text>
      </View>

      {/* Poses */}
      {poses.map((pose, index) => (
        <Card key={pose.id} style={styles.poseCard}>
          {/* Pose header */}
          <View style={styles.poseHeader}>
            <Text style={[styles.poseIndex, { color: colors.mutedForeground }]}>
              #{index + 1}
            </Text>
            <Pressable
              onPress={() => removePose(pose.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove pose ${index + 1}`}
              style={styles.removeButton}
            >
              <Text style={[styles.removeText, { color: colors.destructive }]}>
                ✕
              </Text>
            </Pressable>
          </View>

          {/* Pose name */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Pose Name
          </Text>
          <TextInput
            value={pose.name}
            onChangeText={(text) => updatePose(pose.id, { name: text })}
            placeholder="e.g. Downward Dog"
            style={[
              styles.textInput,
              {
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.cardBorder,
              },
            ]}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Pose name"
          />

          {/* Duration */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Duration (seconds)
          </Text>
          <TextInput
            value={String(pose.duration_seconds)}
            onChangeText={(text) => {
              const num = parseInt(text, 10);
              if (!isNaN(num) && num >= 0) {
                updatePose(pose.id, { duration_seconds: num });
              } else if (text === "") {
                updatePose(pose.id, { duration_seconds: 0 });
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
            accessibilityLabel="Pose duration in seconds"
          />

          {/* Side picker */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Side
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {SIDES.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => updatePose(pose.id, { side: s.value })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      pose.side === s.value ? colors.primary : colors.muted,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: pose.side === s.value }}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        pose.side === s.value
                          ? colors.primaryForeground
                          : colors.foreground,
                    },
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Notes */}
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Notes
          </Text>
          <TextInput
            value={pose.notes}
            onChangeText={(text) => updatePose(pose.id, { notes: text })}
            placeholder="Optional notes…"
            multiline
            numberOfLines={2}
            style={[
              styles.textInput,
              styles.notesInput,
              {
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.cardBorder,
              },
            ]}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel="Pose notes"
          />
        </Card>
      ))}

      {/* Add pose button */}
      <Button title="+ Add Pose" onPress={addPose} variant="secondary" />
    </View>
  );
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
  poseCard: {
    gap: 8,
  },
  poseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  poseIndex: {
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
  notesInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
});
