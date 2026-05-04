/**
 * GarminConnectCard — Manages Garmin connection status, credentials,
 * token import, sync, and disconnect.
 *
 * Fetches `GET /garmin/status` to determine connection state and renders
 * the appropriate UI: credentials form when not connected, or connection
 * details with sync/disconnect actions when connected.
 *
 * @see Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSyncState } from "@/hooks/useSyncState";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/error-handling";
import { useThemeColors } from "@/lib/theme";
import type { GarminStatus } from "@/lib/types";

type ConnectionView = "credentials" | "token";

export function GarminConnectCard() {
  const colors = useThemeColors();
  const { isSyncing, startSync, completedSync, failSync } = useSyncState();

  // Status state
  const [status, setStatus] = useState<GarminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Credentials form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Token import form state
  const [tokenJson, setTokenJson] = useState("");
  const [importingToken, setImportingToken] = useState(false);

  // Toggle between credentials and token import
  const [connectionView, setConnectionView] =
    useState<ConnectionView>("credentials");

  // Disconnect state
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<GarminStatus>("/garmin/status");
      setStatus(res.data);
      setError(null);
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Connect with credentials
  const handleConnect = useCallback(async () => {
    if (!email.trim() || !password.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      await api.post("/garmin/connect-and-sync", {
        email: email.trim(),
        password,
      });
      setEmail("");
      setPassword("");
      await fetchStatus();
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setConnecting(false);
    }
  }, [email, password, fetchStatus]);

  // Connect with token store
  const handleTokenImport = useCallback(async () => {
    if (!tokenJson.trim()) return;
    setImportingToken(true);
    setError(null);
    try {
      await api.post("/garmin/connect/token-store", {
        token_store: tokenJson.trim(),
      });
      setTokenJson("");
      await fetchStatus();
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setImportingToken(false);
    }
  }, [tokenJson, fetchStatus]);

  // Sync now
  const handleSyncNow = useCallback(async () => {
    if (!startSync()) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await api.post("/sync/now", null, {
        headers: { "X-User-Timezone": tz },
      });
      completedSync({
        activitiesSynced: res.data.activities_synced ?? 0,
        healthDaysSynced: res.data.health_days_synced ?? 0,
      });
      await fetchStatus();
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      failSync(apiError.message);
      setError(apiError.message);
    }
  }, [startSync, completedSync, failSync, fetchStatus]);

  // Disconnect
  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    setError(null);
    try {
      await api.delete("/garmin/disconnect");
      await fetchStatus();
    } catch (err: unknown) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setDisconnecting(false);
    }
  }, [fetchStatus]);

  // Derive badge info from status
  const getBadge = (): { text: string; variant: "positive" | "caution" | "default" } => {
    if (!status || !status.connected) {
      return { text: "Not connected", variant: "default" };
    }
    if (status.session_status === "expired") {
      return { text: "Session Expired", variant: "caution" };
    }
    return { text: "Connected", variant: "positive" };
  };

  const formatLastSync = (iso: string | null): string => {
    if (!iso) return "Never";
    const date = new Date(iso);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card style={styles.card}>
        <Skeleton width="50%" height={20} />
        <Skeleton width="100%" height={44} style={{ marginTop: 12 }} />
        <Skeleton width="100%" height={44} style={{ marginTop: 8 }} />
      </Card>
    );
  }

  const badge = getBadge();
  const isConnected = status?.connected === true;

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Garmin Connect
        </Text>
        <Badge text={badge.text} variant={badge.variant} />
      </View>

      {error ? (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.alert}
        />
      ) : null}

      {isConnected ? (
        /* Connected state */
        <View style={styles.connectedSection}>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Email
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {status?.garmin_email ?? "—"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Last sync
            </Text>
            <Text style={[styles.value, { color: colors.foreground }]}>
              {formatLastSync(status?.last_sync_at ?? null)}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <Button
              title="Sync Now"
              onPress={handleSyncNow}
              variant="primary"
              loading={isSyncing}
              disabled={isSyncing}
              style={styles.flexButton}
            />
            <Button
              title="Disconnect"
              onPress={handleDisconnect}
              variant="destructive"
              loading={disconnecting}
              disabled={disconnecting || isSyncing}
              style={styles.flexButton}
            />
          </View>
        </View>
      ) : (
        /* Not connected state */
        <View style={styles.disconnectedSection}>
          {/* View toggle */}
          <View style={styles.toggleRow}>
            <Button
              title="Credentials"
              onPress={() => setConnectionView("credentials")}
              variant={connectionView === "credentials" ? "primary" : "secondary"}
              style={styles.toggleButton}
            />
            <Button
              title="Token Import"
              onPress={() => setConnectionView("token")}
              variant={connectionView === "token" ? "primary" : "secondary"}
              style={styles.toggleButton}
            />
          </View>

          {connectionView === "credentials" ? (
            <View style={styles.form}>
              <Input
                label="Garmin Email"
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Input
                label="Garmin Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
              />
              <Button
                title="Connect Garmin"
                onPress={handleConnect}
                loading={connecting}
                disabled={connecting || !email.trim() || !password.trim()}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Input
                label="Token JSON"
                value={tokenJson}
                onChangeText={setTokenJson}
                placeholder='Paste garmin_tokens.json contents'
                multiline
                numberOfLines={4}
              />
              <Button
                title="Import Token"
                onPress={handleTokenImport}
                loading={importingToken}
                disabled={importingToken || !tokenJson.trim()}
              />
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  alert: {
    marginTop: 0,
  },
  connectedSection: {
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  flexButton: {
    flex: 1,
  },
  disconnectedSection: {
    gap: 12,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 8,
  },
  form: {
    gap: 12,
  },
});
