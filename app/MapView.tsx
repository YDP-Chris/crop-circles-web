"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { Formation } from "@/lib/supabase";

// Treat anything coarser than 1km as "approximate" (county/country centroid).
const APPROXIMATE_THRESHOLD_M = 1000;

const exactStyle = {
  color: "#6dd96a",
  weight: 1,
  fillColor: "#6dd96a",
  fillOpacity: 0.85,
};

const approxStyle = {
  color: "#a892ff",
  weight: 1.5,
  fillColor: "#a892ff",
  fillOpacity: 0.18,
  dashArray: "3 3",
};

function isApproximate(f: Formation): boolean {
  return (f.location_precision_m ?? 0) > APPROXIMATE_THRESHOLD_M;
}

export default function MapView({ formations }: { formations: Formation[] }) {
  const points = formations.filter(
    (f): f is Formation & { lat: number; lng: number } =>
      f.lat !== null && f.lng !== null,
  );

  return (
    <MapContainer
      center={[51.4, -1.8]}
      zoom={5}
      scrollWheelZoom
      className="leaflet-container"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      {points.map((f) => {
        const approx = isApproximate(f);
        const sourceLink =
          f.formation_aliases?.find((a) => a.source_url)?.source_url ?? null;
        const ccImage = f.formation_images?.[0]?.source_url ?? null;
        return (
          <CircleMarker
            key={f.id}
            center={[f.lat, f.lng]}
            radius={approx ? 6 : 5}
            pathOptions={approx ? approxStyle : exactStyle}
          >
            <Popup>
              <div style={{ minWidth: 180 }}>
                <strong>{f.canonical_id ?? "(unnamed)"}</strong>
                <br />
                {f.event_date ?? "(date unknown)"}
                {f.crop_type ? ` · ${f.crop_type}` : ""}
                <br />
                {[f.nearest_landmark, f.county, f.country]
                  .filter(Boolean)
                  .join(", ")}
                {approx && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#a892ff" }}>
                    Approximate location (county/country centroid)
                  </div>
                )}
                {ccImage && (
                  <div style={{ marginTop: 8 }}>
                    <a href={ccImage} target="_blank" rel="noreferrer">
                      view image
                    </a>
                  </div>
                )}
                {sourceLink && (
                  <div style={{ marginTop: 4 }}>
                    <a href={sourceLink} target="_blank" rel="noreferrer">
                      view source
                    </a>
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
