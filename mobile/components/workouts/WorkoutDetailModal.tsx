/**
 * WorkoutDetailModal — Modal showing full workout details.
 *
 * Fetches the full workout from `GET /workouts/{id}` to get the structured
 * `content` field (exercises, steps, poses). Renders discipline-specific
 * content: endurance steps, strength exercises with sets/reps/weight,
 * yoga poses with duration/side.
 *
 * @see Requirements 8.8, 8.13
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useThemeColors, useColorSchemeName } from "@/lib/theme";
import { getDisciplineMeta, formatDuration } from "@/lib/format";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/error-handling";
import type { PlanWorkout, Workout, WorkoutStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusLabel(status: WorkoutStatus): string {
  switch (status) {
    case "completed": return "Completed ✓";
    case "today": return "Scheduled Today";
    case "skipped": return "Skipped";
    case "upcoming": return "Upcoming";
    default: return "";
  }
}

function getStatusVariant(status: WorkoutStatus): "positive" | "negative" | "caution" | "default" {
  switch (status) {
    case "completed": return "positive";
    case "skipped": return "caution";
    default: return "default";
  }
}

// ---------------------------------------------------------------------------
// Structured Content Renderers
// ---------------------------------------------------------------------------

function EnduranceContent({ content, colors }: { content: any; colors: any }) {
  const steps = content?.steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;

  return (
    <View style={styles.contentSection}>
      <Text style={[styles.contentTitle, { color: colors.foreground }]}>
        Workout Steps
      </Text>
      {steps.map((step: any, i: number) => (
        <View
          key={step.id ?? i}
          style={[styles.stepRow, { borderBottomColor: colors.cardBorder }]}
        >
          <View style={[styles.stepBadge, { backgroundColor: getStepColor(step.type, colors) }]}>
            <Text style={styles.stepBadgeText}>{getStepEmoji(step.type)}</Text>
          </View>
          <View style={styles.stepInfo}>
            <Text style={[styles.stepType, { color: colors.foreground }]}>
              {formatStepType(step.type)}
            </Text>
            <Text style={[styles.stepDetail, { color: colors.mutedForeground }]}>
              {step.duration_min ?? 0} min
              {step.target_type && step.target_type !== "open"
                ? ` · ${step.target_type}: ${step.target_value || "—"}`
                : ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function StrengthContent({ content, colors }: { content: any; colors: any }) {
  const blocks = content?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  return (
    <View style={styles.contentSection}>
      <Text style={[styles.contentTitle, { color: colors.foreground }]}>
        Exercises
      </Text>
      {blocks.map((block: any, bi: number) => (
        <View key={block.id ?? bi} style={styles.blockContainer}>
          {block.type && block.type !== "exercise" && (
            <Text style={[styles.blockType, { color: colors.primary }]}>
              {block.type.toUpperCase()}
            </Text>
          )}
          {(block.exercises ?? []).map((ex: any, ei: number) => (
            <View
              key={ex.id ?? ei}
              style={[styles.exerciseRow, { backgroundColor: colors.muted }]}
            >
              <Text style={[styles.exerciseName, { color: colors.foreground }]}>
                {ex.name || "Unnamed"}
              </Text>
              <View style={styles.exerciseStats}>
                <Text style={[styles.exerciseStat, { color: colors.foreground }]}>
                  {ex.sets ?? 0} × {ex.reps ?? 0}
                </Text>
                {ex.weight_kg > 0 && (
                  <Text style={[styles.exerciseStat, { color: colors.mutedForeground }]}>
                    {ex.weight_kg} kg
                  </Text>
                )}
                {ex.rpe != null && ex.rpe > 0 && (
                  <Text style={[styles.exerciseStat, { color: colors.mutedForeground }]}>
                    RPE {ex.rpe}
                  </Text>
                )}
                {ex.rest_seconds > 0 && (
                  <Text style={[styles.exerciseStat, { color: colors.mutedForeground }]}>
                    {ex.rest_seconds}s rest
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function YogaContent({ content, colors }: { content: any; colors: any }) {
  const poses = content?.poses;
  if (!Array.isArray(poses) || poses.length === 0) return null;

  return (
    <View style={styles.contentSection}>
      <Text style={[styles.contentTitle, { color: colors.foreground }]}>
        Pose Sequence
      </Text>
      {poses.map((pose: any, i: number) => (
        <View
          key={pose.id ?? i}
          style={[styles.poseRow, { borderBottomColor: colors.cardBorder }]}
        >
          <Text style={[styles.poseNumber, { color: colors.mutedForeground }]}>
            {i + 1}
          </Text>
          <View style={styles.poseInfo}>
            <Text style={[styles.poseName, { color: colors.foreground }]}>
              {pose.name || "Unnamed"}
            </Text>
            <Text style={[styles.poseDetail, { color: colors.mutedForeground }]}>
              {pose.duration_seconds ?? 0}s
              {pose.side && pose.side !== "none" ? ` · ${pose.side}` : ""}
              {pose.notes ? ` · ${pose.notes}` : ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function getStepEmoji(type: string): string {
  switch (type) {
    case "warmup": return "🔥";
    case "interval": return "⚡";
    case "recovery": return "🌿";
    case "cooldown": return "❄️";
    case "repeat": return "🔁";
    default: return "▶️";
  }
}

function formatStepType(type: string): string {
  switch (type) {
    case "warmup": return "Warm-up";
    case "interval": return "Interval";
    case "recovery": return "Recovery";
    case "cooldown": return "Cool-down";
    case "repeat": return "Repeat";
    default: return type;
  }
}

function getStepColor(type: string, colors: any): string {
  switch (type) {
    case "warmup": return "#f97316";
    case "interval": return colors.primary;
    case "recovery": return colors.statusPositive;
    case "cooldown": return "#60a5fa";
    default: return colors.muted;
  }
}

// ---------------------------------------------------------------------------
// Unified Content Renderer — handles both AI-generated and builder formats
// ---------------------------------------------------------------------------

/**
 * AI-generated workouts have: { warmup: {description, duration_min}, main: [{description, duration_min, zone}], cooldown: {...}, notes, target_hr_zone }
 * Builder workouts have: { steps: [...] } or { blocks: [...] } or { poses: [...] }
 */
