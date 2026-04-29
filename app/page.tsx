import dynamic from "next/dynamic";
import { supabase, type Formation } from "@/lib/supabase";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export const revalidate = 300;

async function loadFormations(): Promise<Formation[]> {
  const { data, error } = await supabase
    .from("formations")
    .select(
      `
        id, canonical_id, event_date, country, county, nearest_landmark,
        crop_type, location_precision_m, notes, lat, lng,
        formation_aliases (source_id, source_url, is_primary),
        formation_images (source_url, photographer, license, width, height),
        formation_nearby_sites (
          distance_m, bearing_deg,
          heritage_sites ( name, site_type, historic_period )
        )
      `,
    )
    .order("event_date", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("loadFormations error", error);
    return [];
  }
  return (data ?? []) as unknown as Formation[];
}

export default async function HomePage() {
  const formations = await loadFormations();
  const geotagged = formations.filter((f) => f.lat !== null && f.lng !== null);
  const exact = geotagged.filter((f) => (f.location_precision_m ?? 0) <= 1000);
  const approximate = geotagged.length - exact.length;

  return (
    <>
      <header className="site-header">
        <h1>Crop Circles</h1>
        <span className="stats">
          {formations.length} formations &middot; {exact.length} exact &middot;{" "}
          {approximate} approximate
        </span>
      </header>
      <main className="layout">
        <div className="map-wrap">
          <MapView formations={geotagged} />
        </div>
        <aside className="sidebar">
          <div className="about-data">
            <h2>About the data</h2>
            <p>
              Solid green dots are <strong>exact</strong> coordinates from
              photo EXIF data. Hollow purple dots are{" "}
              <strong>approximate</strong> &mdash; we know the county or
              country and place the dot at that region&rsquo;s centroid.
              Hover a dot for the precise breakdown.
            </p>
            <p style={{ color: "#888", marginTop: 8 }}>
              Click an exact dot to see nearby archaeological / heritage
              sites within 5km. Heritage data &copy; OpenStreetMap
              contributors (ODbL); coverage is currently Wessex (southern
              England).
            </p>
            <p style={{ color: "#666", marginTop: 8 }}>
              Image licensing varies by source. Where we can&rsquo;t
              redistribute, we link out to the original archive.
            </p>
          </div>
          <h2>Recent</h2>
          {formations.slice(0, 60).map((f) => {
            const approx = (f.location_precision_m ?? 0) > 1000;
            return (
              <div key={f.id} className="formation-card">
                <div>
                  {f.canonical_id ?? "(unnamed)"}
                  {approx && <span className="approx-tag"> ~</span>}
                </div>
                <div className="meta">
                  {f.event_date ?? f.notes ?? "(undated)"}
                  {f.crop_type ? ` · ${f.crop_type}` : ""}
                </div>
                <div className="meta">
                  {[f.nearest_landmark, f.county, f.country]
                    .filter(Boolean)
                    .join(", ") || "(no location)"}
                </div>
                {f.formation_images?.[0]?.photographer && (
                  <div className="photog">
                    photo &middot; {f.formation_images[0].photographer}
                  </div>
                )}
              </div>
            );
          })}
        </aside>
      </main>
    </>
  );
}
