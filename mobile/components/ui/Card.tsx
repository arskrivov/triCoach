/**
 * Card — Container with border, rounded corners, and padding.
 *
 * Uses theme colours for background and border. Supports style overrides.
 *
 * @see Requirements 18.3, 18.4
 */

import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { useThemeColors } from "@/lib/theme";

export interface CardProps {
  children: React.ReactNode;
  /** Optional style overrides applied to the outer container */
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
});
