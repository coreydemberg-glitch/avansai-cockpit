// Shape of a row in the Supabase `candidates` table. Extra columns are tolerated
// (we select *), but these are the ones the cockpit reads.
export type Candidate = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  linkedin_url: string | null;
  resume: string | null;
  trello_card_id: string | null;
  notes: string | null;
  status: string | null;
};
