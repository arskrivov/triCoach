/**
 * GarminSetupBanner — One-time inline Garmin connect prompt.
 *
 * Shows on the dashboard when Garmin isn't connected yet. Once connected,
 * disappears forever. Compact card with email/password fields.
 */

import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/error-handling";
import { useThemeColors } from "@/lib/theme";
import { useSyncStore } from "@/stores/sync-store";

export function GarminSetupBanner() {
  const colors = useThemeColors();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/garmin/status")
      .then((res) => setConnected(res.data.connected))
      .catch(() => setConnected(false));
  }, []);

  const handleConnect = useCallback(async () => {
    if (!email.trim() || !password.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      await api.post("/garmin/connect-and-sync", {
        garmin_email: email.trim(),
        garmin_password: password,
      });
      setConnected(true);
      // Trigger dashboard refresh
      useSyncStore.getState().completedSync({ activitiesSynced: 1, healthDaysSynced: 1 });
    } catch (err: unknown) {
      setError(extractApiError(err).message);
    } finally {
      setConnecting(false);
    }
  }, [email, password]);

  // Don't render if already connected or still checking
  if (connected === null || connected === true) return null;

  return (
    <Card>
      <Text style={[styles.title, { color: colors.foreground }]}>
        🔗 Connect Garmin
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Link your Garmin account to sync training and recovery data.
      </Text>

      {error && (
        <Alert message={error} variant="error" onDismiss={() => setError(null)} />
      )}

      <View style={styles.form}>
        <Input
          label="Garmin Email"
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Garmin Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
        />
        <Button
          title={connecting ? "Connecting..." : "Connect & Sync"}
          onPress={handleConnect}
          loading={connecting}
          disabled={connecting || !email.trim() || !password.trim()}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  form: { gap: 12 },
});
