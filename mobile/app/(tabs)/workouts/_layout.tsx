import { Stack } from "expo-router";

import { useThemeColors } from "@/lib/theme";

/**
 * Workouts stack navigator.
 * Provides drill-down navigation from Workout Hub → Workout Detail → Workout Builder.
 *
 * @see Requirements 4.4
 */
export default function WorkoutsLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        headerTitleStyle: { color: colors.foreground },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Workouts" }} />
      <Stack.Screen name="[id]" options={{ title: "Workout Detail" }} />
      <Stack.Screen name="builder" options={{ title: "Workout Builder" }} />
    </Stack>
  );
}
