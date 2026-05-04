/**
 * StrengthBuilder — Block-based workout construction for strength disciplines.
 *
 * Supports exercise, superset, circuit, AMRAP, and EMOM block types.
 * Each exercise has sets, reps, weight, RPE, and rest fields.
 * Includes exercise library search via `GET /workouts/exercises/library`.
 *
 * Exports a pure `calculateStrengthVolume` function for property-based testing.
 *
 * @see Requirements 9.3
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types (re-exported from shared module)
// ---------------------------------------------------------------------------

export type {
  StrengthBlockType,
  StrengthExercise,
  StrengthBlock,
} from "@/lib/workout-types";

// Re-export pure calculations for backward compatibility
export {
  calculateStrengthVolume,
  calculateStrengthSets,
} from "@/lib/workout-calculations";

import type {
  StrengthBlock,
  StrengthBlockType,
  StrengthExercise,
} from "@/lib/workout-types";
import {
  calculateStrengthVolume,
  calculateStrengthSets,
} from "@/lib/workout-calculations";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK_TYPES: { value: StrengthBlockType; label: string; emoji: string }[] =
  [
    { value: "exercise", label: "Exercise", emoji: "🏋️" },
    { value: "superset", label: "Superset", emoji: "🔄" },
    { value: "circuit", label: "Circuit", emoji: "⭕" },
    { value: "amrap", label: "AMRAP", emoji: "💪" },
    { value: "emom", label: "EMOM", emoji: "⏱️" },
  ];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextBlockId = 1;
function generateBlockId(): string {
  return `block-${Date.now()}-${nextBlockId++}`;
}

let nextExId = 1;
function generateExerciseId(): string {
  return `ex-${Date.now()}-${nextExId++}`;
}

function createDefaultExercise(): StrengthExercise {
  return {
    id: generateExerciseId(),
    name: "",
    sets: 3,
    reps: 10,
    weight_kg: 0,
    rpe: null,
    rest_seconds: 90,
  };
}

function createDefaultBlock(): StrengthBlock {
  return {
    id: generateBlockId(),
    type: "exercise",
    exercises: [createDefaultExercise()],
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StrengthBuilderProps {
  blocks: StrengthBlock[];
  onBlocksChange: (blocks: StrengthBlock[]) => void;
}

// ---------------------------------------------------------------------------
// Exercise Library Search
// ---------------------------------------------------------------------------

interface LibraryExercise {
  name: string;
  muscle_group?: string;
}

function ExerciseSearch({
  onSelect,
}: {
  onSelect: (name: string) => void;
}) {
  const colors = useThemeColors();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryExercise[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get<LibraryExercise[]>(
          "/workouts/exercises/library",
          { params: { q: query } }
        );
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <View style={styles.searchContainer}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search exercise library…"
        style={[
          styles.textInput,
          {
            backgroundColor: colors.muted,
            color: colors.foreground,
            borderColor: colors.cardBorder,
          },
        ]}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Search exercise library"
      />
      {searching && (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.searchSpinner}
        />
      )}
      {results.length > 0 && (
        <View
          style={[
            styles.searchResults,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          {results.slice(0, 5).map((ex, i) => (
            <Pressable
              key={`${ex.name}-${i}`}
              onPress={() => {
                onSelect(ex.name);
                setQuery("");
                setResults([]);
              }}
              style={[
                styles.searchResultItem,
                i < results.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: colors.cardBorder,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.searchResultText, { color: colors.foreground }]}>
                {ex.name}
              </Text>
              {ex.muscle_group && (
                <Text
                  style={[
                    styles.searchResultMeta,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {ex.muscle_group}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StrengthBuilder({
  blocks,
  onBlocksChange,
}: StrengthBuilderProps) {
  const colors = useThemeColors();

  const addBlock = useCallback(() => {
    onBlocksChange([...blocks, createDefaultBlock()]);
  }, [blocks, onBlocksChange]);

  const removeBlock = useCallback(
    (blockId: string) => {
      onBlocksChange(blocks.filter((b) => b.id !== blockId));
    },
    [blocks, onBlocksChange]
  );

  const updateBlockType = useCallback(
    (blockId: string, type: StrengthBlockType) => {
      onBlocksChange(
        blocks.map((b) => (b.id === blockId ? { ...b, type } : b))
      );
    },
    [blocks, onBlocksChange]
  );

  const addExercise = useCallback(
    (blockId: string) => {
      onBlocksChange(
        blocks.map((b) =>
          b.id === blockId
            ? { ...b, exercises: [...b.exercises, createDefaultExercise()] }
            : b
        )
      );
    },
    [blocks, onBlocksChange]
  );

  const removeExercise = useCallback(
    (blockId: string, exerciseId: string) => {
      onBlocksChange(
        blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                exercises: b.exercises.filter((e) => e.id !== exerciseId),
              }
            : b
        )
      );
    },
    [blocks, onBlocksChange]
  );

  const updateExercise = useCallback(
    (blockId: string, exerciseId: string, updates: Partial<StrengthExercise>) => {
      onBlocksChange(
        blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                exercises: b.exercises.map((e) =>
                  e.id === exerciseId ? { ...e, ...updates } : e
                ),
              }
            : b
        )
      );
    },
    [blocks, onBlocksChange]
  );

  const totalVolume = calculateStrengthVolume(blocks);
  const totalSets = calculateStrengthSets(blocks);

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={[styles.summaryRow, { backgroundColor: colors.muted }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Total Sets
          </Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {totalSets}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Total Volume
          </Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {totalVolume.toLocaleString()} kg
          </Text>
        </View>
      </View>

      {/* Blocks */}
      {blocks.map((block, blockIndex) => (
        <Card key={block.id} style={styles.blockCard}>
          {/* Block header */}
          <View style={styles.blockHeader}>
            <Text style={[styles.blockIndex, { color: colors.mutedForeground }]}>
              Block #{blockIndex + 1}
            </Text>
            <Pressable
              onPress={() => removeBlock(block.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove block ${blockIndex + 1}`}
              style={styles.removeButton}
            >
              <Text style={[styles.removeText, { color: colors.destructive }]}>
                ✕
              </Text>
            </Pressable>
          </View>

          {/* Block type picker */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {BLOCK_TYPES.map((bt) => (
              <Pressable
                key={bt.value}
                onPress={() => updateBlockType(block.id, bt.value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      block.type === bt.value ? colors.primary : colors.muted,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: block.type === bt.value }}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        block.type === bt.value
                          ? colors.primaryForeground
                          : colors.foreground,
                    },
                  ]}
                >
                  {bt.emoji} {bt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Exercises */}
          {block.exercises.map((exercise, exIndex) => (
            <View
              key={exercise.id}
              style={[
                styles.exerciseContainer,
                { borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.exerciseHeader}>
                <Text
                  style={[
                    styles.exerciseIndex,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Exercise {exIndex + 1}
                </Text>
                {block.exercises.length > 1 && (
                  <Pressable
                    onPress={() => removeExercise(block.id, exercise.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove exercise ${exIndex + 1}`}
                    style={styles.removeButtonSmall}
                  >
                    <Text
                      style={[
                        styles.removeTextSmall,
                        { color: colors.destructive },
                      ]}
                    >
                      ✕
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Exercise name with library search */}
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                Name
              </Text>
              <TextInput
                value={exercise.name}
                onChangeText={(text) =>
                  updateExercise(block.id, exercise.id, { name: text })
                }
                placeholder="Exercise name"
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.muted,
                    color: colors.foreground,
                    borderColor: colors.cardBorder,
                  },
                ]}
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Exercise name"
              />

              {/* Exercise library search */}
              <ExerciseSearch
                onSelect={(name) =>
                  updateExercise(block.id, exercise.id, { name })
                }
              />

              {/* Numeric fields row */}
              <View style={styles.numericRow}>
                <NumericField
                  label="Sets"
                  value={exercise.sets}
                  onChange={(v) =>
                    updateExercise(block.id, exercise.id, { sets: v })
                  }
                  colors={colors}
                />
                <NumericField
                  label="Reps"
                  value={exercise.reps}
                  onChange={(v) =>
                    updateExercise(block.id, exercise.id, { reps: v })
                  }
                  colors={colors}
                />
                <NumericField
                  label="Weight (kg)"
                  value={exercise.weight_kg}
                  onChange={(v) =>
                    updateExercise(block.id, exercise.id, { weight_kg: v })
                  }
                  colors={colors}
                  allowDecimal
                />
              </View>

              <View style={styles.numericRow}>
                <NumericField
                  label="RPE"
                  value={exercise.rpe ?? 0}
                  onChange={(v) =>
                    updateExercise(block.id, exercise.id, {
                      rpe: v === 0 ? null : v,
                    })
                  }
                  colors={colors}
                />
                <NumericField
                  label="Rest (sec)"
                  value={exercise.rest_seconds}
                  onChange={(v) =>
                    updateExercise(block.id, exercise.id, { rest_seconds: v })
                  }
                  colors={colors}
                />
              </View>
            </View>
          ))}

          {/* Add exercise button */}
          <Button
            title="+ Add Exercise"
            onPress={() => addExercise(block.id)}
            variant="secondary"
          />
        </Card>
      ))}

      {/* Add block button */}
      <Button title="+ Add Block" onPress={addBlock} variant="secondary" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// NumericField sub-component
