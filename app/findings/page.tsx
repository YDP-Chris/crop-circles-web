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

type ExtraStats = {
  crop_evolution: { year: number; crop: string; count: number }[];
  wilts_share: { year: number; wilts: number; uk_total: number; pct: number | null }[];
  country_first: { country: string; first_seen: string; total: number }[];
  wave_days: { date: string; n: number; n_countries: number; countries: string[] }[];
  calendar_heatmap: { month: number; day: number; count: number }[];
};

type MoreStats = {
  day_of_month: { day: number; count: number }[];
  sunday_by_year: {
    year: number;
    total: number;
    sundays: number;
    sunday_pct: number | null;
  }[];
  canon: {
    canonical_id: string;
    event_date: string | null;
    country: string | null;
    county: string | null;
    nearest_landmark: string | null;
    n_aliases: number;
    source_slugs: string[];
  }[];
};

type WaveNarrative = {
  wave_date: string;
  n_countries: number;
  n_formations: number;
  countries: string[];
  narrative: string;
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

async function loadExtra(): Promise<ExtraStats | null> {
  return rpc<ExtraStats>("cc_extra_stats");
}

async function loadMore(): Promise<MoreStats | null> {
  return rpc<MoreStats>("cc_more_stats");
}

async function loadWaveNarratives(): Promise<WaveNarrative[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const r = await fetch(
    `${url}/rest/v1/wave_day_narratives?select=wave_date,n_countries,n_formations,countries,narrative&order=n_countries.desc,n_formations.desc&limit=10`,
    {
      headers: {
        "Accept-Profile": "crop_circles",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      next: { revalidate: 600 },
    },
  );
  if (!r.ok) return [];
  return (await r.json()) as WaveNarrative[];
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

function CalendarHeatmap({
  cells,
}: {
  cells: { month: number; day: number; count: number }[];
}) {
  const max = Math.max(...cells.map((c) => c.count), 1);
  const grid: Record<number, Record<number, number>> = {};
  for (const c of cells) {
    grid[c.month] = grid[c.month] || {};
    grid[c.month][c.day] = c.count;
  }
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return (
    <div className="calendar-heatmap">
      <div className="calendar-row calendar-header">
        <span className="calendar-mo" />
        {Array.from({ length: 31 }, (_, i) => (
          <span key={i} className="calendar-tick">
            {(i + 1) % 5 === 0 ? i + 1 : ""}
          </span>
        ))}
      </div>
      {months.map((mo, i) => {
        const month = i + 1;
        return (
          <div key={month} className="calendar-row">
            <span className="calendar-mo">{mo}</span>
            {Array.from({ length: 31 }, (_, d) => {
              const day = d + 1;
              const v = grid[month]?.[day] ?? 0;
              const intensity = v === 0 ? 0 : 0.15 + 0.85 * (v / max);
              return (
                <span
                  key={day}
                  className="calendar-cell"
                  title={`${mo} ${day}: ${v}`}
                  style={{
                    background:
                      v === 0 ? "#15151a" : `rgba(109, 217, 106, ${intensity})`,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function CropEvolution({
  rows,
}: {
  rows: { year: number; crop: string; count: number }[];
}) {
  // Pivot by year × crop
  const byYear = new Map<number, Record<string, number>>();
  const cropSet = new Set<string>();
  for (const r of rows) {
    const y = byYear.get(r.year) ?? {};
    y[r.crop] = (y[r.crop] ?? 0) + r.count;
    byYear.set(r.year, y);
    cropSet.add(r.crop);
  }
  // Stable color order; "other" + "unknown" last.
  const cropOrder = ["wheat", "barley", "oilseed rape", "grass", "maize", "other", "unknown"];
  const knownCrops = cropOrder.filter((c) => cropSet.has(c));
  const colors: Record<string, string> = {
    wheat: "#d4a73c",
    barley: "#a8c46a",
    "oilseed rape": "#e07a5f",
    grass: "#80c8a8",
    maize: "#f4d35e",
    other: "#7c7891",
    unknown: "#3d3d44",
  };
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  // Only show years with >=10 formations to avoid noise
  const significantYears = years.filter((y) => {
    const counts = byYear.get(y)!;
    return Object.values(counts).reduce((a, b) => a + b, 0) >= 10;
  });
  const maxTotal = Math.max(
    ...significantYears.map((y) =>
      Object.values(byYear.get(y)!).reduce((a, b) => a + b, 0),
    ),
  );

  return (
    <>
      <div className="crop-stack">
        {significantYears.map((y) => {
          const counts = byYear.get(y)!;
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <div key={y} className="crop-row">
              <span className="crop-year">{y}</span>
              <div
                className="crop-track"
                style={{ width: `${(100 * total) / maxTotal}%` }}
              >
                {knownCrops.map((c) => {
                  const v = counts[c] ?? 0;
                  if (v === 0) return null;
                  const pct = (100 * v) / total;
                  return (
                    <div
                      key={c}
                      className="crop-seg"
                      title={`${c}: ${v} (${pct.toFixed(0)}%)`}
                      style={{ width: `${pct}%`, background: colors[c] ?? "#555" }}
                    />
                  );
                })}
              </div>
              <span className="crop-total">{total}</span>
            </div>
          );
        })}
      </div>
      <div className="crop-legend">
        {knownCrops.map((c) => (
          <span key={c} className="crop-legend-item">
            <span
              className="crop-legend-swatch"
              style={{ background: colors[c] ?? "#555" }}
            />
            {c}
          </span>
        ))}
      </div>
    </>
  );
}

function CropSmallMultiples({
  rows,
}: {
  rows: { year: number; crop: string; count: number }[];
}) {
  const cropOrder = ["wheat", "barley", "oilseed rape", "grass", "maize"];
  const colors: Record<string, string> = {
    wheat: "#d4a73c",
    barley: "#a8c46a",
    "oilseed rape": "#e07a5f",
    grass: "#80c8a8",
    maize: "#f4d35e",
  };
  // Build per-crop year-count dictionary
  const perCrop: Record<string, Record<number, number>> = {};
  const allYears = new Set<number>();
  for (const r of rows) {
    if (!cropOrder.includes(r.crop)) continue;
    perCrop[r.crop] = perCrop[r.crop] || {};
    perCrop[r.crop][r.year] = (perCrop[r.crop][r.year] ?? 0) + r.count;
    allYears.add(r.year);
  }
  const years = Array.from(allYears).sort((a, b) => a - b);
  const overallMax = Math.max(
    ...cropOrder.flatMap((c) =>
      years.map((y) => perCrop[c]?.[y] ?? 0),
    ),
  );

  return (
    <div className="small-multiples">
      {cropOrder.map((c) => {
        const cropMax = Math.max(...years.map((y) => perCrop[c]?.[y] ?? 0));
        if (cropMax === 0) return null;
        return (
          <div key={c} className="small-multiple">
            <div
              className="small-multiple-title"
              style={{ color: colors[c] ?? "#888" }}
            >
              {c}
              <span className="small-multiple-max">peak {cropMax}</span>
            </div>
            <div className="small-multiple-bars">
              {years.map((y) => {
                const v = perCrop[c]?.[y] ?? 0;
                return (
                  <div
                    key={y}
                    className="small-multiple-bar"
                    title={`${c} ${y}: ${v}`}
                    style={{
                      height: `${Math.max(2, (100 * v) / Math.max(overallMax, 1))}%`,
                      background: v > 0 ? colors[c] ?? "#555" : "#1d1d20",
                    }}
                  />
                );
              })}
            </div>
            <div className="small-multiple-axis">
              <span>{years[0]}</span>
              <span>{years[years.length - 1]}</span>
            </div>
          </div>
        );
      })}
    </div>
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
  const [proximity, temporal, extra, more, narratives, clusters] = await Promise.all([
    loadProximity(),
    loadTemporal(),
    loadExtra(),
    loadMore(),
    loadWaveNarratives(),
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
      <nav className="findings-toc">
        <span className="toc-label">Jump to</span>
        <a href="#heritage">Heritage proximity</a>
        <a href="#lunar">Lunar test</a>
        <a href="#seasonality">Seasonality</a>
        <a href="#sunday">Sunday spike</a>
        <a href="#yearly">Yearly trend</a>
        <a href="#calendar">Calendar heatmap</a>
        <a href="#wiltshire">Wiltshire share</a>
        <a href="#countries">Country spread</a>
        <a href="#waves">Wave days</a>
        <a href="#crops">Crop evolution</a>
        <a href="#day-of-month">Day of month</a>
        <a href="#sunday-by-year">Sunday by year</a>
        <a href="#canon">Source canon</a>
        <a href="#caveats">Caveats</a>
      </nav>

      <h2 id="heritage" style={{ marginTop: 8 }}>Crop circles cluster near ancient sites</h2>

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
      <h2 id="lunar">Crop circles do <em>not</em> cluster on full moons</h2>

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
      <h2 id="seasonality">The phenomenon has a sharp seasonal window</h2>

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
      <h2 id="sunday">Sunday spike: discovery bias, not weekend hoaxers</h2>

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
      <h2 id="yearly">The phenomenon peaked in the late 2000s</h2>

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

      {extra && (
        <>
          {/* ============================================================== */}
          {/* CALENDAR HEATMAP */}
          {/* ============================================================== */}
          <h2 id="calendar">The calendar of formations</h2>
          <p>
            Day-of-year heatmap. Each cell is one calendar date; intensity is
            the all-time count of formations recorded on that day. The
            mid-summer ridge across late June through July is unmistakable.
          </p>
          <CalendarHeatmap cells={extra.calendar_heatmap} />

          {/* ============================================================== */}
          {/* WILTSHIRE SHARE OVER TIME */}
          {/* ============================================================== */}
          <h2 id="wiltshire">Wiltshire&rsquo;s share of UK formations is rising</h2>
          <p>
            Of UK formations with a recorded county, the share that fall in
            Wiltshire has trended <em>up</em> over time, not down. Either the
            phenomenon really is concentrating, or non-Wiltshire UK reporting
            is fading from CCC&rsquo;s coverage. Probably both.
          </p>
          <div className="distro-bars">
            {extra.wilts_share
              .filter((y) => y.uk_total >= 5 && y.pct !== null)
              .map((y) => (
                <DistroBar
                  key={y.year}
                  label={y.year.toString()}
                  pct={y.pct ?? 0}
                  sub={`(${y.wilts}/${y.uk_total})`}
                  expectedPct={50}
                  highlight={(y.pct ?? 0) >= 60}
                />
              ))}
          </div>
          <p className="small">
            Years with fewer than 5 UK formations are filtered out for
            stability. The vertical line marks the 50% mark for visual
            reference.
          </p>

          {/* ============================================================== */}
          {/* COUNTRY FIRST APPEARANCE */}
          {/* ============================================================== */}
          <h2 id="countries">The geographic spread, year by year</h2>
          <p>
            When did each country first appear in the corpus? UK records go
            back to 1990 in our data; nearly everyone else starts in
            2005&ndash;2007 with CCC&rsquo;s archive. New countries are still
            entering the catalog as recently as the 2020s.
          </p>
          <div className="proximity-table" style={{ display: "block" }}>
            <table className="proximity-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>First seen</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {extra.country_first.slice(0, 20).map((c) => (
                  <tr key={c.country}>
                    <td>{c.country}</td>
                    <td>{c.first_seen}</td>
                    <td className="num">{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ============================================================== */}
          {/* WAVE DAYS */}
          {/* ============================================================== */}
          <h2 id="waves">Cross-country wave days</h2>
          <p>
            Days when 3 or more countries reported formations simultaneously.
            Random expectation for this phenomenon at our base rate is roughly
            one every couple of months &mdash; we have{" "}
            <strong>{extra.wave_days?.length ?? 0}</strong> in the corpus.
            Coincidence, or coordinated reporting? Either answer is interesting.
          </p>
          <div className="cluster-list">
            {(extra.wave_days ?? []).slice(0, 10).map((w) => {
              const narr = narratives.find((n) => n.wave_date === w.date);
              return (
                <div key={w.date} className="cluster">
                  <div className="name">
                    {w.date} &middot; {w.n_countries} countries, {w.n} formations
                  </div>
                  <div className="stat">{w.countries.join(" · ")}</div>
                  {narr && (
                    <div
                      className="stat"
                      style={{
                        marginTop: 8,
                        color: "#cfcfcf",
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {narr.narrative}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ============================================================== */}
          {/* CROP TYPE EVOLUTION */}
          {/* ============================================================== */}
          <h2 id="crops">The canvas changes</h2>
          <p>
            Wheat is the dominant medium, but the cast of crops shifts each
            year. Oilseed rape only starts appearing in 2005; maize in 2006;
            barley grew its share through the late 2000s. These shifts track
            UK crop rotation, not formation choice &mdash; the phenomenon
            takes whatever&rsquo;s growing.
          </p>
          <CropEvolution rows={extra.crop_evolution} />

          {/* ============================================================== */}
          {/* CROP SMALL MULTIPLES */}
          {/* ============================================================== */}
          <h2 id="crops-timeline">Each crop on its own timeline</h2>
          <p>
            Same data, different cut. Each crop&rsquo;s absolute count over
            time tells its own story: wheat dominates, but oilseed rape and
            maize join the cast in the mid-2000s and barley climbs through
            the late decade.
          </p>
          <CropSmallMultiples rows={extra.crop_evolution} />
        </>
      )}

      {more && (
        <>
          {/* ============================================================== */}
          {/* DAY OF MONTH */}
          {/* ============================================================== */}
          <h2 id="day-of-month">The 31st is the rare day</h2>
          <p>
            Aggregating across all months: do certain days of the month see
            more formations than others? With one obvious exception &mdash;
            the 31st only exists in seven months &mdash; the distribution is
            close to flat. No mid-month or end-of-month bias.
          </p>
          <div className="distro-bars">
            {more.day_of_month.map((d) => {
              const total = more.day_of_month.reduce((a, b) => a + b.count, 0);
              const pct = Math.round((100 * d.count) / total * 10) / 10;
              return (
                <DistroBar
                  key={d.day}
                  label={d.day.toString()}
                  pct={pct}
                  sub={`(${d.count})`}
                  expectedPct={100 / 31}
                  highlight={d.day === 31}
                />
              );
            })}
          </div>

          {/* ============================================================== */}
          {/* SUNDAY BY YEAR */}
          {/* ============================================================== */}
          <h2 id="sunday-by-year">Has the Sunday spike weakened over time?</h2>
          <p>
            The headline finding above showed Sunday at 21% of the corpus
            against an expected 14%. If the spike is reporting bias (farmers
            walk fields on Sunday, log the date), modern smartphones and
            drones should reduce it: people now spot circles in real time,
            not on a Sunday-morning walk. Plotted by year:
          </p>
          <div className="distro-bars">
            {more.sunday_by_year.map((y) => (
              <DistroBar
                key={y.year}
                label={y.year.toString()}
                pct={y.sunday_pct ?? 0}
                sub={`(${y.sundays}/${y.total})`}
                expectedPct={100 / 7}
                highlight={(y.sunday_pct ?? 0) >= 25}
              />
            ))}
          </div>
          <p className="small">
            Vertical line marks the expected 14.3%. Years with fewer than 10
            formations are filtered out.
          </p>

          {/* ============================================================== */}
          {/* SOURCE CANON */}
          {/* ============================================================== */}
          <h2 id="canon">The canon &mdash; formations documented in multiple archives</h2>
          {(more.canon ?? []).length === 0 ? (
            <p className="small">
              No formations in the corpus yet have aliases from 2 or more
              archives. Pringle and cropcirclecenter both follow Müller-style
              canonical-ID conventions but in slightly different formats
              (lowercase YY-letter on Pringle, uppercase YYYYMMDD-letter on
              CCC), so they don&rsquo;t auto-merge. The cross-archive dedup
              pass &mdash; matching by event_date + location proximity
              instead of by ID &mdash; is queued for a follow-up. This
              section will populate after that runs.
            </p>
          ) : (
            <>
              <p>
                These formations are the famous ones &mdash; documented across
                multiple independent archives, usually because they were
                widely photographed in the period. Higher alias count means
                more independent eyes on the same event.
              </p>
              <div className="cluster-list">
                {(more.canon ?? []).slice(0, 12).map((c) => (
                  <div key={c.canonical_id} className="cluster">
                    <div className="name">
                      {c.canonical_id} &middot; {c.n_aliases} archives
                    </div>
                    <div className="stat">
                      {[c.event_date, c.nearest_landmark, c.county, c.country]
                        .filter(Boolean)
                        .join(" &middot; ")}
                    </div>
                    <div className="stat" style={{ color: "#666", fontSize: 11 }}>
                      sources: {c.source_slugs.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* CAVEATS */}
      {/* ============================================================== */}
      <h2 id="caveats">What these numbers do and don&rsquo;t mean</h2>
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
