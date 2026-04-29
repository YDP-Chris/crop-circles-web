export const revalidate = 600;

type Candidate = {
  id: string;
  source_kind: string;
  source_url: string;
  source_title: string | null;
  mentioned_date: string | null;
  mentioned_year: number | null;
  mentioned_location: string | null;
  country: string | null;
  raw_text: string | null;
  confidence: number | null;
  is_in_corpus: boolean;
  matched_formation_id: string | null;
  status: string;
  discovered_at: string;
};

async function loadCandidates(): Promise<Candidate[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const r = await fetch(
    `${url}/rest/v1/candidate_formations?select=*&order=discovered_at.desc&limit=50`,
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
  return (await r.json()) as Candidate[];
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const dt = Date.now() - t;
  const h = dt / 3_600_000;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const KIND_LABEL: Record<string, string> = {
  news: "news",
  reddit: "reddit",
  twitter: "x",
  blog: "blog",
  rss: "rss",
  other: "other",
};

export default async function CandidatesPage() {
  const candidates = await loadCandidates();
  const fresh = candidates.filter((c) => !c.is_in_corpus);
  const matched = candidates.filter((c) => c.is_in_corpus);

  return (
    <div className="findings">
      <h1>Watch list</h1>
      <p className="lead">
        Live candidates surfaced by the news + Reddit watch agent. Anything
        not already in the corpus is a candidate for promotion. The agent
        runs daily during the active season.
      </p>

      {candidates.length === 0 ? (
        <>
          <p>
            No candidates surfaced yet. The watch agent is built but hasn&rsquo;t
            been enabled in cron. Once it runs daily, fresh news and Reddit
            posts about crop circles &mdash; cross-checked against the corpus
            &mdash; will appear here.
          </p>
          <p className="small">
            Sources scanned: Google News (English / German / French),{" "}
            r/cropcircles, r/UFOs, r/anomalies, r/HighStrangeness, plus a
            small set of UK local-paper RSS feeds. Each item is filtered by
            title, then passed to Claude Haiku for structured extraction
            (date, location, country, confidence). Corpus matching happens
            on event_date + country.
          </p>
        </>
      ) : (
        <>
          <h2>Unmatched ({fresh.length})</h2>
          {fresh.length === 0 ? (
            <p className="small">
              Nothing new this run &mdash; every candidate this week matched
              an existing formation in the corpus. Boring is good.
            </p>
          ) : (
            <div className="candidate-list">
              {fresh.map((c) => (
                <article key={c.id} className="candidate-card">
                  <div className="candidate-meta">
                    <span className="candidate-kind">
                      {KIND_LABEL[c.source_kind] ?? c.source_kind}
                    </span>
                    <span className="candidate-time">{fmtRelative(c.discovered_at)}</span>
                    {c.confidence !== null && (
                      <span
                        className="candidate-conf"
                        style={{
                          color:
                            c.confidence >= 0.7
                              ? "#6dd96a"
                              : c.confidence >= 0.4
                              ? "#ffb454"
                              : "#666",
                        }}
                      >
                        conf {c.confidence.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {c.source_title && (
                    <a
                      href={c.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="candidate-title"
                    >
                      {c.source_title}
                    </a>
                  )}
                  <div className="candidate-row">
                    {c.mentioned_date && (
                      <span>event {c.mentioned_date}</span>
                    )}
                    {c.mentioned_location && <span>· {c.mentioned_location}</span>}
                    {c.country && <span>· {c.country}</span>}
                  </div>
                  {c.raw_text && (
                    <p className="candidate-snippet">
                      {c.raw_text.length > 300 ? c.raw_text.slice(0, 300) + "..." : c.raw_text}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}

          {matched.length > 0 && (
            <>
              <h2>Already in corpus ({matched.length})</h2>
              <div className="candidate-list">
                {matched.slice(0, 10).map((c) => (
                  <article key={c.id} className="candidate-card matched">
                    <div className="candidate-meta">
                      <span className="candidate-kind">
                        {KIND_LABEL[c.source_kind] ?? c.source_kind}
                      </span>
                      <span className="candidate-time">{fmtRelative(c.discovered_at)}</span>
                      <span style={{ color: "#6dd96a", fontSize: 11 }}>
                        ✓ matched
                      </span>
                    </div>
                    {c.source_title && (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="candidate-title"
                      >
                        {c.source_title}
                      </a>
                    )}
                    <div className="candidate-row">
                      {c.mentioned_date && <span>event {c.mentioned_date}</span>}
                      {c.mentioned_location && <span>· {c.mentioned_location}</span>}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h2>How this works</h2>
      <p className="small">
        Watch agent at <code>/agents/crop-circles-watch/</code> on the Pi
        scans RSS + Reddit on a daily schedule. Every item with a credible
        date/location is extracted via Claude Haiku (cost ~$0.003 per
        candidate, capped at 30 per run) and matched against the corpus.
        High-confidence unmatched candidates trigger an ntfy alert. Promoted
        candidates eventually become full formations.
      </p>
    </div>
  );
}
