"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import polylineDecode from "@mapbox/polyline";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

interface Props {
  polyline: string;
}

export function EnduranceMap({ polyline }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!TOKEN) return;

    // Decode polyline → [[lng, lat], ...]
    const coords = polylineDecode.decode(polyline).map(([lat, lng]: [number, number]) => [lng, lat] as [number, number]);
    if (coords.length === 0) return;

    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: coords[0],
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#f97316", "line-width": 3 },
      });

      // Fit bounds
      const bounds = coords.reduce(
        (b: mapboxgl.LngLatBounds, c: [number, number]) => b.extend(c as mapboxgl.LngLatLike),
        new mapboxgl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 40 });

      // Start marker
      new mapboxgl.Marker({ color: "#22c55e" }).setLngLat(coords[0]).addTo(map);
      // End marker
      new mapboxgl.Marker({ color: "#ef4444" })
        .setLngLat(coords[coords.length - 1])
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [polyline]);

  if (!TOKEN) {
    return (
      <div className="h-64 bg-zinc-100 rounded-xl flex items-center justify-center text-sm text-zinc-400">
        Set NEXT_PUBLIC_MAPBOX_TOKEN to display map
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-72 rounded-xl overflow-hidden border border-zinc-200"
    />
  );
}
