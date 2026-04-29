import dynamic from "next/dynamic";
import { supabase, type Formation } from "@/lib/supabase";
import type { HeritageMarker } from "./PewseyMap";

const PewseyMap = dynamic(() => import("./PewseyMap"), { ssr: false });

export const revalidate = 600;

// Pewsey Vale rough bounding box. Captures Avebury / Silbury at the north,
// Adam's Grave / Knap Hill / Alton Barnes at the south, and the Marlborough
// Downs to the east. ~10km square in real terms.
const PEWSEY_BBOX = {
  latMin: 51.30,
  latMax: 51.45,
  lngMin: -1.95,
  lngMax: -1.75,
};

function inBbox(lat: number, lng: number): boolean {
  return (
    lat >= PEWSEY_BBOX.latMin &&
    lat <= PEWSEY_BBOX.latMax &&
    lng >= PEWSEY_BBOX.lngMin &&
    lng <= PEWSEY_BBOX.lngMax
  );
}

async function loadFormations(): Promise<Formation[]> {
  const PAGE = 1000;
  const all: Formation[] = [];
  let start = 0;
  for (let safety = 0; safety < 50; safety++) {
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
      .gte("lat", PEWSEY_BBOX.latMin)
      .lte("lat", PEWSEY_BBOX.latMax)
      .gte("lng", PEWSEY_BBOX.lngMin)
      .lte("lng", PEWSEY_BBOX.lngMax)
      .order("event_date", { ascending: false, nullsFirst: false })
      .range(start, start + PAGE - 1);

    if (error) {
      console.error("loadFormations (pewsey) error", error);
      break;
    }
    const rows = (data ?? []) as unknown as Formation[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    start += PAGE;
  }
  return all;
}

// Raw fetch against PostgREST for heritage_sites in the Pewsey bbox.
// supabase-js' schema-bound client is unreliable for non-public schemas;
// the raw fetch with Accept-Profile is the canonical pattern in this repo.
async function loadHeritage(): Promise<HeritageMarker[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const params = new URLSearchParams({
    select: "id,name,site_type,lat,lng",
    lat: `gte.${PEWSEY_BBOX.latMin}`,
    lng: `gte.${PEWSEY_BBOX.lngMin}`,
    limit: "5000",
  });
  // PostgREST allows multiple operators per column via repeated params using
  // the same key; URLSearchParams handles that with append.
  params.append("lat", `lte.${PEWSEY_BBOX.latMax}`);
  params.append("lng", `lte.${PEWSEY_BBOX.lngMax}`);

  const r = await fetch(`${url}/rest/v1/heritage_sites?${params.toString()}`, {
    headers: {
      "Accept-Profile": "crop_circles",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    next: { revalidate: 600 },
  });
  if (!r.ok) {
    console.error("loadHeritage failed", r.status, await r.text());
    return [];
  }
  const rows = (await r.json()) as Array<{
    id: string;
    name: string | null;
    site_type: string;
    lat: number | null;
    lng: number | null;
  }>;
  return rows
    .filter((h) => h.lat !== null && h.lng !== null)
    .map((h) => ({
      id: h.id,
      name: h.name,
      site_type: h.site_type,
      lat: h.lat as number,
      lng: h.lng as number,
    }));
}

type TopSite = {
  id: string;
  name: string;
  site_type: string;
  formations_within_5km: number;
  closest_m: number;
  avg_dist_m: number;
};

// Build "top sites" list from formation_nearby_sites joined with heritage_sites,
// restricted to heritage sites whose coords sit in the Pewsey bbox.
async function loadTopSites(): Promise<TopSite[]> {
  const { data, error } = await supabase
    .from("formation_nearby_sites")
    .select(
      `distance_m, formation_id, heritage_sites!inner ( id, name, site_type, lat, lng )`,
    );
  if (error) {
    console.error("loadTopSites error", error);
    return [];
  }
  const rows = (data ?? []) as unknown as Array<{
    distance_m: number;
    formation_id: string;
    heritage_sites: {
      id: string;
      name: string | null;
      site_type: string;
      lat: number | null;
      lng: number | null;
    };
  }>;
  const grouped: Map<
    string,
    {
      id: string;
      name: string;
      site_type: string;
      formation_ids: Set<string>;
      distances: number[];
    }
  > = new Map();
  for (const r of rows) {
    const hs = r.heritage_sites;
    if (!hs?.name) continue;
    if (hs.lat === null || hs.lng === null) continue;
    if (!inBbox(hs.lat, hs.lng)) continue;
    const key = hs.id;
    let agg = grouped.get(key);
    if (!agg) {
      agg = {
        id: hs.id,
        name: hs.name,
        site_type: hs.site_type,
        formation_ids: new Set(),
        distances: [],
      };
      grouped.set(key, agg);
    }
    agg.formation_ids.add(r.formation_id);
    agg.distances.push(r.distance_m);
  }
  return Array.from(grouped.values())
    .map((g) => ({
      id: g.id,
      name: g.name,
      site_type: g.site_type,
      formations_within_5km: g.formation_ids.size,
      closest_m: Math.min(...g.distances),
      avg_dist_m: Math.round(
        g.distances.reduce((a, b) => a + b, 0) / g.distances.length,
      ),
    }))
    .sort(
      (a, b) =>
        b.formations_within_5km - a.formations_within_5km ||
        a.closest_m - b.closest_m,
    )
    .slice(0, 8);
}

function fmtMeters(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export default async function PewseyPage() {
  const [formations, heritage, topSites] = await Promise.all([
    loadFormations(),
    loadHeritage(),
    loadTopSites(),
  ]);

  const geotagged = formations.filter((f) => f.lat !== null && f.lng !== null);
  const exact = geotagged.filter((f) => (f.location_precision_m ?? 0) <= 1000);

  return (
    <div className="findings">
      <h1>Pewsey Vale</h1>
      <p className="lead">
        The world&rsquo;s densest crop-circle landscape, layered on Neolithic
        Wessex.
      </p>

      <p>
        The Pewsey Vale is a chalk downland basin in Wiltshire, bordered by
        Avebury and Silbury Hill to the north, the Marlborough Downs to the
        east, and Salisbury Plain to the south. The area we map here is
        roughly ten kilometres square &mdash; small enough to walk across in
        a day. Within it sit some of the densest concentrations of long
        barrows, henges, causewayed enclosures and chalk hill figures
        anywhere in the United Kingdom. It is also where, by most counts,
        more than half of all UK crop circle formations recorded since 2005
        have appeared. {geotagged.length} formations from this corpus fall
        inside the bbox below ({exact.length} with exact coordinates), set
        against the named heritage sites that share the valley with them.
      </p>

      <div className="map-wrap" style={{ height: 520, marginTop: 16 }}>
        <PewseyMap formations={geotagged} heritage={heritage} />
      </div>

      <h2>Top sites here</h2>
      <p>
        Heritage sites inside the Pewsey bbox, ranked by how many formations
        sit within 5 km. Only formations with exact coordinates contribute.
      </p>

      <div className="cluster-list">
        {topSites.length === 0 && (
          <p className="small">
            No proximity data available for this bbox yet.
          </p>
        )}
        {topSites.map((c) => (
          <div key={c.id} className="cluster">
            <div className="name">{c.name}</div>
            <div className="stat">
              {c.formations_within_5km} formation
              {c.formations_within_5km === 1 ? "" : "s"} within 5 km &middot;
              closest {fmtMeters(c.closest_m)} &middot; type: {c.site_type}
            </div>
          </div>
        ))}
      </div>

      <h2>Caveats</h2>
      <p className="small">
        Pewsey-area formations in this corpus are a mix of exact-coordinate
        records (mostly Wikimedia EXIF-geotagged photos) and approximate
        records placed at a county centroid (Crop Circle Connector and
        similar archives). Only the exact ones contribute to the proximity
        counts above; approximate dots are shown for context but a centroid
        is not a real location. Heritage data &copy; OpenStreetMap
        contributors (ODbL).
      </p>
    </div>
  );
}
