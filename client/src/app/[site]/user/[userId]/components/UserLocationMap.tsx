"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useConfigs } from "../../../../../lib/configs";

interface UserLocationMapProps {
  country: string;
  region: string;
  city: string;
}

export function UserLocationMap({ country, region, city }: UserLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const { configs } = useConfigs();
  const { resolvedTheme } = useTheme();
  const [error, setError] = useState(false);

  const style =
    resolvedTheme === "dark"
      ? "mapbox://styles/mapbox/dark-v11"
      : "mapbox://styles/mapbox/light-v11";

  useEffect(() => {
    if (!containerRef.current || !configs?.mapboxToken) return;

    const query = [city, region, country].filter(Boolean).join(", ");
    if (!query) {
      setError(true);
      return;
    }

    // Clean up previous map instance before creating a new one
    markerRef.current?.remove();
    markerRef.current = null;
    mapRef.current?.remove();
    mapRef.current = null;

    mapboxgl.accessToken = configs.mapboxToken;

    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${configs.mapboxToken}&limit=1`
    )
      .then(res => res.json())
      .then(data => {
        if (!data.features?.length || !containerRef.current) {
          setError(true);
          return;
        }

        const [lng, lat] = data.features[0].center;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style,
          center: [lng, lat],
          zoom: 1,
          pitch: 0,
          bearing: 0,
          antialias: true,
          attributionControl: false,
          interactive: true,
        });

        mapRef.current = map;

        markerRef.current = new mapboxgl.Marker({ color: "#10b981" })
          .setLngLat([lng, lat])
          .addTo(map);
      })
      .catch(() => setError(true));

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [configs?.mapboxToken, country, region, city, style]);

  if (error) return null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-md overflow-hidden [&_.mapboxgl-ctrl-bottom-left]:hidden! [&_.mapboxgl-ctrl-logo]:hidden! [&_.mapboxgl-ctrl-bottom-right]:hidden!"
    />
  );
}
