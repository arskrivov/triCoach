/**
 * SyncStatusBar — Displays last sync time and a "Sync Now" button.
 *
 * Tapping "Sync Now" calls `POST /sync/quick`, updates the global sync store,
 * and triggers dashboard refresh on completion via syncVersion increment.
 * The button is disabled while a sync is in progress.
 *
 * @see Requirements 5.2, 5.3, 13.5
 */

import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useSyncState } from "@/hooks/useSyncState";
import { useThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/error-handling";

/**
 * Format a timestamp (epoch ms) as a relative or absolute time string.
 * Returns a human-readable string like "2 min ago", "1 hr ago", or a date.
 */
function formatRelativeTime(epochMs: number): string {
  const now = Date.now();
  const diffMs = now - epochMs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;

  return new Date(epochMs).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SyncStatusBar() {
  const colors = useThemeColors();
  const {
    isSyncing,
    lastCompletedAt,
    lastError,
    startSync,
    completedSync,
    failSync,
  } = useSyncState();

  const handleSyncNow = useCallback(async () => {
    // Guard against concurrent syncs (Requirement 13.5)
    if (!startSync()) return;

    try {
      const response = await api.post("/sync/quick");
      const data = response.data;
      completedSync({
        activitiesSynced: data.activities_synced ?? 0,
        healthDaysSynced: data.health_days_synced ?? 0,
      });
    } catch (error: unknown) {
      const apiError = extractApiError(error);
      failSync(apiError.message);
    }
  }, [startSync, completedSync, failSync]);

  const syncTimeText = lastCompletedAt
    ? `Last synced ${formatRelativeTime(lastCompletedAt)}`
    : "Not synced yet";

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.textContainer}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Garmin Sync
          </Text>
          <Text style={[styles.syncTime, { color: colors.foreground }]}>
            {isSyncing ? "Syncing…" : syncTimeText}
          </Text>
        </View>
        <Button
          title="Sync Now"
          onPress={handleSyncNow}
          variant="secondary"
          loading={isSyncing}
          disabled={isSyncing}
          style={styles.button}
        />
      </View>
      {lastError ? (
        <Alert
          message={lastError}
          variant="error"
          style={styles.errorAlert}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  syncTime: {
    fontSize: 14,
    fontWeight: "500",
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 40,
  },
  errorAlert: {
    marginTop: 10,
  },
});
