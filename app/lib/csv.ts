// Dependency-free CSV parsing for the contacts upload pipeline. The codebase has
// no CSV library and only needs to read recruiter exports (LinkedIn Recruiter /
// generic spreadsheets), so we hand-roll an RFC-4180-ish parser rather than add a
// dependency. Handles quoted fields, escaped quotes (""), embedded commas and
// newlines, and CRLF/LF line endings.

export type CsvRow = Record<string, string>;

// Parse raw CSV text into { headers, rows }. Rows are keyed by header name.
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  // Strip a UTF-8 BOM if present (Excel exports love these).
  const input = text.replace(/^﻿/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false; // closing quote
        }
      } else if (ch === '\r' && input[i + 1] === '\n') {
        // Normalize an embedded CRLF inside a quoted multi-line cell to LF — drop
        // the \r here; the \n is appended on the next iteration.
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (ch === '\r') {
      // swallow — the \n (or end of input) closes the record
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/record if the file didn't end with a newline.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    // Skip fully empty lines.
    if (cells.length === 1 && cells[0].trim() === '') continue;
    const row: CsvRow = {};
    headers.forEach((h, c) => {
      row[h] = (cells[c] ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

// Maps a raw CSV row to our contact fields by matching header names
// case-insensitively against common recruiter-export aliases. Returns the
// normalized field set plus the original row (stored as `raw` for re-parse).
export type MappedContact = {
  name: string | null;
  first_name: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  raw: CsvRow;
};

const ALIASES: Record<keyof Omit<MappedContact, 'raw' | 'name'>, string[]> = {
  first_name: ['first name', 'firstname', 'first', 'given name'],
  email: ['email', 'email address', 'e-mail', 'work email', 'primary email'],
  title: ['title', 'job title', 'position', 'headline', 'current title'],
  company: [
    'company',
    'current company',
    'organization',
    'organisation',
    'employer',
    'company name',
  ],
  linkedin_url: [
    'linkedin',
    'linkedin url',
    'linkedin profile',
    'profile url',
    'public profile url',
    'member url',
    'url',
  ],
};

const LAST_NAME_ALIASES = ['last name', 'lastname', 'last', 'surname', 'family name'];
const FULL_NAME_ALIASES = ['name', 'full name', 'contact', 'contact name'];

function pick(row: CsvRow, lowerKeys: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    const key = lowerKeys[a];
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return '';
}

export function mapContactRow(row: CsvRow): MappedContact {
  // Build a lookup from lowercased header → actual header once per row.
  const lowerKeys: Record<string, string> = {};
  for (const k of Object.keys(row)) lowerKeys[k.toLowerCase().trim()] = k;

  const first = pick(row, lowerKeys, ALIASES.first_name);
  const last = pick(row, lowerKeys, LAST_NAME_ALIASES);
  const full = pick(row, lowerKeys, FULL_NAME_ALIASES);

  const name = (full || [first, last].filter(Boolean).join(' ')).trim() || null;
  const first_name = (first || (name ? name.split(/\s+/)[0] : '')).trim() || null;

  return {
    name,
    first_name,
    email: pick(row, lowerKeys, ALIASES.email).toLowerCase() || null,
    title: pick(row, lowerKeys, ALIASES.title) || null,
    company: pick(row, lowerKeys, ALIASES.company) || null,
    linkedin_url: pick(row, lowerKeys, ALIASES.linkedin_url) || null,
    raw: row,
  };
}
