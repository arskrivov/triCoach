/**
 * Workout Builder screen — Create and edit structured workouts.
 *
 * Provides name input, discipline picker, scheduled date picker, and switches
 * between EnduranceBuilder, StrengthBuilder, or YogaBuilder based on the
 * selected discipline. Supports "Save as template" mode and estimated
 * duration/volume summaries.
 *
 * Save: `POST /workouts` (new) or `PUT /workouts/{id}` (edit).
 * Navigates back to Workout Hub on success.
 *
 * @see Requirements 9.1, 9.5, 9.6, 9.7, 9.8, 9.9
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  EnduranceBuilder,
  type EnduranceStep,
} from "@/components/workouts/EnduranceBuilder";
import {
  StrengthBuilder,
  type StrengthBlock,
} from "@/components/workouts/StrengthBuilder";
import {
  YogaBuilder,
  type YogaPose,
} from "@/components/workouts/YogaBuilder";
import {
  calculateEnduranceDuration,
  calculateStrengthVolume,
  calculateStrengthSets,
  calculateYogaDuration,
} from "@/lib/workout-calculations";
import { useThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { getDisciplineMeta, formatDate } from "@/lib/format";
import {
  extractApiError,
  isNetworkError,
  getNetworkErrorMessage,
} from "@/lib/error-handling";
import type { Discipline } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BuilderDiscipline = Discipline;

type BuilderType = "endurance" | "strength" | "yoga";

function getBuilderType(discipline: BuilderDiscipline): BuilderType {
  switch (discipline) {
    case "STRENGTH":
      return "strength";
    case "YOGA":
    case "MOBILITY":
      return "yoga";
    default:
      return "endurance";
  }
}

const DISCIPLINES: BuilderDiscipline[] = [
  "RUN",
  "SWIM",
  "RIDE_ROAD",
  "RIDE_GRAVEL",
  "STRENGTH",
  "YOGA",
  "MOBILITY",
  "OTHER",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkoutBuilderScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    discipline?: string;
    scheduled_date?: string;
    description?: string;
    content?: string;
    is_template?: string;
  }>();

  // Determine if editing an existing workout
  const editId = params.id ?? null;

  // Parse pre-filled content if editing
  const prefilled = useMemo(() => {
    if (params.content) {
      try {
        return JSON.parse(params.content);
      } catch {
        return null;
      }
    }
    return null;
  }, [params.content]);

  // Form state
  const [name, setName] = useState(params.name ?? "");
  const [discipline, setDiscipline] = useState<BuilderDiscipline>(
    (params.discipline as BuilderDiscipline) ?? "RUN"
  );
  const [scheduledDate, setScheduledDate] = useState<Date | null>(
    params.scheduled_date ? new Date(params.scheduled_date) : null
  );
  const [dateText, setDateText] = useState(
    scheduledDate ? scheduledDate.toISOString().slice(0, 10) : ""
  );
  const [isTemplate, setIsTemplate] = useState(params.is_template === "true");
  const [description, setDescription] = useState(params.description ?? "");

  // Builder content state
  const [enduranceSteps, setEnduranceSteps] = useState<EnduranceStep[]>(
    prefilled?.steps ?? []
  );
  const [strengthBlocks, setStrengthBlocks] = useState<StrengthBlock[]>(
    prefilled?.blocks ?? []
  );
  const [yogaPoses, setYogaPoses] = useState<YogaPose[]>(
    prefilled?.poses ?? []
  );

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const builderType = getBuilderType(discipline);

  // -------------------------------------------------------------------------
  // Summaries
  // -------------------------------------------------------------------------

  const estimatedDuration = useMemo(() => {
    switch (builderType) {
      case "endurance":
        return calculateEnduranceDuration(enduranceSteps);
      case "strength":
        // Rough estimate: 2 min per set for strength
        return calculateStrengthSets(strengthBlocks) * 2;
      case "yoga":
        return calculateYogaDuration(yogaPoses);
      default:
        return 0;
    }
  }, [builderType, enduranceSteps, strengthBlocks, yogaPoses]);

  const estimatedVolume = useMemo(() => {
    if (builderType === "strength") {
      return calculateStrengthVolume(strengthBlocks);
    }
    return null;
  }, [builderType, strengthBlocks]);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("Please enter a workout name.");
      return;
    }

    setSaving(true);
    setError(null);

    // Build content payload based on builder type
    let content: Record<string, unknown> = {};
    switch (builderType) {
      case "endurance":
        content = { steps: enduranceSteps };
        break;
      case "strength":
        content = { blocks: strengthBlocks };
        break;
      case "yoga":
        content = { poses: yogaPoses };
        break;
    }

    const payload = {
      name: name.trim(),
      discipline,
      builder_type: builderType,
      description: description.trim() || null,
      content,
      estimated_duration_seconds: estimatedDuration * 60,
      estimated_volume_kg: estimatedVolume,
      is_template: isTemplate,
      scheduled_date:
        isTemplate || !scheduledDate
          ? null
          : scheduledDate.toISOString().slice(0, 10),
    };

    try {
      if (editId) {
        await api.put(`/workouts/${editId}`, payload);
      } else {
        await api.post("/workouts", payload);
      }
      router.back();
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        setError(getNetworkErrorMessage());
      } else {
        setError(extractApiError(err).message);
      }
    } finally {
      setSaving(false);
    }
  }, [
    name,
    discipline,
    builderType,
    description,
    enduranceSteps,
    strengthBlocks,
    yogaPoses,
    estimatedDuration,
    estimatedVolume,
    isTemplate,
    scheduledDate,
    editId,
    router,
  ]);

  // -------------------------------------------------------------------------
  // Date picker
  // -------------------------------------------------------------------------

  const handleDateTextChange = (text: string) => {
    setDateText(text);
    // Parse YYYY-MM-DD format
    const parsed = new Date(text + "T00:00:00");
    if (!isNaN(parsed.getTime()) && text.length === 10) {
      setScheduledDate(parsed);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Error */}
      {error && (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.alert}
        />
      )}

      {/* Name */}
      <Input
        label="Workout Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Tempo Run"
      />

      {/* Discipline picker */}
      <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
        Discipline
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
      >
        {DISCIPLINES.map((d) => {
          const meta = getDisciplineMeta(d);
          const isSelected = discipline === d;
          return (
            <Pressable
              key={d}
              onPress={() => setDiscipline(d)}
              style={[
                styles.disciplineChip,
                {
                  backgroundColor: isSelected ? meta.color : colors.muted,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.disciplineChipText,
                  {
                    color: isSelected ? "#ffffff" : colors.foreground,
                  },
                ]}
              >
                {meta.icon} {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Scheduled date */}
      {!isTemplate && (
        <Input
          label="Scheduled Date"
          value={dateText}
          onChangeText={handleDateTextChange}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
        />
      )}

      {/* Save as template toggle */}
      <View style={styles.templateRow}>
        <Text style={[styles.templateLabel, { color: colors.foreground }]}>
          Save as template
        </Text>
        <Switch
          value={isTemplate}
          onValueChange={(val) => {
            setIsTemplate(val);
            if (val) {
              setScheduledDate(null);
              setDateText("");
            }
          }}
          trackColor={{ false: colors.muted, true: colors.primary }}
          thumbColor={colors.primaryForeground}
          accessibilityLabel="Save as template"
        />
      </View>

      {/* Description */}
      <Input
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Workout notes…"
        multiline
        numberOfLines={3}
        style={{ minHeight: 60 }}
      />

      {/* Estimated summaries */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text
              style={[styles.summaryLabel, { color: colors.mutedForeground }]}
            >
              Est. Duration
            </Text>
            <Text
              style={[styles.summaryValue, { color: colors.foreground }]}
            >
              {estimatedDuration} min
            </Text>
          </View>
          {estimatedVolume !== null && (
            <View style={styles.summaryItem}>
              <Text
                style={[styles.summaryLabel, { color: colors.mutedForeground }]}
              >
                Est. Volume
              </Text>
              <Text
                style={[styles.summaryValue, { color: colors.foreground }]}
              >
                {estimatedVolume.toLocaleString()} kg
              </Text>
            </View>
          )}
        </View>
      </Card>

      {/* Builder */}
      <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
        {builderType === "endurance"
          ? "Workout Steps"
          : builderType === "strength"
            ? "Exercise Blocks"
            : "Pose Sequence"}
      </Text>

      {builderType === "endurance" && (
        <EnduranceBuilder
          steps={enduranceSteps}
          onStepsChange={setEnduranceSteps}
        />
      )}
      {builderType === "strength" && (
        <StrengthBuilder
          blocks={strengthBlocks}
          onBlocksChange={setStrengthBlocks}
        />
      )}
      {builderType === "yoga" && (
        <YogaBuilder poses={yogaPoses} onPosesChange={setYogaPoses} />
      )}

      {/* Save button */}
      <Button
        title={editId ? "Update Workout" : "Save Workout"}
        onPress={handleSave}
        loading={saving}
        variant="primary"
        style={styles.saveButton}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  alert: {
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
  },
  disciplineChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  disciplineChipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  templateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  templateLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  summaryCard: {
    gap: 0,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  saveButton: {
    marginTop: 8,
  },
});
