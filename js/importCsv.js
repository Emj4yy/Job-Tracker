// Backup restore: turns a CSV made by "Download backup" (or edited in Excel / Google Sheets) back into jobs.
import { STATUSES, WORK_SETUPS } from './jobs.js';

// Header label (lowercased) -> job field. Matches the columns written by exportJobsToCsv in ui.js,
// plus the raw field names in case someone builds the sheet by hand.
const HEADER_TO_FIELD = {
  company: 'company',
  role: 'role',
  status: 'status',
  'work setup': 'work_setup',
  work_setup: 'work_setup',
  'date applied': 'date_applied',
  date_applied: 'date_applied',
  location: 'location',
  'salary range': 'salary_range',
  salary_range: 'salary_range',
  'job link': 'job_link',
  job_link: 'job_link',
  notes: 'notes',
  'created at': 'created_at',
  created_at: 'created_at',
  'updated at': 'updated_at',
  updated_at: 'updated_at',
};

// Same limits as the form (maxlength) so imported rows look like ones typed in.
const MAX_LENGTHS = { company: 200, role: 200, location: 200, salary_range: 100, job_link: 2048, notes: 5000 };

/** Splits CSV text into rows of cells. Handles quotes, escaped quotes ("") and newlines in cells. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

/** Undoes the ' prefix that the export adds to cells starting with = + - @ (formula protection). */
function cleanCell(value) {
  const text = value.trim();
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

/** Finds a status or work setup by its value or label, ignoring case. */
function matchOption(options, text) {
  const lower = text.toLowerCase();
  return options.find((option) => option.value === lower || option.label.toLowerCase() === lower)?.value ?? null;
}

/** Turns a date cell into YYYY-MM-DD. Accepts 2026-11-09 and the formats Excel tends to save. */
function toIsoDate(text) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Turns a timestamp cell into an ISO timestamp, or null if it can't be read. */
function toIsoTimestamp(text) {
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Builds one job from a row, or returns null when company or role is missing. */
function rowToJob(cells, fieldByColumn) {
  const raw = {};
  fieldByColumn.forEach((field, column) => {
    if (field) raw[field] = cleanCell(cells[column] ?? '');
  });
  if (!raw.company || !raw.role) return null;

  const job = {};
  Object.entries(MAX_LENGTHS).forEach(([field, max]) => {
    job[field] = raw[field] ? raw[field].slice(0, max) : null;
  });
  if (job.job_link && !/^https?:\/\//i.test(job.job_link)) job.job_link = null;

  job.status = (raw.status && matchOption(STATUSES, raw.status)) || 'waiting';
  job.work_setup = raw.work_setup ? matchOption(WORK_SETUPS, raw.work_setup) : null;
  job.date_applied = raw.date_applied ? toIsoDate(raw.date_applied) : null;
  job.created_at = raw.created_at ? toIsoTimestamp(raw.created_at) : null;
  job.updated_at = raw.updated_at ? toIsoTimestamp(raw.updated_at) : null;
  return job;
}

/**
 * Reads CSV text into jobs. Returns { jobs, skipped } where skipped counts rows without a
 * company or role. Throws an Error with a friendly message if the file isn't a job list.
 */
export function parseJobsCsv(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) throw new Error('That file is empty.');

  const [header, ...dataRows] = rows;
  const fieldByColumn = header.map((label) => HEADER_TO_FIELD[label.trim().toLowerCase()] ?? null);
  if (!fieldByColumn.includes('company') || !fieldByColumn.includes('role')) {
    throw new Error('That doesn\'t look like a Job Tracker backup. Choose a file made with "Download backup".');
  }

  const jobs = [];
  let skipped = 0;
  dataRows.forEach((cells) => {
    const job = rowToJob(cells, fieldByColumn);
    if (job) jobs.push(job);
    else skipped += 1;
  });
  return { jobs, skipped };
}
