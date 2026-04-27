"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MapPin, Mountain, Route, Trash2, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistance } from "@/lib/format";
import { unlinkRouteFromWorkout, syncRouteToGarmin, checkProhibitedAreas } from "@/lib/api";
import type { Workout } from "@/lib/types";

const ROUTE_DISCIPLINES = new Set(["RUN", "RIDE_ROAD", "RIDE_GRAVEL"]);
const CYCLING_DISCIPLINES = new Set(["RIDE_ROAD", "RIDE_GRAVEL"]);

interface RouteSectionProps {
  workout: Workout;
  onRouteLinked: (routeId: string | null) => void;
}

export function RouteSection({ workout, onRouteLinked }: RouteSectionProps) {
  const [unlinking, setUnlinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prohibitedAreaNames, setProhibitedAreaNames] = useState<string[]>([]);

  const route = workout.route;
  const hasRoute = !!workout.route_id && !!route;
  const isCycling = CYCLING_DISCIPLINES.has(workout.discipline);

  useEffect(() => {
    if (!hasRoute || !route || !isCycling) {
      setProhibitedAreaNames([]);
      return;
    }

    let cancelled = false;

    checkProhibitedAreas(route.id)
      .then((result) => {
        if (cancelled) return;
        if (result.has_prohibited_areas) {
          const names = result.areas
            .map((a) => (a.area_name as string) || "Unknown area")
            .filter(Boolean);
          setProhibitedAreaNames(names);
        } else {
          setProhibitedAreaNames([]);
        }
      })
      .catch(() => {
        // Silently ignore — prohibited area check is non-critical
        if (!cancelled) setProhibitedAreaNames([]);
      });

    return () => {
      cancelled = true;
    };
  }, [hasRoute, route, isCycling]);

  if (!ROUTE_DISCIPLINES.has(workout.discipline)) {
    return null;
  }

  const addRouteHref = `/routes?workout_id=${workout.id}&discipline=${workout.discipline}&duration=${workout.estimated_duration_seconds ?? ""}`;

  async function handleUnlink() {
    setError(null);
    setSyncMessage(null);
    setUnlinking(true);
    try {
      await unlinkRouteFromWorkout(workout.id);
      onRouteLinked(null);
    } catch {
      setError("Failed to remove route. Please try again.");
    } finally {
      setUnlinking(false);
    }
  }

  async function handleSyncToGarmin() {
    if (!route) return;
    setError(null);
    setSyncMessage(null);
    setSyncing(true);
    try {
      const result = await syncRouteToGarmin(route.id);
      setSyncMessage(result.message);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 400) {
        setError("Garmin account not connected. Connect Garmin in Settings to sync routes.");
      } else {
        setError("Failed to sync route to Garmin. Please try again.");
      }
    } finally {
      setSyncing(false);
    }
  }

  if (!hasRoute) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Route</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Route className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No route attached to this workout.
            </p>
            <Link href={addRouteHref}>
              <Button variant="outline" size="sm">
                <MapPin className="size-3.5" />
                Add Route
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Route</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Map preview placeholder */}
        <div className="h-40 rounded-lg bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Map preview</span>
        </div>

        {/* Route details */}
        <div className="flex flex-col gap-1">
          <p className="font-medium">{route.name}</p>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {route.distance_meters != null && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {formatDistance(route.distance_meters)}
              </span>
            )}
            {route.elevation_gain_meters != null && (
              <span className="flex items-center gap-1">
                <Mountain className="size-3.5" />
                {Math.round(route.elevation_gain_meters)} m gain
              </span>
            )}
          </div>
        </div>

        {/* Prohibited area warning */}
        {prohibitedAreaNames.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              ⚠️ This route passes through: {prohibitedAreaNames.join(", ")}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleUnlink}
            disabled={unlinking}
          >
            {unlinking ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Remove Route
          </Button>

          {CYCLING_DISCIPLINES.has(workout.discipline) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncToGarmin}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Sync to Garmin
            </Button>
          )}
        </div>

        {/* Feedback messages */}
        {syncMessage && (
          <p className="text-sm text-[--status-positive]">{syncMessage}</p>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