// ---------------------------------------------------------------------------

function NumericField({
  label,
  value,
  onChange,
  colors,
  allowDecimal = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useThemeColors>;
  allowDecimal?: boolean;
}) {
  return (
    <View style={styles.numericField}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        value={String(value)}
        onChangeText={(text) => {
          const num = allowDecimal ? parseFloat(text) : parseInt(text, 10);
          if (!isNaN(num) && num >= 0) {
            onChange(num);
          } else if (text === "") {
            onChange(0);
          }
        }}
        keyboardType={allowDecimal ? "decimal-pad" : "numeric"}
        style={[
          styles.textInput,
          {
            backgroundColor: colors.muted,
            color: colors.foreground,
            borderColor: colors.cardBorder,
          },
        ]}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={label}
      />
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
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  summaryItem: {
    alignItems: "center",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  blockCard: {
    gap: 10,
  },
  blockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockIndex: {
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
  exerciseContainer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  exerciseIndex: {
    fontSize: 12,
    fontWeight: "600",
  },
  removeButtonSmall: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  removeTextSmall: {
    fontSize: 14,
    fontWeight: "600",
  },
  fieldLabel: {
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
  numericRow: {
    flexDirection: "row",
    gap: 10,
  },
  numericField: {
    flex: 1,
    gap: 4,
  },
  searchContainer: {
    gap: 4,
  },
  searchSpinner: {
    marginTop: 4,
  },
  searchResults: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  searchResultItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  searchResultText: {
    fontSize: 14,
    fontWeight: "500",
  },
  searchResultMeta: {
    fontSize: 12,
    marginTop: 2,
  },
});
