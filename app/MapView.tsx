"use client";

import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
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

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPopupHtml(f: Formation): string {
  const approx = isApproximate(f);
  const sourceLink =
    f.formation_aliases?.find((a) => a.source_url)?.source_url ?? null;
  const ccImage = f.formation_images?.[0]?.source_url ?? null;
  const loc = [f.nearest_landmark, f.county, f.country].filter(Boolean).join(", ");

  let html = `<div style="min-width:180px">
    <strong>${escapeHtml(f.canonical_id ?? "(unnamed)")}</strong><br/>
    ${escapeHtml(f.event_date ?? "(date unknown)")}${
    f.crop_type ? ` &middot; ${escapeHtml(f.crop_type)}` : ""
  }<br/>
    ${escapeHtml(loc)}`;

  if (approx) {
    html += `<div style="margin-top:6px;font-size:11px;color:#a892ff">Approximate location (county/country centroid)</div>`;
  }

  if (!approx && f.formation_nearby_sites?.length) {
    const top = [...f.formation_nearby_sites]
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 3);
    html += `<div style="margin-top:8px"><div style="font-size:11px;color:#888;margin-bottom:2px">Nearby heritage sites</div>`;
    for (const n of top) {
      const dist =
        n.distance_m < 1000
          ? `${n.distance_m}m`
          : `${(n.distance_m / 1000).toFixed(1)}km`;
      const name =
        n.heritage_sites?.name ??
        `unnamed ${n.heritage_sites?.site_type ?? "site"}`;
      html += `<div style="font-size:11px">${escapeHtml(name)} <span style="color:#888">${escapeHtml(dist)}</span></div>`;
    }
    html += `</div>`;
  }

  if (ccImage) {
    html += `<div style="margin-top:8px"><a href="${escapeHtml(ccImage)}" target="_blank" rel="noreferrer">view image</a></div>`;
  }
  if (sourceLink) {
    html += `<div style="margin-top:4px"><a href="${escapeHtml(sourceLink)}" target="_blank" rel="noreferrer">view source</a></div>`;
  }
  html += `</div>`;
  return html;
}

function ClusteredMarkers({ formations }: { formations: Formation[] }) {
  const map = useMap();
  useEffect(() => {
    const points = formations.filter(
      (f): f is Formation & { lat: number; lng: number } =>
        f.lat !== null && f.lng !== null,
    );

    // Cast to any because leaflet.markercluster augments L's runtime API but
    // the TS types are picky about the constructor name.
    const cluster = (L as unknown as { markerClusterGroup: (opts?: object) => L.LayerGroup }).markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (clusterRef: { getChildCount: () => number; getAllChildMarkers: () => Array<{ options?: { _approx?: boolean } }> }) => {
        const count = clusterRef.getChildCount();
        const children = clusterRef.getAllChildMarkers();
        const allApprox = children.every((c) => c.options?._approx);
        const color = allApprox ? "#a892ff" : "#6dd96a";
        const size = count > 100 ? 44 : count > 20 ? 36 : 28;
        return L.divIcon({
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${color}20;border:2px solid ${color};
            display:flex;align-items:center;justify-content:center;
            color:#e6e6e6;font-size:11px;font-weight:600;
            font-variant-numeric:tabular-nums;
          ">${count}</div>`,
          className: "cc-cluster-icon",
          iconSize: [size, size],
        });
      },
    });

    for (const f of points) {
      const approx = isApproximate(f);
      const marker = L.circleMarker([f.lat, f.lng], {
        ...(approx ? approxStyle : exactStyle),
        radius: approx ? 6 : 5,
      });
      // Stash approximate flag for cluster icon coloring
      (marker.options as { _approx?: boolean })._approx = approx;
      marker.bindPopup(buildPopupHtml(f), { maxWidth: 320 });
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [formations, map]);

  return null;
}

export default function MapView({ formations }: { formations: Formation[] }) {
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
      <ClusteredMarkers formations={formations} />
    </MapContainer>
  );
}
