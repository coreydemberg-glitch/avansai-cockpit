// Sourcing Hub row shapes (sourcing build) — local to the sourcing surfaces,
// same pattern as DocLibrary keeping DocItem private to the doc workflow.

export type SourcingClient = {
  id: string;
  name: string;
  brain_buzz: boolean;
  memory_instructions: string | null;
  archived: boolean;
  created_at: string | null;
};

export type SourcingMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string | null;
};

export type BooleanRow = {
  id: string;
  boolean_string: string;
  created_at: string | null;
};
