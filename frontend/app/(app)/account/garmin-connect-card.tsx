"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ApiRequestConfig } from "@/lib/api";
import { postGarminSync, type GarminSyncResponse } from "@/lib/garmin-sync-api";
import {
  runGarminSyncOperation,
  type GarminSyncSource,
  useGarminSyncReload,
  useGarminSyncState,
} from "@/lib/garmin-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type GarminStatus = {
  connected: boolean;
  garmin_email: string | null;
  last_sync_at: string | null;
  session_status?: "valid" | "expired" | "not_connected";
};

const GARMIN_REQUEST_CONFIG: ApiRequestConfig = { skipAuthRedirect: true };

export function GarminConnectCard() {
  const [status, setStatus] = useState<GarminStatus | null>(null);
  const [mode, setMode] = useState<"credentials" | "token">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tokenStore, setTokenStore] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { isSyncing } = useGarminSyncState();

  function getTimezone() {
    if (typeof window === "undefined") {
      return "UTC";
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  function getErrorMessage(error: unknown, fallback: string) {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
  }

  const loadStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setStatusLoading(true);
    }

    try {
      const response = await api.get<GarminStatus>("/garmin/status", GARMIN_REQUEST_CONFIG);
      setStatus(response.data);
      return response.data;
    } catch (error: unknown) {
      setStatus({ connected: false, garmin_email: null, last_sync_at: null });
      const message = getErrorMessage(
        error,
        "Could not load Garmin status right now. You can keep using the dashboard.",
      );
      setError(message);
      throw error;
    } finally {
      if (!options?.silent) {
        setStatusLoading(false);
      }
    }
  }, []);

  async function syncHistory(source: GarminSyncSource) {
    return runGarminSyncOperation(
      source,
      () => postGarminSync("/sync/now?days_back=90", { timezone: getTimezone() }),
      (error) => getErrorMessage(error, "Sync failed."),
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeStatus() {
      try {
        const response = await loadStatus({ silent: true });
        if (!cancelled) {
          setStatus(response);
        }
      } catch {
        if (cancelled) {
          return;
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
        }
      }
    }

    void initializeStatus();

    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  useGarminSyncReload(useCallback(async () => {
    setRefreshing(true);
    try {
      await loadStatus();
    } catch {
      // Keep the last known status visible if the refresh fails.
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus]));

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const data = await runGarminSyncOperation(
        "settings",
        async () => {
          const response = await api.post<{
            connected: boolean;
            garmin_email: string;
            activities_synced: number;
            activity_files_synced: number;
            health_days_synced: number;
            missing_health_metrics: string[];
          }>(
            "/garmin/connect-and-sync",
            {
              garmin_email: email,
              garmin_password: password,
            },
            {
              ...GARMIN_REQUEST_CONFIG,
              headers: { "X-User-Timezone": getTimezone() },
            },
          );
          return response.data;
        },
        (error) => getErrorMessage(error, "Failed to connect. Check your credentials."),
      );
      setStatus({
        connected: true,
        garmin_email: data.garmin_email,
        last_sync_at: null,
        session_status: "valid",
      });
      setSuccess(
        `Garmin connected. Imported ${data.activities_synced} activities and ${data.health_days_synced} health days.`,
      );
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Failed to connect. Check your credentials."));
    } finally {
      setLoading(false);
    }
  }

  async function handleTokenImport(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await api.post<GarminStatus>(
        "/garmin/connect/token-store",
        {
          token_store: tokenStore,
          garmin_email: email || undefined,
        },
        GARMIN_REQUEST_CONFIG,
      );
      setStatus(response.data);

      try {
        const sync: GarminSyncResponse = await syncHistory("settings");
        setSuccess(
          `Garmin connected. Imported ${sync.activities_synced} activities and ${sync.health_days_synced} health days.`,
        );
      } catch (error: unknown) {
        setSuccess("Garmin connected.");
        setError(getErrorMessage(error, "Garmin connected, but the initial sync failed."));
      }

      setTokenStore("");
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Failed to import Garmin token store."));
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await api.delete("/garmin/disconnect", GARMIN_REQUEST_CONFIG);
      setStatus({ connected: false, garmin_email: null, last_sync_at: null, session_status: "not_connected" });
      setSuccess("Garmin account disconnected.");
    } catch {
      setError("Failed to disconnect.");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSync() {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const sync: GarminSyncResponse = await syncHistory("settings");
      setSuccess(`Synced ${sync.activities_synced} activities and ${sync.health_days_synced} health days.`);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : getErrorMessage(error, "Sync failed."));
    } finally {
      setLoading(false);
    }
  }

  const showLoadingState = statusLoading || refreshing || (isSyncing && status?.connected);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Garmin Connect</CardTitle>
            <CardDescription>
              Connect your Garmin account to sync activities and health data
            </CardDescription>
          </div>
          {showLoadingState ? (
            <Skeleton className="h-6 w-28 rounded-full" />
          ) : status && (
            <Badge variant={
              status.session_status === "expired"
                ? "destructive"
                : status.connected
                  ? "default"
                  : "secondary"
            }>
              {status.session_status === "expired"
                ? "Session Expired"
                : status.connected
                  ? "Connected"
                  : "Not connected"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {success && (
          <Alert className="mb-4 border-[--status-positive]/30 bg-[--status-positive]/10 text-[--status-positive]">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {showLoadingState ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border p-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </div>
        ) : status?.connected ? (
          <div className="flex flex-col gap-3">
            {status.session_status === "expired" && (
              <Alert variant="destructive">
                <AlertDescription>
                  Your Garmin session has expired. Please reconnect your account to resume syncing.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{status.garmin_email}</p>
              {status.last_sync_at ? (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(status.last_sync_at).toLocaleString()}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Connected, but no data has been synced yet.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSync}
                disabled={loading || isSyncing}
              >
                {loading || isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={loading || isSyncing}
              >
                Disconnect
              </Button>
            </div>
          </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "credentials" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("credentials")}
              >
                Credentials
              </Button>
              <Button
                type="button"
                variant={mode === "token" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("token")}
              >
                Import Tokens
              </Button>
            </div>

            {mode === "credentials" ? (
              <form onSubmit={handleConnect} className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Enter your Garmin Connect credentials. They are stored encrypted
                  and only used to sync your data.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="garmin-email">Garmin email</Label>
                  <Input
                    id="garmin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="min-h-[44px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="garmin-password">Garmin password</Label>
                  <Input
                    id="garmin-password"
                    type="password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="min-h-[44px]"
                  />
                </div>
                <Button type="submit" disabled={loading || isSyncing} className="w-fit">
                  {loading || isSyncing ? "Connecting..." : "Connect Garmin"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleTokenImport} className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  If Garmin is rate-limiting credential login, generate a fresh
                  <span className="mx-1 font-mono">garmin_tokens.json</span>
                  with the upstream
                  <span className="mx-1 font-mono">python-garminconnect</span>
                  demo/example and paste its contents here.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="garmin-email-import">Garmin email (optional)</Label>
                  <Input
                    id="garmin-email-import"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="garmin-token-store">garmin_tokens.json contents</Label>
                  <textarea
                    id="garmin-token-store"
                    className="min-h-40 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                    placeholder='{"di_token":"...","di_refresh_token":"...","di_client_id":"..."}'
                    value={tokenStore}
                    onChange={(e) => setTokenStore(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading || isSyncing || !tokenStore.trim()} className="w-fit">
                  {loading ? "Importing..." : "Import Garmin Tokens"}
                </Button>
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
