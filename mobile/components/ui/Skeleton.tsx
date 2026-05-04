/**
 * Skeleton — Loading placeholder with animated shimmer.
 *
 * Uses React Native Animated API for a pulsing opacity effect.
 * Accepts width, height, and borderRadius for flexible placeholder shapes.
 *
 * @see Requirements 18.3, 18.4
 */

import React, { useEffect, useRef } from "react";
import { Animated, DimensionValue, StyleSheet, ViewStyle } from "react-native";

import { useThemeColors } from "@/lib/theme";

export interface SkeletonProps {
  width: DimensionValue;
  height: DimensionValue;
  borderRadius?: number;
  /** Optional style overrides */
  style?: ViewStyle;
}

export function Skeleton({
  width,
  height,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.muted,
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
