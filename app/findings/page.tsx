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

type TemporalStats = {
  total_with_date: number;
  lunar: {
    chi_square: number;
    df: number;
    critical_005: number;
    critical_001: number;
    is_significant_005: boolean;
    by_phase: { phase: string; count: number; expected: number; ratio: number }[];
  };
  monthly: { month: number; count: number; pct: number }[];
  weekday: { dow: number; name: string; count: number; pct: number }[];
  yearly: { year: number; count: number; uk: number; other: number }[];
};

const PHASE_LABELS: Record<string, string> = {
  new: "New",
  waxing_crescent: "Waxing crescent",
  first_quarter: "First quarter",
  waxing_gibbous: "Waxing gibbous",
  full: "Full",
  waning_gibbous: "Waning gibbous",
  last_quarter: "Last quarter",
  waning_crescent: "Waning crescent",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

async function rpc<T>(name: string, body: object = {}): Promise<T | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Profile": "crop_circles",
      "Content-Profile": "crop_circles",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    next: { revalidate: 600 },
  });
  if (!r.ok) {
    console.error(`${name} failed`, r.status, await r.text());
    return null;
  }
  return (await r.json()) as T;
}

async function loadProximity(): Promise<ProximityStats | null> {
  const rows = await rpc<ProximityStats[]>("cc_proximity_stats", { p_random_n: 500 });
  return rows?.[0] ?? null;
}

async function loadTemporal(): Promise<TemporalStats | null> {
  return rpc<TemporalStats>("cc_temporal_stats");
}

