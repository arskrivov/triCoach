"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/format";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const SPORTS = [
  { value: "RUN", label: "🏃 Run" },
  { value: "RIDE_ROAD", label: "🚴 Road Ride" },
  { value: "RIDE_GRAVEL", label: "🚵 Gravel" },
];

interface RouteOption {
  seed: number;
  geojson: {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
      type: "LineString";
      coordinates: [number, number, number?][];
    };
  };
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  estimated_duration_seconds: number;
}

const ROUTE_COLORS = ["#3b82f6", "#00d4ff", "#22c55e"];

export default function NewRoutePage() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const routeLayerIds = useRef<string[]>([]);

  const [sport, setSport] = useState("RUN");
  const [distanceKm, setDistanceKm] = useState(10);
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [routeName, setRouteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !TOKEN) return;

    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [30.5, 50.45], // Kyiv default
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;

    const handleLoad = () => {
      setMapReady(true);
      setMapError("");
      map.resize();
    };
    const handleResize = () => map.resize();
    const handleMapError = () => {
      setMapError("Map failed to load. Check your Mapbox token and refresh the page.");
    };

    map.on("load", handleLoad);
    map.on("error", handleMapError);
    window.addEventListener("resize", handleResize);

    map.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      setStartLat(lat);
      setStartLng(lng);
      setRoutes([]);
      setSelected(null);

      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = new mapboxgl.Marker({ color: "#22c55e" })
          .setLngLat([lng, lat])
          .addTo(map);
      }
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Try to center on user location
    navigator.geolocation?.getCurrentPosition((pos) => {
      map.setCenter([pos.coords.longitude, pos.coords.latitude]);
      map.setZoom(13);
    });

    return () => {
      map.off("load", handleLoad);
      map.off("error", handleMapError);
      window.removeEventListener("resize", handleResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function clearRouteLayers() {
    const map = mapRef.current;
    if (!map) return;
    routeLayerIds.current.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
    routeLayerIds.current = [];
  }

  function drawRoutes(options: RouteOption[], activeIdx: number) {
    const map = mapRef.current;
    if (!map) return;
    clearRouteLayers();

    options.forEach((opt, i) => {
      const coords = opt.geojson.geometry.coordinates.map(
        ([lng, lat]) => [lng, lat] as [number, number]
      );
      const id = `route-${i}`;
      routeLayerIds.current.push(id);

      map.addSource(id, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      });
      map.addLayer({
        id,
        type: "line",
        source: id,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ROUTE_COLORS[i % ROUTE_COLORS.length],
          "line-width": i === activeIdx ? 4 : 2,
          "line-opacity": i === activeIdx ? 1 : 0.4,
        },
      });
    });

    // Fit to first route
    const first = options[0].geojson.geometry.coordinates.map(
      ([lng, lat]) => [lng, lat] as [number, number]
    );
    const bounds = first.reduce(
      (b: mapboxgl.LngLatBounds, c: [number, number]) =>
        b.extend(c as mapboxgl.LngLatLike),
      new mapboxgl.LngLatBounds(first[0], first[0])
    );
    map.fitBounds(bounds, { padding: 60 });
  }

  function highlightRoute(idx: number) {
    const map = mapRef.current;
    if (!map) return;
    routes.forEach((_, i) => {
      const id = `route-${i}`;
      if (map.getLayer(id)) {
        map.setPaintProperty(id, "line-width", i === idx ? 4 : 2);
        map.setPaintProperty(id, "line-opacity", i === idx ? 1 : 0.4);
      }
    });
  }

  async function generate() {
    if (startLat === null || startLng === null) {
      setError("Click the map to set a start point first.");
      return;
    }
    setError("");
    setGenerating(true);
    try {
      const res = await api.post<RouteOption[]>("/routes/generate", {
        sport,
        start_lat: startLat,
        start_lng: startLng,
        target_distance_km: distanceKm,
      });
      setRoutes(res.data);
      setSelected(0);
      if (mapRef.current?.loaded()) {
        drawRoutes(res.data, 0);
      } else {
        mapRef.current?.once("load", () => drawRoutes(res.data, 0));
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Failed to generate routes. Check your GraphHopper configuration.");
    } finally {
      setGenerating(false);
    }
  }

  function selectRoute(idx: number) {
    setSelected(idx);
    highlightRoute(idx);
  }

  async function save() {
    if (selected === null || !routeName.trim()) return;
    setSaving(true);
    try {
      await api.post("/routes", {
        name: routeName.trim(),
        sport,
        start_lat: startLat,
        start_lng: startLng,
        end_lat: null,
        end_lng: null,
        distance_meters: routes[selected].distance_km * 1000,
        elevation_gain_meters: routes[selected].elevation_gain_m,
        elevation_loss_meters: routes[selected].elevation_loss_m,
        estimated_duration_seconds: routes[selected].estimated_duration_seconds,
        geojson: routes[selected].geojson,
        is_loop: true,
      });
      router.push("/routes");
    } catch {
      setError("Failed to save route.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 shrink-0 bg-card border-r border-border flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-semibold text-foreground">Plan a Route</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Click the map to set your start point</p>
        </div>

        <div className="p-4 flex flex-col gap-4 flex-1">
          {/* Sport */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sport</label>
            <div className="flex gap-2 flex-wrap">
              {SPORTS.map((s) => (
                <button key={s.value} onClick={() => setSport(s.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    sport === s.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Distance */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Target distance: <span className="text-foreground font-semibold">{distanceKm} km</span>
            </label>
            <input type="range" min={2} max={100} value={distanceKm}
              onChange={(e) => setDistanceKm(+e.target.value)}
              className="w-full accent-primary" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>2 km</span><span>100 km</span>
            </div>
          </div>

          {/* Start coords */}
          {startLat !== null && startLng !== null && (
            <p className="text-xs text-muted-foreground">
              Start: {startLat.toFixed(4)}, {startLng.toFixed(4)}
            </p>
          )}

          {error && <p className="text-xs text-[--status-negative]">{error}</p>}

          <Button onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "Generate Routes"}
          </Button>

          {/* Route options */}
          {routes.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Choose a route</p>
              {routes.map((r, i) => (
                <button key={i} onClick={() => selectRoute(i)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selected === i ? "border-primary bg-muted" : "border-border hover:border-primary/30"
                  }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                  <span className="text-sm font-medium">Option {i + 1}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    {r.distance_km.toFixed(1)} km
                    {r.elevation_gain_m ? ` · +${r.elevation_gain_m.toFixed(0)} m` : ""}
                    {r.estimated_duration_seconds ? ` · ~${formatDuration(r.estimated_duration_seconds)}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Save form */}
          {selected !== null && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <label className="text-xs font-medium text-muted-foreground">Route name</label>
              <Input
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="e.g. Morning Loop"
              />
              <Button onClick={save} disabled={saving || !routeName.trim()}>
                {saving ? "Saving…" : "Save Route"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-screen bg-background">
        {!TOKEN && (
          <div className="absolute inset-0 bg-muted flex items-center justify-center text-sm text-muted-foreground z-10">
            Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the map
          </div>
        )}
        {!!TOKEN && !mapReady && !mapError && (
          <div className="absolute inset-0 bg-muted flex items-center justify-center text-sm text-muted-foreground z-10">
            Loading map…
          </div>
        )}
        {!!mapError && (
          <div className="absolute inset-0 bg-muted flex items-center justify-center text-sm text-[--status-negative] z-10 px-6 text-center">
            {mapError}
          </div>
        )}
        <div ref={mapContainer} className="absolute inset-0 min-h-screen w-full" />
      </div>
    </div>
  );
}
