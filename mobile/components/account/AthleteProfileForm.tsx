/**
 * AthleteProfileForm — Editable athlete profile with source badges.
 *
 * Fetches `GET /activities/profile/athlete` on mount and displays fields
 * grouped into sections. Each field shows a source badge (Manual, Garmin,
 * Default) from the `field_sources` map. Saving calls
 * `PUT /activities/profile/athlete`.
 *
 * @see Requirements 12.7, 12.8, 12.9, 12.10
 */

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/error-handling";
import { useThemeColors } from "@/lib/theme";
import type { AthleteProfile } from "@/lib/types";

// ---------------------------------------------------------------------------
// Source badge helper
// ---------------------------------------------------------------------------

/** Map a field_sources value to a display label and badge variant. */
export function getSourceBadge(source: string | undefined): {
  text: string;
  variant: BadgeVariant;
} {
  switch (source) {
    case "garmin":
      return { text: "Garmin", variant: "positive" };
    case "manual":
      return { text: "Manual", variant: "default" };
    case "default":
    default:
      return { text: "Default", variant: "caution" };
  }
}

// ---------------------------------------------------------------------------
// Field definition
// ---------------------------------------------------------------------------

interface ProfileField {
  key: string;
  label: string;
  unit?: string;
  keyboardType?: "numeric" | "default";
  multiline?: boolean;
}

const TRAINING_PREFERENCES: ProfileField[] = [
  {
    key: "weekly_training_hours",
    label: "Weekly Training Hours",
    unit: "hrs",
    keyboardType: "numeric",
  },
  {
    key: "mobility_sessions_per_week_target",
    label: "Mobility Sessions / Week",
    keyboardType: "numeric",
  },
];

const ENDURANCE_THRESHOLDS: ProfileField[] = [
  { key: "ftp_watts", label: "FTP", unit: "watts", keyboardType: "numeric" },
  {
    key: "threshold_pace_sec_per_km",
    label: "Threshold Pace",
    unit: "sec/km",
    keyboardType: "numeric",
  },
  {
    key: "swim_css_sec_per_100m",
    label: "Swim CSS",
    unit: "sec/100m",
    keyboardType: "numeric",
  },
];

const HEART_RATE: ProfileField[] = [
  { key: "max_hr", label: "Max HR", unit: "bpm", keyboardType: "numeric" },
  {
    key: "resting_hr",
    label: "Resting HR",
    unit: "bpm",
    keyboardType: "numeric",
  },
];

const STRENGTH: ProfileField[] = [
  {
    key: "squat_1rm_kg",
    label: "Squat 1RM",
    unit: "kg",
    keyboardType: "numeric",
  },
  {
    key: "deadlift_1rm_kg",
    label: "Deadlift 1RM",
    unit: "kg",
    keyboardType: "numeric",
  },
  {
    key: "bench_1rm_kg",
    label: "Bench 1RM",
    unit: "kg",
    keyboardType: "numeric",
  },
  {
    key: "overhead_press_1rm_kg",
    label: "OHP 1RM",
    unit: "kg",
    keyboardType: "numeric",
  },
];

const BODY: ProfileField[] = [
  { key: "weight_kg", label: "Weight", unit: "kg", keyboardType: "numeric" },
];

const NOTES: ProfileField[] = [
  { key: "notes", label: "Athlete Notes", multiline: true },
];

const ALL_SECTIONS: { title: string; fields: ProfileField[] }[] = [
  { title: "Training Preferences", fields: TRAINING_PREFERENCES },
  { title: "Endurance Thresholds", fields: ENDURANCE_THRESHOLDS },
  { title: "Heart Rate", fields: HEART_RATE },
  { title: "Strength", fields: STRENGTH },
  { title: "Body", fields: BODY },
  { title: "Athlete Notes", fields: NOTES },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AthleteProfileForm() {
  const colors = useThemeColors();

  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.get<AthleteProfile>(
        "/activities/profile/athlete"
      );
      setProfile(res.data);
      // Initialise form values from profile
      const values: Record<string, string> = {};
      for (const section of ALL_SECTIONS) {
        for (const field of section.fields) {
          const raw = (res.data as Record<string, unknown>)[field.key];
          values[field.key] = raw != null ? String(raw) : "";
        }
      }
      setFormValues(values);
      setError(null);
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleChange = useCallback((key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Build payload — convert numeric strings back to numbers or null
      const payload: Record<string, unknown> = {};
      for (const section of ALL_SECTIONS) {
        for (const field of section.fields) {
          const raw = formValues[field.key];
          if (field.keyboardType === "numeric") {
            payload[field.key] =
              raw !== "" && raw != null ? Number(raw) : null;
          } else {
            payload[field.key] = raw || null;
          }
        }
      }
      await api.put("/activities/profile/athlete", payload);
      setSuccess("Profile saved");
      // Re-fetch to get updated field_sources
      await fetchProfile();
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setSaving(false);
    }
  }, [formValues, fetchProfile]);

  if (loading) {
    return (
      <Card style={styles.card}>
        <Skeleton width="60%" height={22} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={{ marginTop: 16, gap: 8 }}>
            <Skeleton width="40%" height={16} />
            <Skeleton width="100%" height={44} />
          </View>
        ))}
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Athlete Profile
      </Text>

      {error ? (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
        />
      ) : null}

      {success ? (
        <Alert
          message={success}
          variant="success"
          onDismiss={() => setSuccess(null)}
        />
      ) : null}

      {ALL_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text
            style={[styles.sectionTitle, { color: colors.mutedForeground }]}
          >
            {section.title}
          </Text>
          {section.fields.map((field) => {
            const source = profile?.field_sources?.[field.key];
            const badge = getSourceBadge(source);
            return (
              <View key={field.key} style={styles.fieldRow}>
                <View style={styles.fieldHeader}>
                  <Text
                    style={[styles.fieldLabel, { color: colors.foreground }]}
                  >
                    {field.label}
                    {field.unit ? ` (${field.unit})` : ""}
                  </Text>
                  <Badge
                    text={badge.text}
                    variant={badge.variant}
                    testID={`source-badge-${field.key}`}
                  />
                </View>
                <Input
                  value={formValues[field.key] ?? ""}
                  onChangeText={(v: string) => handleChange(field.key, v)}
                  keyboardType={field.keyboardType ?? "default"}
                  multiline={field.multiline}
                  numberOfLines={field.multiline ? 4 : 1}
                  placeholder={
                    field.unit ? `Enter ${field.label.toLowerCase()}` : field.label
                  }
                />
              </View>
            );
          })}
        </View>
      ))}

      <Button
        title="Save profile"
        onPress={handleSave}
        loading={saving}
        disabled={saving}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  fieldRow: {
    gap: 4,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
});