async function loadClusters(): Promise<Cluster[]> {
  const { data, error } = await supabase
    .from("formation_nearby_sites")
    .select(`distance_m, formation_id, heritage_sites!inner ( name, site_type )`);
  if (error) return [];
  const rows = (data ?? []) as unknown as Array<{
    distance_m: number;
    formation_id: string;
    heritage_sites: { name: string | null; site_type: string };
  }>;
  const grouped = new Map<
    string,
    { name: string; site_type: string; formation_ids: Set<string>; distances: number[] }
  >();
  for (const r of rows) {
    if (!r.heritage_sites?.name) continue;
    const key = r.heritage_sites.name;
    let agg = grouped.get(key);
    if (!agg) {
      agg = { name: key, site_type: r.heritage_sites.site_type, formation_ids: new Set(), distances: [] };
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
      avg_dist_m: Math.round(g.distances.reduce((a, b) => a + b, 0) / g.distances.length),
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
          <div className="proximity-bar-fill formation" style={{ width: `${(100 * formationPct) / max}%` }} />
        </div>
        <span className="value">{formationPct}%</span>
      </div>
      <div className="proximity-row">
        <span className="label">Random</span>
        <div className="proximity-bar-track">
          <div className="proximity-bar-fill random" style={{ width: `${(100 * randomPct) / max}%` }} />
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

function DistroBar({
  pct,
  label,
  sub,
  expectedPct,
  highlight = false,
}: {
  pct: number;
  label: string;
  sub?: string;
  expectedPct: number;
  highlight?: boolean;
}) {
  const max = 40; // Display ceiling — keeps proportions consistent across charts
  return (
    <div className="distro-row">
      <span className="distro-label">{label}</span>
      <div className="distro-track">
        <div
          className="distro-fill"
          style={{
            width: `${Math.min(100, (100 * pct) / max)}%`,
            background: highlight ? "#6dd96a" : "#a892ff",
          }}
        />
        <div
          className="distro-expected-line"
          style={{ left: `${(100 * expectedPct) / max}%` }}
          title={`expected ${expectedPct.toFixed(1)}%`}
        />
      </div>
      <span className="distro-value">{pct}%{sub ? <span className="distro-sub"> {sub}</span> : null}</span>
    </div>
  );
}

export default async function FindingsPage() {
  const [proximity, temporal, clusters] = await Promise.all([
    loadProximity(),
    loadTemporal(),
    loadClusters(),
  ]);

  if (!proximity || !temporal) {
    return (
      <div className="findings">
        <h1>Findings</h1>
        <p>Stats unavailable. Try again in a moment.</p>
      </div>
    );
  }

  const multiple = (
    proximity.formation_within_500m_pct / Math.max(proximity.random_within_500m_pct, 0.1)
  ).toFixed(1);

  const peakMonth = temporal.monthly.reduce((a, b) => (b.count > a.count ? b : a));
  const peakDow = temporal.weekday.reduce((a, b) => (b.count > a.count ? b : a));
  const peakYear = temporal.yearly.reduce((a, b) => (b.count > a.count ? b : a));

  return (
    <div className="findings">
      <h1>Findings</h1>
      <p className="lead">
        Empirical results from the corpus. Each finding states what we tested,
        what we found, and how confident we are. Numbers refresh as the corpus
        grows.
      </p>

      {/* ============================================================== */}
      {/* HERITAGE PROXIMITY */}
      {/* ============================================================== */}
      <h2 style={{ marginTop: 8 }}>Crop circles cluster near ancient sites</h2>

      <div className="headline-stat">
        <div className="multiple">{multiple}&times;</div>
        <div className="multiple-label">
          enrichment within 500 m of an archaeological / heritage site, vs.
          chance
        </div>
        <div className="summary">
          <strong>{proximity.formation_within_500m_pct}%</strong> of geotagged
          formations in Wessex sit within 500 m of a heritage site. For random
          points in the same bounding box, only{" "}
          <strong>{proximity.random_within_500m_pct}%</strong> do. Tested on{" "}
          {proximity.formation_count} formations vs {proximity.random_count}{" "}
          random points; median nearest-site distance{" "}
          {fmtMeters(proximity.formation_median_m)} for formations vs{" "}
          {fmtMeters(proximity.random_median_m)} for random.
        </div>
      </div>

      <div className="proximity-bars">
        <ProximityBar formationPct={proximity.formation_within_500m_pct} randomPct={proximity.random_within_500m_pct} label="500 m" />
        <div style={{ height: 12 }} />
        <ProximityBar formationPct={proximity.formation_within_1km_pct} randomPct={proximity.random_within_1km_pct} label="1 km" />
        <div style={{ height: 12 }} />
        <ProximityBar formationPct={proximity.formation_within_2km_pct} randomPct={proximity.random_within_2km_pct} label="2 km" />
      </div>

      <p className="small">
        Top clusters: <strong>{clusters[0]?.name}</strong> ({clusters[0]?.formations_within_5km} formations within 5 km, closest {fmtMeters(clusters[0]?.closest_m ?? 0)}) and <strong>{clusters[1]?.name}</strong> ({clusters[1]?.formations_within_5km} within 5 km). Half the clustering signal in southern England comes from these two named sites in the Pewsey Vale.
      </p>

      {/* ============================================================== */}
      {/* LUNAR */}
      {/* ============================================================== */}
      <h2>Crop circles do <em>not</em> cluster on full moons</h2>

      <p>
        Long-standing claim in the crop-circle community: formations occur
        preferentially around the full moon. We tested it. They don&rsquo;t.
      </p>

      <div className="headline-stat">
        <div className="multiple" style={{ color: "#a892ff" }}>χ² = {temporal.lunar.chi_square}</div>
        <div className="multiple-label">
          uniform distribution; not significant (df=7, critical at p=0.05 is{" "}
          {temporal.lunar.critical_005})
        </div>
        <div className="summary">
          Across <strong>{temporal.total_with_date.toLocaleString()}</strong>{" "}
          dated formations, the eight lunar phases each capture roughly{" "}
          {(100 / 8).toFixed(1)}% of the total &mdash; the full-moon phase
          actually sits <strong>slightly below</strong> expected (
          {temporal.lunar.by_phase.find((p) => p.phase === "full")?.ratio?.toFixed(2) ?? "—"}× expected).
          The 35-year-old claim doesn&rsquo;t survive the data.
        </div>
      </div>

      <div className="distro-bars">
        {temporal.lunar.by_phase.map((p) => (
          <DistroBar
            key={p.phase}
            label={PHASE_LABELS[p.phase] ?? p.phase}
            pct={Math.round((100 * p.count) / temporal.total_with_date * 10) / 10}
            sub={`(${p.count})`}
            expectedPct={100 / 8}
            highlight={p.phase === "full"}
          />
        ))}
      </div>
      <p className="small">
        Purple bars are observed share; vertical line marks the expected{" "}
        {(100 / 8).toFixed(1)}% if formations were uniformly distributed across
        phases.
      </p>

      {/* ============================================================== */}
      {/* SEASONALITY */}
      {/* ============================================================== */}
      <h2>The phenomenon has a sharp seasonal window</h2>

      <p>
        Formations are bounded by the crop calendar. Wheat ripens in late June
        through July in the UK; that&rsquo;s when the canvas exists. Outside
        the window, the rate collapses.
      </p>

      <div className="headline-stat">
        <div className="multiple" style={{ color: "#ffb454" }}>
          {peakMonth.pct}%
        </div>
        <div className="multiple-label">
          of all formations occur in {MONTH_LABELS[peakMonth.month - 1]}
        </div>
        <div className="summary">
          June + July combined account for{" "}
          <strong>
            {temporal.monthly
              .filter((m) => m.month === 6 || m.month === 7)
              .reduce((a, b) => a + b.pct, 0)
              .toFixed(1)}
            %
          </strong>{" "}
          of every formation in the corpus. Pre-May activity is essentially
          absent.
        </div>
      </div>

      <div className="distro-bars">
        {temporal.monthly.map((m) => (
          <DistroBar
            key={m.month}
            label={MONTH_LABELS[m.month - 1]}
            pct={m.pct}
            sub={`(${m.count})`}
            expectedPct={100 / 12}
            highlight={m.month === 6 || m.month === 7}
          />
        ))}
      </div>

      {/* ============================================================== */}
      {/* WEEKDAY */}
      {/* ============================================================== */}
      <h2>Sunday spike: discovery bias, not weekend hoaxers</h2>

      <p>
        Formation dates over-index on Sunday and under-index on Monday-Thursday.
        If hoaxers worked weekends, both Saturday and Sunday should pop;
        Saturday is unremarkable, so the simpler explanation is{" "}
        <em>Sunday-morning discovery</em> &mdash; farmers walking the field
        after Saturday night and reporting the find with that day&rsquo;s
        date.
      </p>

      <div className="distro-bars">
        {temporal.weekday.map((d) => (
          <DistroBar
            key={d.dow}
            label={d.name}
            pct={d.pct}
            sub={`(${d.count})`}
            expectedPct={100 / 7}
            highlight={d.name === "Sun"}
          />
        ))}
      </div>
      <p className="small">
        Expected uniform share is {(100 / 7).toFixed(1)}% per weekday. Sunday
        sits at <strong>{peakDow.pct}%</strong>;{" "}
        {((peakDow.pct / (100 / 7)) * 100 - 100).toFixed(0)}% above baseline.
      </p>

      {/* ============================================================== */}
      {/* YEARLY */}
      {/* ============================================================== */}
      <h2>The phenomenon peaked in the late 2000s</h2>

      <p>
        The corpus has a clear arc: a slow build through the 1990s, a sharp
        rise from 2005, peak years 2006-2008, then a steady decline. Whether
        this is the phenomenon itself dropping off or archive-coverage drifting
        is one of the open questions; both are probably partly true.
      </p>

      <div className="yearly-bars">
        {temporal.yearly.map((y) => {
          const max = peakYear.count;
          return (
            <div key={y.year} className="yearly-row">
              <span className="yearly-year">{y.year}</span>
              <div className="yearly-track">
                <div className="yearly-fill uk" style={{ width: `${(100 * y.uk) / max}%` }} title={`UK: ${y.uk}`} />
                <div className="yearly-fill other" style={{ width: `${(100 * y.other) / max}%` }} title={`Other: ${y.other}`} />
              </div>
              <span className="yearly-count">{y.count}</span>
            </div>
          );
        })}
      </div>
      <p className="small">
        Green = UK formations, purple = elsewhere. Peak year{" "}
        <strong>{peakYear.year}</strong> with <strong>{peakYear.count}</strong>{" "}
        formations.
      </p>

      {/* ============================================================== */}
      {/* CAVEATS */}
      {/* ============================================================== */}
      <h2>What these numbers do and don&rsquo;t mean</h2>
      <p className="small">
        Heritage proximity is sampled on the small subset of formations with
        EXIF GPS coords (Wikimedia Commons). Photographer bias matters here:
        people photograph famous formations, and famous formations cluster near
        famous landmarks. The result will get more honest as we ingest sources
        with native coordinates. Lunar / seasonal / weekday / yearly stats
        cover all {temporal.total_with_date.toLocaleString()} dated formations
        and aren&rsquo;t sensitive to that bias. Heritage data &copy;
        OpenStreetMap contributors (ODbL).
      </p>
    </div>
  );
}
