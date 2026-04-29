export const revalidate = 600;

type Encoding = {
  id: string;
  formation_id: string;
  encoding_type: string;
  decoded_text: string | null;
  decoder_name: string | null;
  decoder_method: string | null;
  decoder_confidence: number | null;
  community_acceptance: string | null;
  source_citation: string | null;
  notes: string | null;
  formations: {
    canonical_id: string | null;
    event_date: string | null;
    nearest_landmark: string | null;
    county: string | null;
    country: string | null;
  } | null;
};

const TYPE_LABELS: Record<string, string> = {
  binary_ascii: "Binary / ASCII",
  pi: "π (pi)",
  eulers_identity: "Euler's identity",
  arecibo_response: "Arecibo response",
  planetary_alignment: "Planetary alignment",
  fractal: "Fractal",
  sacred_geometry: "Sacred geometry",
  unknown: "Unknown",
  other: "Other",
};

const ACCEPTANCE_COLORS: Record<string, string> = {
  verified: "#6dd96a",
  plausible: "#a8c46a",
  contested: "#ffb454",
  fringe: "#a892ff",
  disputed: "#e07a5f",
};

async function loadEncodings(): Promise<Encoding[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const r = await fetch(
    `${url}/rest/v1/formation_encodings?select=*,formations(canonical_id,event_date,nearest_landmark,county,country)&order=decoder_confidence.desc.nullslast`,
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
  return (await r.json()) as Encoding[];
}

export default async function EncodingsPage() {
  const encodings = await loadEncodings();

  // Group by encoding_type for display
  const byType = new Map<string, Encoding[]>();
  for (const e of encodings) {
    const t = e.encoding_type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(e);
  }
  const typeOrder = [
    "fractal",
    "sacred_geometry",
    "arecibo_response",
    "eulers_identity",
    "pi",
    "binary_ascii",
    "planetary_alignment",
    "unknown",
    "other",
  ];

  return (
    <div className="findings">
      <h1>Decoded messages</h1>
      <p className="lead">
        Specific decoded-message claims about crop circles, extracted from
        archive prose by Claude Haiku. The community has long claimed
        formations encode mathematical and symbolic content; this page
        catalogs those claims as <em>claims</em>, not as confirmed truths.
      </p>

      {encodings.length === 0 ? (
        <p>No encoding claims yet.</p>
      ) : (
        <>
          <p className="small">
            {encodings.length} claims across {byType.size} categories. Sorted
            by extraction confidence (how confident our extractor is the
            claim is genuinely in the source text, not the truth of the
            claim itself).
          </p>

          {typeOrder.map((t) => {
            const list = byType.get(t);
            if (!list || list.length === 0) return null;
            return (
              <section key={t}>
                <h2>
                  {TYPE_LABELS[t] ?? t}{" "}
                  <span style={{ color: "#666", fontWeight: 400, fontSize: 14 }}>
                    ({list.length})
                  </span>
                </h2>
                <div className="encoding-list">
                  {list.map((e) => (
                    <article key={e.id} className="encoding-card">
                      <header className="encoding-header">
                        <span className="encoding-canonical">
                          {e.formations?.canonical_id ?? "(unknown formation)"}
                        </span>
                        {e.formations?.event_date && (
                          <span className="encoding-date">
                            {e.formations.event_date}
                          </span>
                        )}
                        {(e.formations?.nearest_landmark ||
                          e.formations?.county) && (
                          <span className="encoding-loc">
                            {[
                              e.formations.nearest_landmark,
                              e.formations.county,
                              e.formations.country,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )}
                        {e.community_acceptance && (
                          <span
                            className="encoding-acceptance"
                            style={{
                              color: ACCEPTANCE_COLORS[e.community_acceptance] ?? "#888",
                            }}
                          >
                            {e.community_acceptance}
                          </span>
                        )}
                      </header>
                      {e.decoded_text && (
                        <p className="encoding-decoded">{e.decoded_text}</p>
                      )}
                      <div className="encoding-meta">
                        {e.decoder_name && (
                          <span>decoded by: {e.decoder_name}</span>
                        )}
                        {e.decoder_method && (
                          <span>method: {e.decoder_method}</span>
                        )}
                        {e.decoder_confidence !== null && (
                          <span>
                            extraction confidence: {e.decoder_confidence.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {e.notes && <p className="encoding-notes">{e.notes}</p>}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      <h2>Caveats</h2>
      <p className="small">
        These are <em>claims</em>, not verified facts. The
        &ldquo;extraction confidence&rdquo; score reflects only how confident
        the extractor is that the claim was made in the source text — not
        whether the decoding is mathematically valid, accepted by the
        academic community, or distinguishable from cherry-picking. The{" "}
        <em>community acceptance</em> field is what the source says about
        how the claim has been received. Every entry should be read as
        &ldquo;the source asserted X,&rdquo; not &ldquo;X is true.&rdquo;
      </p>
    </div>
  );
}
