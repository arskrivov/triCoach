/**
 * BriefingCard — Displays the daily AI/heuristic coach briefing.
 *
 * Shows sleep analysis, activity analysis, up to 2 recommendations, and an
 * optional caution section. When no briefing is available (before 06:00 or
 * no Garmin data), a placeholder message is displayed instead.
 *
 * @see Requirements 5.4, 5.5
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useThemeColors } from "@/lib/theme";
import type { DashboardBriefing } from "@/lib/types";

export interface BriefingCardProps {
  /** The briefing data, or null when no briefing is available. */
  briefing: DashboardBriefing | null;
}

/**
 * Placeholder shown when no briefing is available.
 */
function BriefingPlaceholder() {
  const colors = useThemeColors();

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>
        Coach Briefing
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

  if (!briefing) {
    return <BriefingPlaceholder />;
  }

  const sourceBadgeText = briefing.source === "ai" ? "AI" : "Heuristic";
  const displayedRecommendations = briefing.recommendations.slice(0, 2);

  return (
    <Card>
      {/* Header row: title + source badge */}
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: colors.foreground }]}>
          Coach Briefing
        </Text>
        <Badge
          text={sourceBadgeText}
          color={briefing.source === "ai" ? colors.primary : colors.mutedForeground}
        />
      </View>

      {/* Sleep analysis */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          Sleep
        </Text>
        <Text style={[styles.sectionText, { color: colors.foreground }]}>
          {briefing.sleep_analysis}
        </Text>
      </View>

      {/* Activity analysis */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          Activity
        </Text>
        <Text style={[styles.sectionText, { color: colors.foreground }]}>
          {briefing.activity_analysis}
        </Text>
      </View>

      {/* Recommendations (up to 2) */}
      {displayedRecommendations.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            Recommendations
          </Text>
          {displayedRecommendations.map((rec, index) => (
            <View key={index} style={styles.recommendationRow}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.recommendationText, { color: colors.foreground }]}>
                {rec}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Optional caution */}
      {briefing.caution && (
        <View
          style={[
            styles.cautionContainer,
            { backgroundColor: colors.statusCaution + "1A" },
          ]}
        >
          <Text style={[styles.cautionLabel, { color: colors.statusCaution }]}>
            ⚠ Caution
          </Text>
          <Text style={[styles.cautionText, { color: colors.foreground }]}>
            {briefing.caution}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
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
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  recommendationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
  },
  bullet: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  recommendationText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  cautionContainer: {
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  cautionLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  cautionText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
