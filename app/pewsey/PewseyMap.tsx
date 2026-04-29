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

const heritageBigSixStyle = {
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
  big_six?: boolean;
  big_six_label?: string;
};

const BIG_SIX_NAMES = [
  "avebury henge",
  "avebury",
  "silbury hill",
  "west kennet long barrow",
  "adam's grave",
  "adams grave",
  "alton barnes white horse",
  "knap hill",
  "knap hill camp",
];

// Static fallback coordinates for the named "big six". These are used both as
// the canonical permanent labels (so the labels render predictably regardless
// of OSM naming variance) and as a fallback if any are missing from the
// heritage_sites query.
export const BIG_SIX_STATIC: HeritageMarker[] = [
  {
    id: "static-avebury",
    name: "Avebury Henge",
    site_type: "henge",
    lat: 51.4287,
    lng: -1.8540,
    big_six: true,
    big_six_label: "Avebury Henge",
  },
  {
    id: "static-silbury",
    name: "Silbury Hill",
    site_type: "tumulus",
    lat: 51.4156,
    lng: -1.8576,
    big_six: true,
    big_six_label: "Silbury Hill",
  },
  {
    id: "static-westkennet",
    name: "West Kennet Long Barrow",
    site_type: "long_barrow",
    lat: 51.4086,
    lng: -1.8483,
    big_six: true,
    big_six_label: "West Kennet Long Barrow",
  },
  {
    id: "static-adamsgrave",
    name: "Adam's Grave",
    site_type: "long_barrow",
    lat: 51.3614,
    lng: -1.8348,
    big_six: true,
    big_six_label: "Adam's Grave",
  },
  {
    id: "static-altonbarnes",
    name: "Alton Barnes White Horse",
    site_type: "hill_figure",
    lat: 51.3697,
    lng: -1.8410,
    big_six: true,
    big_six_label: "Alton Barnes White Horse",
  },
  {
    id: "static-knaphill",
    name: "Knap Hill Camp",
    site_type: "hillfort",
    lat: 51.3625,
    lng: -1.8278,
    big_six: true,
    big_six_label: "Knap Hill Camp",
  },
];

export default function PewseyMap({
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

  // Dedup heritage: prefer DB rows but always render the static big-six labels.
  // If the DB has a matching named big-six site, suppress the static one to
  // avoid stacked markers; otherwise fall back to the static coords.
  const dbBigSixNames = new Set(
    heritage
      .filter((h) => h.name)
      .map((h) => (h.name ?? "").toLowerCase().trim())
      .filter((n) => BIG_SIX_NAMES.includes(n)),
  );
  const staticBigSix = BIG_SIX_STATIC.filter(
    (s) => !dbBigSixNames.has((s.name ?? "").toLowerCase().trim()),
  );

  // Promote any DB rows whose name matches a big-six entry, so they render
  // with permanent labels and the highlighted style.
  const heritageRendered: HeritageMarker[] = heritage.map((h) => {
    const lower = (h.name ?? "").toLowerCase().trim();
    if (BIG_SIX_NAMES.includes(lower)) {
      return { ...h, big_six: true, big_six_label: h.name ?? undefined };
    }
    return h;
  });

  const allHeritage: HeritageMarker[] = [
    ...heritageRendered,
    ...staticBigSix,
  ];

  return (
    <MapContainer
      center={[51.375, -1.85]}
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
        const isBig = !!h.big_six;
        return (
          <CircleMarker
            key={h.id}
            center={[h.lat, h.lng]}
            radius={isBig ? 5 : 3}
            pathOptions={isBig ? heritageBigSixStyle : heritageStyle}
          >
            {isBig && h.big_six_label && (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -6]}
                className="pewsey-heritage-label"
              >
                {h.big_six_label}
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
