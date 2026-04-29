import dynamic from "next/dynamic";
import { supabase, type Formation } from "@/lib/supabase";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export const revalidate = 300; // 5 min ISR

async function loadFormations(): Promise<Formation[]> {
  const { data, error } = await supabase
    .from("formations")
    .select(
      `
        id, canonical_id, event_date, country, nearest_landmark, notes, lat, lng,
        formation_images (source_url, photographer, license, width, height)
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

  return (
    <>
      <header className="site-header">
        <h1>Crop Circles</h1>
        <span className="stats">
          {formations.length} formations &middot; {geotagged.length} geotagged
        </span>
      </header>
      <main className="layout">
        <div className="map-wrap">
          <MapView formations={geotagged} />
        </div>
        <aside className="sidebar">
          <h2>Recent</h2>
          {formations.slice(0, 50).map((f) => (
            <div key={f.id} className="formation-card">
              <div>{f.canonical_id ?? "(unnamed)"}</div>
              <div className="meta">
                {f.event_date ?? f.notes ?? "(undated)"}
                {f.country ? ` · ${f.country}` : ""}
                {f.nearest_landmark ? ` · ${f.nearest_landmark}` : ""}
              </div>
              {f.formation_images?.[0]?.photographer && (
                <div className="photog">
                  photo &middot; {f.formation_images[0].photographer}
                </div>
              )}
            </div>
          ))}
        </aside>
      </main>
    </>
  );
}
