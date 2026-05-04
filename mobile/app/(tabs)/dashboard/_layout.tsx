import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { useThemeColors } from "@/lib/theme";
import { useSyncState } from "@/hooks/useSyncState";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/error-handling";

/**
 * Rotating sync icon for the dashboard header.
 */
function SyncHeaderButton() {
  const colors = useThemeColors();
  const { isSyncing, startSync, completedSync, failSync } = useSyncState();
  const rotation = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isSyncing) {
      const anim = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animRef.current = anim;
      anim.start();
    } else {
      animRef.current?.stop();
      rotation.setValue(0);
    }
  }, [isSyncing, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const handleSync = useCallback(async () => {
    if (!startSync()) return;
    try {
      const res = await api.post("/sync/quick");
      completedSync({
        activitiesSynced: res.data.activities_synced ?? 0,
        healthDaysSynced: res.data.health_days_synced ?? 0,
      });
    } catch (err: unknown) {
      failSync(extractApiError(err).message);
    }
  }, [startSync, completedSync, failSync]);

  return (
    <Pressable
      onPress={handleSync}
      disabled={isSyncing}
      hitSlop={8}
      style={styles.syncButton}
      accessibilityRole="button"
      accessibilityLabel={isSyncing ? "Syncing" : "Sync now"}
    >
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <FontAwesome
          name="refresh"
          size={20}
          color={isSyncing ? colors.mutedForeground : colors.primary}
        />
      </Animated.View>
    </Pressable>
  );
}

export default function DashboardLayout() {
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
      <Stack.Screen
        name="index"
        options={{
          title: "Dashboard",
          headerRight: () => <SyncHeaderButton />,
        }}
      />
      <Stack.Screen name="activities" options={{ title: "Activities" }} />
      <Stack.Screen
        name="activity/[id]"
        options={{ title: "Activity Detail" }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  syncButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
});
