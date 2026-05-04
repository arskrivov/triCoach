/**
 * Theme system for TriCoach mobile app.
 * Provides light/dark colour tokens following device system setting.
 *
 * Colour palette matches web app design tokens (primary, foreground, muted,
 * status-positive, status-negative, status-caution, discipline colours).
 *
 * @see Requirements 18.1, 18.2
 */

import { useColorScheme } from "react-native";

/**
 * Light theme colour tokens.
 * These values are consistent with the web app's CSS custom properties.
 */
export const lightColors = {
  // Base surfaces
  background: "#ffffff",
  foreground: "#0a0a0a",
  card: "#ffffff",
  cardBorder: "#e5e5e5",

  // Primary brand colour
  primary: "#2563eb",
  primaryForeground: "#ffffff",

  // Muted/secondary surfaces
  muted: "#f5f5f5",
  mutedForeground: "#737373",

  // Semantic status colours
  destructive: "#ef4444",
  statusPositive: "#10b981",
  statusNegative: "#ef4444",
  statusCaution: "#f59e0b",

  // Discipline colours
  disciplineRun: "#f97316",
  disciplineSwim: "#3b82f6",
  disciplineRideRoad: "#8b5cf6",
  disciplineRideGravel: "#f59e0b",
  disciplineStrength: "#f43f5e",
  disciplineYoga: "#14b8a6",
  disciplineMobility: "#06b6d4",
  disciplineOther: "#71717a",
};

/**
 * Dark theme colour tokens.
 * Adjusted for dark mode with appropriate contrast and vibrancy.
 */
export const darkColors: typeof lightColors = {
  // Base surfaces
  background: "#0a0a0a",
  foreground: "#fafafa",
  card: "#171717",
  cardBorder: "#262626",

  // Primary brand colour (slightly brighter for dark mode)
  primary: "#3b82f6",
  primaryForeground: "#ffffff",

  // Muted/secondary surfaces
  muted: "#262626",
  mutedForeground: "#a3a3a3",

  // Semantic status colours (adjusted for dark mode visibility)
  destructive: "#ef4444",
  statusPositive: "#34d399",
  statusNegative: "#f87171",
  statusCaution: "#fbbf24",

  // Discipline colours (slightly brighter for dark mode)
  disciplineRun: "#fb923c",
  disciplineSwim: "#60a5fa",
  disciplineRideRoad: "#a78bfa",
  disciplineRideGravel: "#fbbf24",
  disciplineStrength: "#fb7185",
  disciplineYoga: "#2dd4bf",
  disciplineMobility: "#22d3ee",
  disciplineOther: "#a1a1aa",
};

/**
 * Type representing the colour token keys available in the theme.
 */
export type ThemeColors = typeof lightColors;

/**
 * Type representing individual colour token names.
 */
export type ColorToken = keyof ThemeColors;

/**
 * Hook that returns the appropriate colour tokens based on device system setting.
 * Automatically switches between light and dark themes.
 *
 * @returns The colour tokens object for the current theme
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const colors = useThemeColors();
 *   return (
 *     <View style={{ backgroundColor: colors.background }}>
 *       <Text style={{ color: colors.foreground }}>Hello</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkColors : lightColors;
}

/**
 * Get the current colour scheme name.
 * Useful for conditional logic based on theme.
 *
 * @returns "dark" or "light"
 */
export function useColorSchemeName(): "dark" | "light" {
  const scheme = useColorScheme();
  return scheme === "dark" ? "dark" : "light";
}