function WorkoutContent({ content, builderType, colors }: { content: any; builderType: string | null; colors: any }) {
  // Check for AI-generated format (has warmup/main/cooldown objects)
  if (content.warmup || content.main || content.cooldown) {
    return <AIGeneratedContent content={content} colors={colors} />;
  }

  // Builder formats
  if (content.steps && Array.isArray(content.steps)) {
    return <EnduranceContent content={content} colors={colors} />;
  }
  if (content.blocks && Array.isArray(content.blocks)) {
    return <StrengthContent content={content} colors={colors} />;
  }
  if (content.poses && Array.isArray(content.poses)) {
    return <YogaContent content={content} colors={colors} />;
  }

  return null;
}

/**
 * Renders AI-generated workout content with warmup, main exercises, cooldown, and notes.
 */
function AIGeneratedContent({ content, colors }: { content: any; colors: any }) {
  const warmup = content.warmup;
  const main = Array.isArray(content.main) ? content.main : [];
  const cooldown = content.cooldown;
  const notes = content.notes;
  const targetHrZone = content.target_hr_zone;

  return (
    <View style={styles.contentSection}>
      {/* Target HR Zone */}
      {targetHrZone && targetHrZone !== "N/A" && (
        <View style={[styles.hrZoneBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.hrZoneText, { color: colors.foreground }]}>
            🎯 Target: {targetHrZone}
          </Text>
        </View>
      )}

      {/* Warmup */}
      {warmup && (
        <View style={[styles.aiSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.aiSectionHeader}>
            <Text style={styles.aiSectionEmoji}>🔥</Text>
            <Text style={[styles.aiSectionTitle, { color: colors.foreground }]}>
              Warm-up
            </Text>
            {warmup.duration_min > 0 && (
              <Text style={[styles.aiSectionDuration, { color: colors.mutedForeground }]}>
                {warmup.duration_min} min
              </Text>
            )}
          </View>
          <Text style={[styles.aiSectionText, { color: colors.foreground }]}>
            {warmup.description}
          </Text>
        </View>
      )}

      {/* Main exercises */}
      {main.length > 0 && (
        <View style={styles.aiMainSection}>
          <Text style={[styles.contentTitle, { color: colors.foreground }]}>
            💪 Main Set
          </Text>
          {main.map((item: any, i: number) => (
            <View
              key={i}
              style={[styles.aiExerciseRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={styles.aiExerciseHeader}>
                <Text style={[styles.aiExerciseNumber, { color: colors.primary }]}>
                  {i + 1}
                </Text>
                {item.duration_min > 0 && (
                  <Text style={[styles.aiExerciseDuration, { color: colors.mutedForeground }]}>
                    ~{item.duration_min} min
                  </Text>
                )}
              </View>
              <Text style={[styles.aiExerciseText, { color: colors.foreground }]}>
                {item.description}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Cooldown */}
      {cooldown && (
        <View style={[styles.aiSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.aiSectionHeader}>
            <Text style={styles.aiSectionEmoji}>❄️</Text>
            <Text style={[styles.aiSectionTitle, { color: colors.foreground }]}>
              Cool-down
            </Text>
            {cooldown.duration_min > 0 && (
              <Text style={[styles.aiSectionDuration, { color: colors.mutedForeground }]}>
                {cooldown.duration_min} min
              </Text>
            )}
          </View>
          <Text style={[styles.aiSectionText, { color: colors.foreground }]}>
            {cooldown.description}
          </Text>
        </View>
      )}

      {/* Notes */}
      {notes && (
        <View style={[styles.aiSection, { backgroundColor: colors.muted, borderColor: colors.cardBorder }]}>
          <View style={styles.aiSectionHeader}>
            <Text style={styles.aiSectionEmoji}>📝</Text>
            <Text style={[styles.aiSectionTitle, { color: colors.foreground }]}>
              Coach Notes
            </Text>
          </View>
          <Text style={[styles.aiSectionText, { color: colors.mutedForeground }]}>
            {notes}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface WorkoutDetailModalProps {
  workout: PlanWorkout | null;
  status: WorkoutStatus;
  visible: boolean;
  onClose: () => void;
  onDelete: (workoutId: string) => void;
  deleting?: boolean;
}

export function WorkoutDetailModal({
  workout,
  status,
  visible,
  onClose,
  onDelete,
  deleting = false,
}: WorkoutDetailModalProps) {
  const colors = useThemeColors();
  const isDark = useColorSchemeName() === "dark";
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [fullWorkout, setFullWorkout] = useState<Workout | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  // Fetch full workout data when modal opens
  useEffect(() => {
    if (visible && workout?.id) {
      setLoadingFull(true);
      setFullWorkout(null);
      api
        .get<Workout>(`/workouts/${workout.id}`)
        .then((res) => setFullWorkout(res.data))
        .catch(() => {
          // Fall back to plan workout data (no content)
        })
        .finally(() => setLoadingFull(false));
    }
  }, [visible, workout?.id]);

  if (!workout) return null;

  const meta = getDisciplineMeta(workout.discipline, isDark);
  const durationText = formatDuration(workout.estimated_duration_seconds);
  const tssText = workout.estimated_tss != null ? `${workout.estimated_tss}` : "—";

  const content = fullWorkout?.content ?? null;
  const builderType = fullWorkout?.builder_type ?? null;
  const volumeKg = fullWorkout?.estimated_volume_kg ?? null;

  const handleDelete = () => {
    if (confirmingDelete) {
      onDelete(workout.id);
      setConfirmingDelete(false);
    } else {
      setConfirmingDelete(true);
    }
  };

  const handleClose = () => {
    setConfirmingDelete(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerIcon}>{meta.icon}</Text>
            <Text
              style={[styles.headerTitle, { color: colors.foreground }]}
              numberOfLines={2}
            >
              {workout.name || "Untitled Workout"}
            </Text>
          </View>
          <Pressable
            onPress={handleClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={[styles.closeText, { color: colors.mutedForeground }]}>
              ✕
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Badges */}
          <View style={styles.badgeRow}>
            <Badge text={meta.label} color={meta.color} />
            <Badge text={getStatusLabel(status)} variant={getStatusVariant(status)} />
          </View>

          {/* Key metrics */}
          <View style={[styles.metricsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.metricsRow}>
              <MetricItem label="Duration" value={durationText} colors={colors} />
              <MetricItem label="TSS" value={tssText} colors={colors} />
            </View>
            {volumeKg != null && volumeKg > 0 && (
              <View style={[styles.metricDivider, { borderTopColor: colors.cardBorder }]}>
                <MetricItem label="Volume" value={`${volumeKg.toLocaleString()} kg`} colors={colors} />
              </View>
            )}
          </View>

          {/* Description */}
          {workout.description && (
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Description
              </Text>
              <Text style={[styles.sectionContent, { color: colors.mutedForeground }]}>
                {workout.description}
              </Text>
            </View>
          )}

          {/* Structured content — loaded from full workout */}
          {loadingFull && (
            <View style={styles.loadingContent}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                Loading workout details…
              </Text>
            </View>
          )}

          {content && !loadingFull && (
            <WorkoutContent content={content} builderType={builderType} colors={colors} />
          )}

          {/* Scheduled date */}
          {workout.scheduled_date && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                Scheduled
              </Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {new Date(workout.scheduled_date).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
          )}

          {/* Delete */}
          <View style={styles.deleteSection}>
            {confirmingDelete ? (
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmText, { color: colors.destructive }]}>
                  Delete this workout?
                </Text>
                <View style={styles.confirmButtons}>
                  <Button title="Cancel" variant="secondary" onPress={() => setConfirmingDelete(false)} style={styles.confirmButton} />
                  <Button title="Delete" variant="destructive" onPress={handleDelete} loading={deleting} style={styles.confirmButton} />
                </View>
              </View>
            ) : (
              <Button title="Delete Workout" variant="destructive" onPress={handleDelete} loading={deleting} />
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricItem({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.metricItem}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { fontSize: 24 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 20, fontWeight: "600" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 16 },
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metricsCard: { borderWidth: 1, borderRadius: 12, padding: 16 },
  metricsRow: { flexDirection: "row", gap: 24 },
  metricDivider: { borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  metricItem: { flex: 1 },
  metricLabel: { fontSize: 12, fontWeight: "500", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  sectionCard: { borderWidth: 1, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionContent: { fontSize: 14, lineHeight: 22 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  infoLabel: { fontSize: 14, fontWeight: "500" },
  infoValue: { fontSize: 14, fontWeight: "600" },
  deleteSection: { marginTop: 8 },
  confirmRow: { gap: 12 },
  confirmText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  confirmButtons: { flexDirection: "row", gap: 12 },
  confirmButton: { flex: 1 },

  // Loading
  loadingContent: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  loadingText: { fontSize: 14 },

  // Structured content
  contentSection: { gap: 8 },
  contentTitle: { fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },

  // Endurance steps
  stepRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stepBadge: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 12 },
  stepBadgeText: { fontSize: 16 },
  stepInfo: { flex: 1 },
  stepType: { fontSize: 15, fontWeight: "600" },
  stepDetail: { fontSize: 13, marginTop: 2 },

  // Strength exercises
  blockContainer: { gap: 6 },
  blockType: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  exerciseRow: { borderRadius: 10, padding: 12, gap: 4 },
  exerciseName: { fontSize: 15, fontWeight: "600" },
  exerciseStats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  exerciseStat: { fontSize: 13, fontWeight: "500" },

  // Yoga poses
  poseRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  poseNumber: { width: 24, fontSize: 13, fontWeight: "600", textAlign: "center" },
  poseInfo: { flex: 1, marginLeft: 8 },
  poseName: { fontSize: 15, fontWeight: "600" },
  poseDetail: { fontSize: 13, marginTop: 2 },

  // AI-generated content
  hrZoneBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginBottom: 4 },
  hrZoneText: { fontSize: 14, fontWeight: "600" },
  aiSection: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  aiSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiSectionEmoji: { fontSize: 18 },
  aiSectionTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  aiSectionDuration: { fontSize: 13, fontWeight: "500" },
  aiSectionText: { fontSize: 14, lineHeight: 22 },
  aiMainSection: { gap: 8 },
  aiExerciseRow: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  aiExerciseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  aiExerciseNumber: { fontSize: 16, fontWeight: "800" },
  aiExerciseDuration: { fontSize: 13, fontWeight: "500" },
  aiExerciseText: { fontSize: 14, lineHeight: 22 },
});
