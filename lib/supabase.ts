import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  db: { schema: "crop_circles" },
});

export type Formation = {
  id: string;
  canonical_id: string | null;
  event_date: string | null;
  country: string | null;
  nearest_landmark: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  formation_images: FormationImage[];
};

export type FormationImage = {
  source_url: string;
  photographer: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
};
