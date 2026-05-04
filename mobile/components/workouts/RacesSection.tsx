/**
 * RacesSection — Manage races/goals and generate a season plan.
 *
 * Displays a list of active races with delete (confirmation) support.
 * Provides an inline form to add a new race (description, target date,
 * sport, race type, priority). Includes a "Generate Season Plan" button
 * that triggers AI plan generation.
 *
 * @see Requirements 8.11, 8.12
 */

import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { useThemeColors } from "@/lib/theme";
import { formatDate } from "@/lib/format";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/error-handling";
import type { Goal } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPORT_OPTIONS = [
  "Triathlon",
  "Running",
  "Cycling",
  "Swimming",
  "Duathlon",
  "Other",
] as const;

const RACE_TYPE_OPTIONS = [
  "Sprint",
  "Olympic",
  "Half Ironman",
  "Ironman",
  "Marathon",
  "Half Marathon",
  "10K",
  "5K",
  "Century",
  "Gran Fondo",
  "Other",
] as const;

const PRIORITY_OPTIONS = [
  { label: "A — Primary", value: 1 },
  { label: "B — Secondary", value: 2 },
  { label: "C — Training", value: 3 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface RacesSectionProps {
  /** Active races/goals. */
  races: Goal[];
  /** Callback after a race is added or deleted (parent should re-fetch). */
  onRacesChanged: () => void;
  /** Callback to generate a season plan from configured races. */
  onGeneratePlan: () => void;
  /** Whether plan generation is in progress. */
  generatingPlan?: boolean;
  /** Optional style overrides. */
  style?: ViewStyle;
}

interface NewRaceForm {
  description: string;
  target_date: string;
  sport: string;
  race_type: string;
  priority: number;
}

const EMPTY_FORM: NewRaceForm = {
  description: "",
  target_date: "",
  sport: "Triathlon",
  race_type: "Olympic",
  priority: 1,
};

export function RacesSection({
  races,
  onRacesChanged,
  onGeneratePlan,
  generatingPlan = false,
  style,
}: RacesSectionProps) {
  const colors = useThemeColors();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewRaceForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Add race
  // -------------------------------------------------------------------------

  const handleAddRace = async () => {
    if (!form.description.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await api.post("/coach/goals", {
        description: form.description.trim(),
        target_date: form.target_date || null,
        sport: form.sport,
        race_type: form.race_type,
        priority: form.priority,
        is_active: true,
      });
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      onRacesChanged();
    } catch (err: unknown) {
      setError(extractApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Delete race
  // -------------------------------------------------------------------------

  const handleDeleteRace = async (raceId: string) => {
    if (confirmDeleteId !== raceId) {
      setConfirmDeleteId(raceId);
      return;
    }

    setDeletingId(raceId);
    setError(null);
    try {
      await api.delete(`/coach/goals/${raceId}`);
      setConfirmDeleteId(null);
      onRacesChanged();
    } catch (err: unknown) {
      setError(extractApiError(err).message);
    } finally {
      setDeletingId(null);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const activeRaces = races.filter((r) => r.is_active);

  return (
    <Card style={[styles.container, style]}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Races & Goals
        </Text>
        <Pressable
          onPress={() => {
            setShowForm(!showForm);
            setError(null);
          }}
          style={[styles.addButton, { backgroundColor: colors.muted }]}
          accessibilityRole="button"
          accessibilityLabel={showForm ? "Cancel adding race" : "Add race"}
        >
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            {showForm ? "Cancel" : "+ Add"}
          </Text>
        </Pressable>
      </View>

      {/* Error */}
      {error && (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.alert}
        />
      )}

      {/* Race list */}
      {activeRaces.length === 0 && !showForm && (
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No races configured. Add a race to get started.
        </Text>
      )}

      {activeRaces.map((race) => (
        <View
          key={race.id}
          style={[styles.raceItem, { borderBottomColor: colors.cardBorder }]}
        >
          <View style={styles.raceInfo}>
            <Text
              style={[styles.raceDescription, { color: colors.foreground }]}
              numberOfLines={2}
            >
              {race.description}
            </Text>
            <View style={styles.raceMeta}>
              {race.target_date && (
                <Text style={[styles.raceDate, { color: colors.mutedForeground }]}>
                  {formatDate(race.target_date)}
                </Text>
              )}
              {race.sport && (
                <Badge text={race.sport} variant="default" />
              )}
              {race.race_type && (
                <Badge text={race.race_type} variant="default" />
              )}
              <Badge
                text={`P${race.priority}`}
                variant={race.priority === 1 ? "positive" : race.priority === 2 ? "caution" : "default"}
              />
            </View>
          </View>

          {/* Delete button / confirmation */}
          {confirmDeleteId === race.id ? (
            <View style={styles.deleteConfirm}>
              <Pressable
                onPress={() => setConfirmDeleteId(null)}
                style={styles.cancelDeleteButton}
                accessibilityRole="button"
                accessibilityLabel="Cancel delete"
              >
                <Text style={[styles.cancelDeleteText, { color: colors.mutedForeground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleDeleteRace(race.id)}
                disabled={deletingId === race.id}
                style={[styles.confirmDeleteButton, { backgroundColor: colors.destructive }]}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete"
              >
                <Text style={styles.confirmDeleteText}>
                  {deletingId === race.id ? "…" : "Delete"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => handleDeleteRace(race.id)}
              style={styles.deleteButton}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${race.description}`}
              hitSlop={8}
            >
              <Text style={[styles.deleteIcon, { color: colors.destructive }]}>
                🗑
              </Text>
            </Pressable>
          )}
        </View>
      ))}

      {/* Add race form */}
      {showForm && (
        <View style={[styles.formContainer, { borderTopColor: colors.cardBorder }]}>
          <Input
            label="Description"
            placeholder="e.g. Ironman 70.3 Taupo"
            value={form.description}
            onChangeText={(text) => setForm((f) => ({ ...f, description: text }))}
          />

          <Input
            label="Target Date (YYYY-MM-DD)"
            placeholder="2025-03-15"
            value={form.target_date}
            onChangeText={(text) => setForm((f) => ({ ...f, target_date: text }))}
            keyboardType="numbers-and-punctuation"
          />

          {/* Sport picker */}
          <View style={styles.pickerGroup}>
            <Text style={[styles.pickerLabel, { color: colors.foreground }]}>
              Sport
            </Text>
            <View style={styles.chipRow}>
              {SPORT_OPTIONS.map((sport) => (
                <Pressable
                  key={sport}
                  onPress={() => setForm((f) => ({ ...f, sport }))}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        form.sport === sport ? colors.primary : colors.muted,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.sport === sport }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          form.sport === sport
                            ? colors.primaryForeground
                            : colors.foreground,
                      },
                    ]}
                  >
                    {sport}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Race type picker */}
          <View style={styles.pickerGroup}>
            <Text style={[styles.pickerLabel, { color: colors.foreground }]}>
              Race Type
            </Text>
            <View style={styles.chipRow}>
              {RACE_TYPE_OPTIONS.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setForm((f) => ({ ...f, race_type: type }))}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        form.race_type === type ? colors.primary : colors.muted,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.race_type === type }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          form.race_type === type
                            ? colors.primaryForeground
                            : colors.foreground,
                      },
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Priority picker */}
          <View style={styles.pickerGroup}>
            <Text style={[styles.pickerLabel, { color: colors.foreground }]}>
              Priority
            </Text>
            <View style={styles.chipRow}>
              {PRIORITY_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setForm((f) => ({ ...f, priority: opt.value }))}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        form.priority === opt.value
                          ? colors.primary
                          : colors.muted,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.priority === opt.value }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          form.priority === opt.value
                            ? colors.primaryForeground
                            : colors.foreground,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Button
            title="Add Race"
            onPress={handleAddRace}
            loading={saving}
            disabled={!form.description.trim()}
          />
        </View>
      )}

      {/* Generate Season Plan button */}
      {activeRaces.length > 0 && (
        <View style={styles.generateSection}>
          <Button
            title="Generate Season Plan"
            onPress={onGeneratePlan}
            loading={generatingPlan}
            variant="primary"
          />
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  addButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  alert: {
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
  },
  raceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  raceInfo: {
    flex: 1,
    gap: 6,
  },
  raceDescription: {
    fontSize: 15,
    fontWeight: "600",
  },
  raceMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  raceDate: {
    fontSize: 13,
    fontWeight: "500",
  },
  deleteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteIcon: {
    fontSize: 18,
  },
  deleteConfirm: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  cancelDeleteButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  cancelDeleteText: {
    fontSize: 13,
    fontWeight: "500",
  },
  confirmDeleteButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  formContainer: {
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 4,
    gap: 14,
  },
  pickerGroup: {
    gap: 6,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  generateSection: {
    marginTop: 16,
  },
});
