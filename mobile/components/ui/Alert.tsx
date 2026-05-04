/**
 * Alert — Inline error / info / success message.
 *
 * Displays a coloured banner with an optional dismiss button.
 * Touch target for dismiss meets the 44pt minimum.
 *
 * @see Requirements 18.3, 18.4
 */

import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemeColors, type ThemeColors } from "@/lib/theme";

export type AlertVariant = "error" | "info" | "success";

export interface AlertProps {
  message: string;
  variant?: AlertVariant;
  /** Called when the user dismisses the alert. If omitted, no dismiss button is shown. */
  onDismiss?: () => void;
  /** Optional style overrides applied to the outer container */
  style?: ViewStyle;
}

function getAlertColors(colors: ThemeColors, variant: AlertVariant) {
  switch (variant) {
    case "error":
      return {
        background: colors.statusNegative + "1A", // ~10% opacity
        border: colors.statusNegative,
        text: colors.statusNegative,
      };
    case "success":
      return {
        background: colors.statusPositive + "1A",
        border: colors.statusPositive,
        text: colors.statusPositive,
      };
    case "info":
    default:
      return {
        background: colors.primary + "1A",
        border: colors.primary,
        text: colors.primary,
      };
  }
}

export function Alert({
  message,
  variant = "info",
  onDismiss,
  style,
}: AlertProps) {
  const colors = useThemeColors();
  const alertColors = getAlertColors(colors, variant);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: alertColors.background,
          borderColor: alertColors.border,
        },
        style,
      ]}
      accessibilityRole="alert"
    >
      <Text style={[styles.message, { color: alertColors.text }]}>
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.dismissButton}
        >
          <Text style={[styles.dismissText, { color: alertColors.text }]}>
            ✕
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  message: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  dismissButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
