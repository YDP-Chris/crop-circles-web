"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import type { Formation } from "@/lib/supabase";

// Default Leaflet markers reference image paths that don't ship through
// webpack. Re-point them to the same icons hosted on unpkg.
const fixDefaultIcon = () => {
  delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })
    ._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
};

export default function MapView({ formations }: { formations: Formation[] }) {
  useEffect(() => {
    fixDefaultIcon();
  }, []);

  const points = formations.filter(
    (f): f is Formation & { lat: number; lng: number } =>
      f.lat !== null && f.lng !== null,
  );

  return (
    <MapContainer
      center={[51.4, -1.8]}
      zoom={3}
      scrollWheelZoom
      className="leaflet-container"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      {points.map((f) => (
        <Marker key={f.id} position={[f.lat, f.lng]}>
          <Popup>
            <strong>{f.canonical_id}</strong>
            <br />
            {f.event_date ?? "(date unknown)"}
            <br />
            {f.nearest_landmark ?? f.country ?? ""}
            {f.formation_images?.[0]?.source_url && (
              <>
                <br />
                <a href={f.formation_images[0].source_url} target="_blank">
                  view image
                </a>
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
