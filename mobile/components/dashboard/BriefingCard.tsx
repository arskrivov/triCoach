/**
 * BriefingCard — Compact daily coach briefing with actionable insights.
 *
 * Shows a readiness score emoji, sleep insight, training insight, top
 * recommendation, and optional caution. Designed for glanceability —
 * athletes check this first thing in the morning.
 *
 * @see Requirements 5.4, 5.5
 */

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useThemeColors } from "@/lib/theme";
import type { DashboardBriefing } from "@/lib/types";

export interface BriefingCardProps {
  briefing: DashboardBriefing | null;
}

function BriefingPlaceholder() {
  const colors = useThemeColors();

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>
        ☀️ Morning Briefing
      </Text>
      <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>
        Your daily briefing will appear here after 06:00 once Garmin data is
        synced.
      </Text>
    </Card>
  );
}

export function BriefingCard({ briefing }: BriefingCardProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  if (!briefing) {
    return <BriefingPlaceholder />;
  }

  const primaryRec = briefing.recommendations[0] ?? null;
  const secondaryRec = briefing.recommendations[1] ?? null;

  return (
    <Card>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: colors.foreground }]}>
          ☀️ Morning Briefing
        </Text>
        <Badge
          text={briefing.source === "ai" ? "AI" : "Auto"}
          color={briefing.source === "ai" ? colors.primary : colors.mutedForeground}
        />
      </View>

      {/* Sleep insight — single line */}
      <View style={styles.insightRow}>
        <Text style={styles.insightIcon}>😴</Text>
        <Text style={[styles.insightText, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
          {briefing.sleep_analysis}
        </Text>
      </View>

      {/* Training insight — single line */}
      <View style={styles.insightRow}>
        <Text style={styles.insightIcon}>🏋️</Text>
        <Text style={[styles.insightText, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
          {briefing.activity_analysis}
        </Text>
      </View>

      {/* Primary recommendation */}
      {primaryRec && (
        <View style={[styles.recContainer, { backgroundColor: colors.primary + "12" }]}>
          <Text style={[styles.recText, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
            💡 {primaryRec}
          </Text>
        </View>
      )}

      {/* Expanded content */}
      {expanded && secondaryRec && (
        <View style={[styles.recContainer, { backgroundColor: colors.muted }]}>
          <Text style={[styles.recText, { color: colors.foreground }]}>
            💡 {secondaryRec}
          </Text>
        </View>
      )}

      {/* Caution — always visible if present */}
      {briefing.caution && (
        <View style={[styles.cautionRow, { backgroundColor: colors.statusCaution + "15" }]}>
          <Text style={[styles.cautionText, { color: colors.statusCaution }]} numberOfLines={expanded ? undefined : 1}>
            ⚠️ {briefing.caution}
          </Text>
        </View>
      )}

      {/* Expand/collapse toggle */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={styles.expandButton}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Show less" : "Show more"}
      >
        <Text style={[styles.expandText, { color: colors.primary }]}>
          {expanded ? "Show less" : "Show more"}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  header: {
    fontSize: 17,
    fontWeight: "700",
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  insightIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  insightText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  recContainer: {
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  recText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  cautionRow: {
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  cautionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  expandButton: {
    alignSelf: "center",
    marginTop: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  expandText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
