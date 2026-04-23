"use client";

import { useEffect, useState } from "react";
import { api, type ApiRequestConfig } from "@/lib/api";
import { postGarminSync, type GarminSyncResponse } from "@/lib/garmin-sync-api";
import {
  dispatchGarminSyncCompleted,
  dispatchGarminSyncFailed,
  dispatchGarminSyncStarted,
  type GarminSyncSource,
} from "@/lib/garmin-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type GarminStatus = {
  connected: boolean;
  garmin_email: string | null;
  last_sync_at: string | null;
};

const GARMIN_REQUEST_CONFIG: ApiRequestConfig = { skipAuthRedirect: true };

export function GarminConnectCard() {
  const [status, setStatus] = useState<GarminStatus | null>(null);
  const [mode, setMode] = useState<"credentials" | "token">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tokenStore, setTokenStore] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function getTimezone() {
    if (typeof window === "undefined") {
      return "UTC";
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  function getErrorMessage(error: unknown, fallback: string) {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
  }

  async function loadStatus() {
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
    }
  }

  async function syncHistory(source: GarminSyncSource) {
    dispatchGarminSyncStarted(source);
    try {
      const response = await postGarminSync("/sync/now?days_back=90", { timezone: getTimezone() });
      try {
        await loadStatus();
      } catch (statusError: unknown) {
        setError(getErrorMessage(statusError, "Could not refresh Garmin status after sync."));
      }
      dispatchGarminSyncCompleted({
        activitiesSynced: response.activities_synced,
        healthDaysSynced: response.health_days_synced,
        source,
      });
      return response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : getErrorMessage(error, "Sync failed.");
      dispatchGarminSyncFailed({ message, source });
      throw error;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeStatus() {
      try {
        const response = await api.get<GarminStatus>("/garmin/status", GARMIN_REQUEST_CONFIG);
        if (!cancelled) {
          setStatus(response.data);
        }
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setStatus({ connected: false, garmin_email: null, last_sync_at: null });
        setError(getErrorMessage(
          error,
          "Could not load Garmin status right now. You can keep using the dashboard.",
        ));
      }
    }

    void initializeStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const response = await api.post<GarminStatus>(
        "/garmin/connect",
        {
          garmin_email: email,
          garmin_password: password,
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
      setStatus({ connected: false, garmin_email: null, last_sync_at: null });
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
          {status && (
            <Badge variant={status.connected ? "default" : "secondary"}>
              {status.connected ? "Connected" : "Not connected"}
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

        {status?.connected ? (
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
                disabled={loading}
              >
                {loading ? "Syncing..." : "Sync Now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={loading}
              >
                Disconnect
              </Button>
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
                <Button type="submit" disabled={loading} className="w-fit">
                  {loading ? "Connecting..." : "Connect Garmin"}
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
                <Button type="submit" disabled={loading || !tokenStore.trim()} className="w-fit">
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
