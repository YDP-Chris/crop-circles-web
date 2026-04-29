"use client";

import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
} from "react-leaflet";
import type { Formation } from "@/lib/supabase";

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

const heritageStyle = {
  color: "#d4a73c",
  weight: 1,
  fillColor: "#d4a73c",
  fillOpacity: 0.9,
};

const heritageFeaturedStyle = {
  color: "#f0c14b",
  weight: 1.5,
  fillColor: "#f0c14b",
  fillOpacity: 1,
};

function isApproximate(f: Formation): boolean {
  return (f.location_precision_m ?? 0) > APPROXIMATE_THRESHOLD_M;
}

export type HeritageMarker = {
  id: string;
  name: string | null;
  site_type: string;
  lat: number;
  lng: number;
  featured?: boolean;
  featured_label?: string;
};

const FEATURED_NAMES = [
  "stonehenge",
  "durrington walls",
  "woodhenge",
  "old sarum",
  "yarnbury castle",
];

// Static fallback coordinates for the named featured sites.
export const FEATURED_STATIC: HeritageMarker[] = [
  {
    id: "static-stonehenge",
    name: "Stonehenge",
    site_type: "stone_circle",
    lat: 51.1789,
    lng: -1.8262,
    featured: true,
    featured_label: "Stonehenge",
  },
  {
    id: "static-durrington-walls",
    name: "Durrington Walls",
    site_type: "henge",
    lat: 51.1928,
    lng: -1.7878,
    featured: true,
    featured_label: "Durrington Walls",
  },
  {
    id: "static-woodhenge",
    name: "Woodhenge",
    site_type: "henge",
    lat: 51.1894,
    lng: -1.7857,
    featured: true,
    featured_label: "Woodhenge",
  },
  {
    id: "static-old-sarum",
    name: "Old Sarum",
    site_type: "hillfort",
    lat: 51.0934,
    lng: -1.7969,
    featured: true,
    featured_label: "Old Sarum",
  },
  {
    id: "static-yarnbury-castle",
    name: "Yarnbury Castle",
    site_type: "hillfort",
    lat: 51.1583,
    lng: -1.9750,
    featured: true,
    featured_label: "Yarnbury Castle",
  },
];

export default function StonehengeMap({
  formations,
  heritage,
}: {
  formations: Formation[];
  heritage: HeritageMarker[];
}) {
  const points = formations.filter(
    (f): f is Formation & { lat: number; lng: number } =>
      f.lat !== null && f.lng !== null,
  );

  const dbFeaturedNames = new Set(
    heritage
      .filter((h) => h.name)
      .map((h) => (h.name ?? "").toLowerCase().trim())
      .filter((n) => FEATURED_NAMES.includes(n)),
  );
  const staticFeatured = FEATURED_STATIC.filter(
    (s) => !dbFeaturedNames.has((s.name ?? "").toLowerCase().trim()),
  );

  const heritageRendered: HeritageMarker[] = heritage.map((h) => {
    const lower = (h.name ?? "").toLowerCase().trim();
    if (FEATURED_NAMES.includes(lower)) {
      return { ...h, featured: true, featured_label: h.name ?? undefined };
    }
    return h;
  });

  const allHeritage: HeritageMarker[] = [
    ...heritageRendered,
    ...staticFeatured,
  ];

  return (
    <MapContainer
      center={[51.175, -1.85]}
      zoom={11}
      scrollWheelZoom
      className="leaflet-container"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      {allHeritage.map((h) => {
        const isFeat = !!h.featured;
        return (
          <CircleMarker
            key={h.id}
            center={[h.lat, h.lng]}
            radius={isFeat ? 5 : 3}
            pathOptions={isFeat ? heritageFeaturedStyle : heritageStyle}
          >
            {isFeat && h.featured_label && (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -6]}
                className="pewsey-heritage-label"
              >
                {h.featured_label}
              </Tooltip>
            )}
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong>{h.name ?? `(unnamed ${h.site_type})`}</strong>
                <br />
                <span style={{ fontSize: 11, color: "#888" }}>
                  Heritage site &middot; {h.site_type}
                </span>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
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
