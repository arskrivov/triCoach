/**
 * Badge — Small label with background colour.
 *
 * Supports named variants (default, positive, negative, caution) or a
 * custom colour string. Used for status indicators, discipline tags, etc.
 *
 * @see Requirements 18.3, 18.4
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemeColors, type ThemeColors } from "@/lib/theme";

export type BadgeVariant = "default" | "positive" | "negative" | "caution";

export interface BadgeProps {
  text: string;
  /** Named variant or a custom background colour string */
  variant?: BadgeVariant;
  /** Custom background colour — overrides variant when provided */
  color?: string;
  /** Optional style overrides applied to the outer container */
  style?: ViewStyle;
  /** Optional test ID for testing */
  testID?: string;
}

function getVariantColor(colors: ThemeColors, variant: BadgeVariant): string {
  switch (variant) {
    case "positive":
      return colors.statusPositive;
    case "negative":
      return colors.statusNegative;
    case "caution":
      return colors.statusCaution;
    case "default":
    default:
      return colors.muted;
  }
}

function getTextColor(
  colors: ThemeColors,
  variant: BadgeVariant,
  customColor?: string
): string {
  // Custom colour or semantic variants use white text for contrast
  if (customColor || variant !== "default") {
    return "#ffffff";
  }
  return colors.foreground;
}

export function Badge({ text, variant = "default", color, style, testID }: BadgeProps) {
  const colors = useThemeColors();
  const bgColor = color ?? getVariantColor(colors, variant);
  const textColor = getTextColor(colors, variant, color);

  return (
    <View
      style={[styles.container, { backgroundColor: bgColor }, style]}
      accessibilityRole="text"
      testID={testID}
    >
      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
