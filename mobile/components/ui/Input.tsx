/**
 * Input — TextInput wrapper with label and error state.
 *
 * Enforces a minimum 44pt touch target. Displays an optional label above
 * and an error message below the input.
 *
 * @see Requirements 18.3, 18.4
 */

import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import { useThemeColors } from "@/lib/theme";

export interface InputProps extends Omit<TextInputProps, "style"> {
  /** Label displayed above the input */
  label?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Optional style overrides applied to the outer container */
  style?: ViewStyle;
}

export function Input({ label, error, style, ...textInputProps }: InputProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <Text style={[styles.label, { color: colors.foreground }]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={label}
        {...textInputProps}
        style={[
          styles.input,
          {
            backgroundColor: colors.muted,
            color: colors.foreground,
            borderColor: error ? colors.destructive : colors.cardBorder,
          },
        ]}
      />
      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 16,
  },
  error: {
    fontSize: 13,
  },
});
