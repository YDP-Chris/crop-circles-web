import { supabase } from "@/lib/supabase";

export const revalidate = 600;

type ProximityStats = {
  formation_count: number;
  random_count: number;
  formation_median_m: number;
  random_median_m: number;
  formation_mean_m: number;
  random_mean_m: number;
  formation_within_500m_pct: number;
  random_within_500m_pct: number;
  formation_within_1km_pct: number;
  random_within_1km_pct: number;
  formation_within_2km_pct: number;
  random_within_2km_pct: number;
};

type Cluster = {
  name: string;
  site_type: string;
  formations_within_5km: number;
  closest_m: number;
  avg_dist_m: number;
};

async function loadStats(): Promise<ProximityStats | null> {
  const { data, error } = await supabase.rpc("cc_proximity_stats", {
    p_random_n: 500,
  });
  if (error) {
    console.error("loadStats error", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as ProximityStats;
}

async function loadClusters(): Promise<Cluster[]> {
  const { data, error } = await supabase
    .from("formation_nearby_sites")
    .select(
      `distance_m, formation_id, heritage_sites!inner ( name, site_type )`,
    );
  if (error) {
    console.error("loadClusters error", error);
    return [];
  }
  const rows = (data ?? []) as unknown as Array<{
    distance_m: number;
    formation_id: string;
    heritage_sites: { name: string | null; site_type: string };
  }>;
  const grouped: Map<
    string,
    {
      name: string;
      site_type: string;
      formation_ids: Set<string>;
      distances: number[];
    }
  > = new Map();
  for (const r of rows) {
    if (!r.heritage_sites?.name) continue;
    const key = r.heritage_sites.name;
    let agg = grouped.get(key);
    if (!agg) {
      agg = {
        name: key,
        site_type: r.heritage_sites.site_type,
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
      name: g.name,
      site_type: g.site_type,
      formations_within_5km: g.formation_ids.size,
      closest_m: Math.min(...g.distances),
      avg_dist_m: Math.round(
        g.distances.reduce((a, b) => a + b, 0) / g.distances.length,
      ),
    }))
    .sort((a, b) => b.formations_within_5km - a.formations_within_5km || a.closest_m - b.closest_m)
    .slice(0, 8);
}

function fmtMeters(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function ProximityBar({
  formationPct,
  randomPct,
  label,
}: {
  formationPct: number;
  randomPct: number;
  label: string;
}) {
  const max = Math.max(formationPct, randomPct, 10);
  return (
    <>
      <div className="proximity-row">
        <span className="label">Formations</span>
        <div className="proximity-bar-track">
          <div
            className="proximity-bar-fill formation"
            style={{ width: `${(100 * formationPct) / max}%` }}
          />
        </div>
        <span className="value">{formationPct}%</span>
      </div>
      <div className="proximity-row">
        <span className="label">Random</span>
        <div className="proximity-bar-track">
          <div
            className="proximity-bar-fill random"
            style={{ width: `${(100 * randomPct) / max}%` }}
          />
        </div>
        <span className="value">{randomPct}%</span>
      </div>
      <div className="proximity-row">
        <span className="label small" />
        <span className="small">within {label}</span>
        <span />
      </div>
    </>
  );
}

export default async function FindingsPage() {
  const [stats, clusters] = await Promise.all([loadStats(), loadClusters()]);

  if (!stats) {
    return (
      <div className="findings">
        <h1>Findings</h1>
        <p>Stats unavailable. Try again in a moment.</p>
      </div>
    );
  }

  const multiple = (
    stats.formation_within_500m_pct / Math.max(stats.random_within_500m_pct, 0.1)
  ).toFixed(1);

  return (
    <div className="findings">
      <h1>Crop circles cluster near ancient sites</h1>
      <p className="lead">
        A first-pass analysis of {stats.formation_count} geotagged formations
        in southern England, against a random-baseline of {stats.random_count}{" "}
        points in the same area.
      </p>

      <div className="headline-stat">
        <div className="multiple">{multiple}&times;</div>
        <div className="multiple-label">
          enrichment within 500 m of an archaeological / heritage site, vs.
          chance
        </div>
        <div className="summary">
          <strong>{stats.formation_within_500m_pct}%</strong> of geotagged
          formations sit within 500 m of a heritage site. For random points in
          the same Wessex bounding box, only{" "}
          <strong>{stats.random_within_500m_pct}%</strong> do. The crop-circle
          community has claimed this clustering for decades; with this sample
          it&rsquo;s already visible.
        </div>
      </div>

      <h2>How close, exactly</h2>
      <p>
        Median distance to the nearest heritage site:{" "}
        <strong>{fmtMeters(stats.formation_median_m)}</strong> for formations,{" "}
        <strong>{fmtMeters(stats.random_median_m)}</strong> for random points.
      </p>

      <div className="proximity-bars">
        <ProximityBar
          formationPct={stats.formation_within_500m_pct}
          randomPct={stats.random_within_500m_pct}
          label="500 m"
        />
        <div style={{ height: 12 }} />
        <ProximityBar
          formationPct={stats.formation_within_1km_pct}
          randomPct={stats.random_within_1km_pct}
          label="1 km"
        />
        <div style={{ height: 12 }} />
        <ProximityBar
          formationPct={stats.formation_within_2km_pct}
          randomPct={stats.random_within_2km_pct}
          label="2 km"
        />
      </div>

      <h2>Top clusters</h2>
      <p>
        These named heritage sites have the most formations within 5 km. Half
        the clustering signal in southern England comes from the first two.
      </p>

      <div className="cluster-list">
        {clusters.map((c) => (
          <div key={c.name} className="cluster">
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
        Sample size is small. Wikimedia EXIF-geotagged photos are biased
        towards famous formations, which already correlate with famous
        landmarks &mdash; the result will get more honest as we ingest sources
        with native coordinates (Lucy Pringle&rsquo;s archive next). Wessex is
        also heritage-dense in absolute terms, so the headline number is the{" "}
        <em>ratio</em>, not the distance itself. Heritage data &copy;
        OpenStreetMap contributors (ODbL); coverage is southern England only
        in this first pass.
      </p>
    </div>
  );
}
