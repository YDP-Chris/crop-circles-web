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
  county: string | null;
  nearest_landmark: string | null;
  crop_type: string | null;
  location_precision_m: number | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  formation_aliases: FormationAlias[];
  formation_images: FormationImage[];
};

export type FormationAlias = {
  source_id: string;
  source_url: string | null;
  is_primary: boolean;
};

export type FormationImage = {
  source_url: string;
  photographer: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
};
