export const revalidate = 600;

type HistoricalRecord = {
  id: string;
  text_source: string;
  text_source_url: string | null;
  text_publication_year: number | null;
  event_year_min: number | null;
  event_year_max: number | null;
  country: string | null;
  location_text: string | null;
  excerpt: string;
  extracted_summary: string | null;
  confidence: number | null;
};

async function loadRecords(): Promise<HistoricalRecord[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const r = await fetch(
    `${url}/rest/v1/historical_records?select=*&order=event_year_min.asc.nullslast,confidence.desc`,
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
  return (await r.json()) as HistoricalRecord[];
}

function fmtYear(rec: HistoricalRecord): string {
  if (rec.event_year_min && rec.event_year_max && rec.event_year_min !== rec.event_year_max) {
    return `${rec.event_year_min}-${rec.event_year_max}`;
  }
  if (rec.event_year_min) return rec.event_year_min.toString();
  return "year unknown";
}

export default async function HistoricalPage() {
  const records = await loadRecords();
  const byCertainty = records.filter((r) => (r.confidence ?? 0) >= 0.5);
  const lowConfidence = records.filter((r) => (r.confidence ?? 0) < 0.5);

  return (
    <div className="findings">
      <h1>Pre-photographic records</h1>
      <p className="lead">
        Crop-circle-like events documented in books, pamphlets, and reports
        from the 17th-19th centuries. Extracted from public-domain texts by
        Claude, with confidence scoring for each candidate. Earliest first.
      </p>

      {records.length === 0 ? (
        <p>No records yet. The extraction script will populate this section.</p>
      ) : (
        <>
          <p className="small">
            {byCertainty.length} high-confidence records
            {lowConfidence.length > 0 && `, ${lowConfidence.length} marginal`}.
            Each excerpt is verbatim from the cited source.
          </p>

          <div className="historical-list">
            {byCertainty.map((r) => (
              <article key={r.id} className="historical-record">
                <header className="historical-header">
                  <span className="historical-year">{fmtYear(r)}</span>
                  <span className="historical-source">
                    {r.text_source_url ? (
                      <a href={r.text_source_url} target="_blank" rel="noreferrer">
                        {r.text_source}
                      </a>
                    ) : (
                      r.text_source
                    )}
                  </span>
                  {r.location_text && (
                    <span className="historical-loc">
                      {r.location_text}
                      {r.country ? ` · ${r.country}` : ""}
                    </span>
                  )}
                  {r.confidence !== null && (
                    <span
                      className="historical-conf"
                      style={{
                        color: r.confidence >= 0.7 ? "#6dd96a" : "#ffb454",
                      }}
                    >
                      conf {r.confidence.toFixed(2)}
                    </span>
                  )}
                </header>
                {r.extracted_summary && (
                  <p className="historical-summary">{r.extracted_summary}</p>
                )}
                <blockquote className="historical-excerpt">
                  &ldquo;{r.excerpt}&rdquo;
                </blockquote>
              </article>
            ))}
          </div>

          {lowConfidence.length > 0 && (
            <>
              <h2>Marginal / borderline</h2>
              <p className="small">
                Records the extractor flagged with confidence below 0.5
                &mdash; could be folk-dance fairy rings, mushroom rings, or
                allegorical references rather than genuine field circles.
              </p>
              <div className="historical-list">
                {lowConfidence.map((r) => (
                  <article key={r.id} className="historical-record marginal">
                    <header className="historical-header">
                      <span className="historical-year">{fmtYear(r)}</span>
                      <span className="historical-source">{r.text_source}</span>
                      {r.location_text && (
                        <span className="historical-loc">
                          {r.location_text}
                        </span>
                      )}
                      <span className="historical-conf" style={{ color: "#888" }}>
                        conf {(r.confidence ?? 0).toFixed(2)}
                      </span>
                    </header>
                    {r.extracted_summary && (
                      <p className="historical-summary">{r.extracted_summary}</p>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h2>Methodology</h2>
      <p className="small">
        Source texts were fetched from Project Gutenberg, Internet Archive,
        and Wikipedia transcriptions. Each chunk (~2000 chars) was passed to
        Claude Haiku 4.5 with a strict prompt asking whether the passage
        describes a discrete crop-circle-like event &mdash; geometric
        flattening of standing crop &mdash; vs. unrelated phenomena like
        windflattening, fairy mushroom rings, or generic agricultural
        accidents. Total extraction cost was under $0.10. Excerpts are kept
        verbatim. The summaries are Claude rephrasings, not source text.
      </p>
    </div>
  );
}
