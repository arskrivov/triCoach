/**
 * Button — Touchable with primary / secondary / destructive variants.
 *
 * Enforces a minimum 44pt touch target for accessibility.
 * Shows an ActivityIndicator when loading.
 *
 * @see Requirements 18.3, 18.4
 */

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";

import { useThemeColors, type ThemeColors } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "destructive";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Optional style overrides applied to the outer pressable */
  style?: ViewStyle;
}

function getVariantStyles(
  colors: ThemeColors,
  variant: ButtonVariant,
  disabled: boolean
) {
  const opacity = disabled ? 0.5 : 1;

  switch (variant) {
    case "primary":
      return {
        container: {
          backgroundColor: colors.primary,
          opacity,
        },
        text: { color: colors.primaryForeground },
        loader: colors.primaryForeground,
      };
    case "secondary":
      return {
        container: {
          backgroundColor: colors.muted,
          opacity,
        },
        text: { color: colors.foreground },
        loader: colors.foreground,
      };
    case "destructive":
      return {
        container: {
          backgroundColor: colors.destructive,
          opacity,
        },
        text: { color: "#ffffff" },
        loader: "#ffffff",
      };
  }
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const colors = useThemeColors();
  const isDisabled = disabled || loading;
  const variantStyles = getVariantStyles(colors, variant, isDisabled);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.container,
        variantStyles.container,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles.loader} />
      ) : (
        <Text style={[styles.text, variantStyles.text]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});
