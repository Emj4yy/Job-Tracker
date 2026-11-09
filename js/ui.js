// UI: views, summary tiles, the job table/cards, filter chips, the forms, the toast, backup download and the theme.
// All user data is written with textContent or setAttribute, never innerHTML.
import { STATUSES, WORK_SETUPS } from './jobs.js';

const THEME_KEY = 'job-tracker-theme';
const STALE_AFTER_DAYS = 30; // "Wait for Reply" jobs older than this get a "Ghosted?" hint
const BACKUP_REMINDER_DAYS = 14; // show the backup reminder after this many days without one
const REMIND_FIRST_BACKUP_AT = 3; // ...or once there are this many jobs and no backup yet
const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map((status) => [status.value, status]));
const SETUP_BY_VALUE = Object.fromEntries(WORK_SETUPS.map((setup) => [setup.value, setup]));

const $ = (id) => document.getElementById(id);

const views = { boot: $('boot-view'), app: $('app-view') };
const appFooter = $('app-footer');
const themeToggle = $('theme-toggle');
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const addJobBtn = $('add-job-btn');
const jobCount = $('job-count');
const stats = $('stats');
const backupReminder = $('backup-reminder');
const backupNote = $('backup-note');
const toast = $('toast');

const jobsArea = $('jobs-area');
const jobsError = $('jobs-error');
const jobsErrorText = $('jobs-error-text');
const jobsEmpty = $('jobs-empty');
const jobsNoResults = $('jobs-no-results');
const jobList = $('job-list');
const jobTbody = $('job-tbody');

const searchInput = $('search-input');
const statusChips = $('status-chips');
const filterInfo = $('filter-info');
const filterCount = $('filter-count');
const clearFiltersBtn = $('clear-filters-btn');

const jobDialog = $('job-dialog');
const jobForm = $('job-form');
const jobDialogTitle = $('job-dialog-title');
const jobFormMessage = $('job-form-message');
const jobStatusHint = $('job-status-hint');
const jobSubmit = $('job-submit');
const jobDeleteBtn = $('job-delete-btn');
const jobMore = $('job-more');

const deleteDialog = $('delete-dialog');
const deleteJobName = $('delete-job-name');
const deleteMessage = $('delete-message');
const deleteConfirmBtn = $('delete-confirm-btn');

// Form inputs, keyed by job field name
const formFields = {
  company: $('job-company'),
  role: $('job-role'),
  date_applied: $('job-date'),
  status: $('job-status'),
  work_setup: $('job-setup'),
  location: $('job-location'),
  salary_range: $('job-salary'),
  job_link: $('job-link'),
  notes: $('job-notes'),
};

// Fields inside "More details"; the section opens automatically when editing a job that has any
const OPTIONAL_FIELDS = ['work_setup', 'location', 'salary_range', 'job_link', 'notes'];

// Fields that can show a validation error
const fieldErrors = {
  company: $('job-company-error'),
  role: $('job-role-error'),
  job_link: $('job-link-error'),
};

let activeStatus = 'all'; // status chip that is selected
let toastTimer = null;

/* =============================================================
   Small helpers
   ============================================================= */

/** Creates an element with an optional class and text (set safely via textContent). */
function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

/** "Company – Role", used in labels and the delete dialog. */
function jobTitle(job) {
  return `${job.company} – ${job.role}`;
}

/** Turns 'YYYY-MM-DD' into a local Date (no time zone shift). */
function parseIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Formats a 'YYYY-MM-DD' date for display, e.g. "Oct 3, 2026". */
function formatDate(isoDate) {
  return parseIsoDate(isoDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Whole days between a 'YYYY-MM-DD' date and today, or null if there is no date. */
function daysSince(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today - parseIsoDate(isoDate)) / 86400000);
}

/** "today", "yesterday", "12 days ago", or '' for a missing or future date. */
function formatDaysAgo(days) {
  if (days === null || days < 0) return '';
  if (days === 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Today's date as 'YYYY-MM-DD' in the user's local time zone. */
function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Returns the URL if it is a valid http(s) link, otherwise null (blocks javascript: links). */
function toSafeUrl(value) {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

/** "1 application" / "3 applications". */
export function pluralApps(count) {
  return `${count} application${count === 1 ? '' : 's'}`;
}

/* =============================================================
   Views, messages and backup info
   ============================================================= */

/** Shows one view ('boot' or 'app') and hides the others. */
export function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  appFooter.hidden = name !== 'app';
}

/** Shows text in a message element. Empty text hides it. */
function setMessage(el, text) {
  el.textContent = text || '';
}

/** Pops up a short message at the bottom of the screen. variant: 'success' | 'info' | 'error'. */
export function showToast(text, variant = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.dataset.variant = variant;
  toast.classList.add('toast-show');
  toastTimer = setTimeout(() => toast.classList.remove('toast-show'), variant === 'error' ? 8000 : 4000);
}

/** Shows that storage couldn't be read, with a "Try again" button. */
export function showListError(message) {
  jobsErrorText.textContent = message;
  jobsError.hidden = false;
  jobsEmpty.hidden = true;
  jobsArea.hidden = true;
}

/** Updates the footer note and shows the top reminder only when a backup is overdue. */
export function renderBackupInfo(jobCountValue, lastBackup) {
  const days = lastBackup ? Math.floor((Date.now() - lastBackup.getTime()) / 86400000) : null;
  const lastText = days === null ? '' : ` Last backup: ${formatDaysAgo(days)}.`;
  backupNote.textContent = `🔒 Your list is saved only on this device.${lastText}`;

  backupReminder.hidden = !(
    (days === null && jobCountValue >= REMIND_FIRST_BACKUP_AT) ||
    (days !== null && jobCountValue > 0 && days >= BACKUP_REMINDER_DAYS)
  );
}

/* =============================================================
   Dashboard summary
   ============================================================= */

/** " · Searching for 30 days", counted from the earliest date applied, or '' if there's none. */
function searchingText(jobs) {
  const dates = jobs.map((job) => job.date_applied).filter(Boolean).sort();
  const days = dates.length > 0 ? daysSince(dates[0]) : null;
  if (days === null || days < 1) return '';
  return ` · Searching for ${days === 1 ? '1 day' : `${days} days`}`;
}

/** Four small tiles: total, applied this month, interviewing and offers accepted. */
function renderStats(jobs) {
  const monthPrefix = todayIso().slice(0, 7); // 'YYYY-MM'
  const count = (test) => jobs.filter(test).length;
  // [label, value, status whose color the tile uses]
  const tiles = [
    ['Total', jobs.length, null],
    ['This month', count((job) => job.date_applied?.startsWith(monthPrefix)), 'waiting'],
    ['Interviewing', count((job) => job.status === 'interviewing'), 'interviewing'],
    ['Offers', count((job) => job.status === 'accepted'), 'accepted'],
  ];
  stats.replaceChildren(
    ...tiles.map(([label, value, status]) => {
      const tile = createEl('li', 'stat');
      if (status) tile.dataset.status = status;
      tile.append(createEl('span', 'stat-value', String(value)), createEl('span', 'stat-label', label));
      return tile;
    }),
  );
}

/* =============================================================
   Field validation messages
   ============================================================= */

/** Marks an input as invalid and shows its error text. */
function showFieldError(input, errorEl, message) {
  input.setAttribute('aria-invalid', 'true');
  errorEl.textContent = message;
  errorEl.hidden = false;
}

/** Clears the invalid state and error text of an input. */
function clearFieldError(input, errorEl) {
  input.removeAttribute('aria-invalid');
  errorEl.textContent = '';
  errorEl.hidden = true;
}

/* =============================================================
   Dropdown options
   ============================================================= */

/** Fills the status and work setup dropdowns in the form. */
export function initSelectOptions() {
  WORK_SETUPS.forEach(({ value, label }) => formFields.work_setup.append(new Option(label, value)));
  // New jobs start as "Wait for Reply" (form.reset() returns to this option)
  STATUSES.forEach(({ value, label }) => formFields.status.append(new Option(label, value, value === 'waiting')));
}

/* =============================================================
   Search and status chips
   ============================================================= */

/** Picks a status chip. Picking the selected one again shows all. */
export function toggleStatusFilter(value) {
  activeStatus = activeStatus === value ? 'all' : value;
}

/** Calls the callback whenever the search text changes or "Show all" is clicked. */
export function onFiltersChange(callback) {
  searchInput.addEventListener('input', callback);
  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    activeStatus = 'all';
    callback();
  });
}

/**
 * Renders "All" plus a chip for each status that has jobs (and the selected one, even if empty).
 * Each chip is a toggle button marked with aria-pressed.
 */
function renderChips(jobs, onSelect) {
  const counts = {};
  jobs.forEach((job) => {
    counts[job.status] = (counts[job.status] || 0) + 1;
  });

  // Remember which chip had keyboard focus so it keeps focus after re-rendering
  const focusedValue = statusChips.contains(document.activeElement) ? document.activeElement.dataset.value : null;

  const items = [{ value: 'all', label: 'All', count: jobs.length }].concat(
    STATUSES.filter(({ value }) => counts[value] || value === activeStatus).map(({ value, label }) => ({
      value,
      label,
      count: counts[value] || 0,
    })),
  );

  statusChips.replaceChildren(
    ...items.map(({ value, label, count }) => {
      const chip = createEl('button', 'chip');
      chip.type = 'button';
      chip.dataset.value = value;
      if (value !== 'all') chip.dataset.status = value;
      chip.setAttribute('aria-pressed', String(activeStatus === value));
      chip.append(createEl('span', null, label), createEl('span', 'chip-count', String(count)));
      chip.addEventListener('click', () => onSelect(value));

      const item = createEl('li');
      item.append(chip);
      return item;
    }),
  );

  if (focusedValue) statusChips.querySelector(`[data-value="${focusedValue}"]`)?.focus();
}

/** Newest date applied first; jobs without a date go last. */
function compareByDateApplied(a, b) {
  if (a.date_applied === b.date_applied) return String(b.created_at).localeCompare(String(a.created_at));
  if (!a.date_applied) return 1;
  if (!b.date_applied) return -1;
  return b.date_applied.localeCompare(a.date_applied);
}

/* =============================================================
   Job list
   ============================================================= */

/** Status dropdown styled as a colored pill with a dot, so the status can be changed in one tap. */
function createStatusPill(job, onStatusChange) {
  const pill = createEl('span', 'status-pill');
  pill.dataset.status = job.status;

  const select = createEl('select', 'status-select');
  select.dataset.jobId = job.id;
  select.setAttribute('aria-label', `Status for ${jobTitle(job)}`);
  STATUSES.forEach(({ value, label }) => {
    select.append(new Option(label, value, false, value === job.status));
  });
  select.addEventListener('change', () => onStatusChange(job, select.value));

  pill.append(select);
  return pill;
}

/** Solid colored block for the work setup ("Hybrid"), or null when not set. */
function createSetupBlock(job) {
  const setup = SETUP_BY_VALUE[job.work_setup];
  if (!setup) return null;
  const block = createEl('span', 'setup-block', setup.label);
  block.dataset.setup = setup.value;
  return block;
}

/** "Makati · ₱30k", or null when neither is set. */
function createDetailsLine(job) {
  const parts = [job.location, job.salary_range].filter(Boolean);
  return parts.length > 0 ? createEl('p', 'job-details', parts.join(' · ')) : null;
}

/** "Applied Sep 20, 2026 · 50 days ago" plus a "Ghosted?" hint for long waits. */
function createDateLine(job) {
  const line = createEl('p', 'job-date');
  const days = daysSince(job.date_applied);
  line.textContent = job.date_applied
    ? `Applied ${formatDate(job.date_applied)}${days > 0 ? ` · ${formatDaysAgo(days)}` : ''}`
    : 'No date applied';

  if (job.status === 'waiting' && days !== null && days >= STALE_AFTER_DAYS) {
    line.append(' ', createEl('span', 'stale-hint', '· No reply yet. Ghosted?'));
  }
  return line;
}

/** "Job post ↗" link that opens in a new tab, or null if the job has no safe link. */
function createJobLink(job) {
  const url = toSafeUrl(job.job_link);
  if (!url) return null;
  const link = createEl('a', 'job-link', 'Job post ↗');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(createEl('span', 'visually-hidden', ` for ${jobTitle(job)} (opens in a new tab)`));
  return link;
}

/** The company name as a button, stretched with CSS so the whole card or row opens the edit form. */
function createOpenButton(job, handlers) {
  const open = createEl('button', 'job-open', job.company);
  open.type = 'button';
  open.setAttribute('aria-label', `Edit ${jobTitle(job)}`);
  open.addEventListener('click', () => handlers.onEdit(job));
  return open;
}

/** One table cell; shows a faint dash when there is nothing to show. */
function createCell(className, ...content) {
  const td = createEl('td', className);
  const nodes = content.filter(Boolean);
  if (nodes.length > 0) td.append(...nodes);
  else td.append(createEl('span', 'empty-cell', '—'));
  return td;
}

/** One table row (laptops and desktops). */
function createTableRow(job, handlers) {
  const days = daysSince(job.date_applied);
  const isStale = job.status === 'waiting' && days !== null && days >= STALE_AFTER_DAYS;
  const dateNodes = job.date_applied
    ? [
        createEl('div', null, formatDate(job.date_applied)),
        days > 0 && createEl('div', 'cell-sub', formatDaysAgo(days)),
        isStale && createEl('div', 'cell-sub stale-hint', 'No reply yet. Ghosted?'),
      ]
    : [];
  const link = createJobLink(job);
  if (link) link.firstChild.textContent = 'Open ↗';

  const row = createEl('tr');
  row.append(
    createCell('cell-company', createOpenButton(job, handlers)),
    createCell('cell-role', job.role),
    createCell(null, createStatusPill(job, handlers.onStatusChange)),
    createCell(null, createSetupBlock(job)),
    createCell(null, job.location),
    createCell('cell-salary', job.salary_range),
    createCell('cell-date', ...dateNodes),
    createCell('cell-link', link),
  );
  return row;
}

/** One card (phones and tablets). The whole card opens the edit form; the status pill changes status. */
function createJobItem(job, handlers) {
  const item = createEl('li', 'job');
  item.dataset.status = job.status;
  const open = createOpenButton(job, handlers);

  const main = createEl('div', 'job-main');
  const title = createEl('h3', 'job-company');
  title.append(open);
  main.append(title, createEl('p', 'job-role', job.role));
  const details = createDetailsLine(job);
  if (details) main.append(details);
  main.append(createDateLine(job));

  const side = createEl('div', 'job-side');
  side.append(createStatusPill(job, handlers.onStatusChange));
  const setup = createSetupBlock(job);
  if (setup) side.append(setup);
  const link = createJobLink(job);
  if (link) side.append(link);

  item.append(main, side);
  return item;
}

/**
 * Renders everything that depends on the job list: the welcome screen when there are none,
 * otherwise the count, chips and the filtered list.
 * handlers: { onEdit(job), onStatusChange(job, newStatus), onStatusFilter(status) }
 */
export function renderJobs(jobs, handlers) {
  const hasJobs = jobs.length > 0;
  jobsError.hidden = true;
  jobsEmpty.hidden = hasJobs;
  jobsArea.hidden = !hasJobs;
  addJobBtn.hidden = !hasJobs; // the welcome screen has its own big button
  stats.hidden = !hasJobs;
  jobCount.textContent = hasJobs ? `${pluralApps(jobs.length)}${searchingText(jobs)}` : '';
  if (!hasJobs) {
    activeStatus = 'all';
    return;
  }

  const search = searchInput.value.trim().toLowerCase();
  const visibleJobs = jobs
    .filter((job) => activeStatus === 'all' || job.status === activeStatus)
    .filter((job) => !search || job.company.toLowerCase().includes(search) || job.role.toLowerCase().includes(search))
    .sort(compareByDateApplied);

  renderStats(jobs);
  renderChips(jobs, handlers.onStatusFilter);
  const filtered = search !== '' || activeStatus !== 'all';
  filterInfo.hidden = !filtered;
  filterCount.textContent = `Showing ${visibleJobs.length} of ${jobs.length}.`;

  jobsNoResults.hidden = visibleJobs.length > 0;
  // Both layouts are rendered; CSS shows the one that fits the screen
  jobTbody.replaceChildren(...visibleJobs.map((job) => createTableRow(job, handlers)));
  jobList.replaceChildren(...visibleJobs.map((job) => createJobItem(job, handlers)));
}

/** Puts keyboard focus back on a job's status pill after the list re-renders. */
export function focusStatusSelect(jobId) {
  const selects = document.querySelectorAll(`.status-select[data-job-id="${jobId}"]`);
  Array.from(selects).find((select) => select.offsetParent !== null)?.focus();
}

/* =============================================================
   Add / edit form
   ============================================================= */

/** Shows what the selected status means under the status dropdown. */
function updateStatusHint() {
  jobStatusHint.textContent = STATUS_BY_VALUE[formFields.status.value]?.description ?? '';
}

/** Opens the form empty (add) or filled with a job's values (edit). */
export function openJobForm(job = null) {
  jobForm.reset();
  Object.entries(fieldErrors).forEach(([key, errorEl]) => clearFieldError(formFields[key], errorEl));
  setMessage(jobFormMessage, '');

  jobDialogTitle.textContent = job ? 'Edit job' : 'Add job';
  jobSubmit.textContent = job ? 'Save' : 'Add job';
  jobDeleteBtn.hidden = !job;

  if (job) {
    Object.entries(formFields).forEach(([key, input]) => {
      input.value = job[key] ?? '';
    });
  } else {
    formFields.date_applied.value = todayIso();
  }
  jobMore.open = Boolean(job && OPTIONAL_FIELDS.some((key) => job[key]));
  updateStatusHint();

  jobDialog.showModal();
  if (!job) formFields.company.focus();
}

/** Closes the add/edit form. */
export function closeJobForm() {
  jobDialog.close();
}

/** Reads the form into a job object. Empty fields become null. */
export function readJobForm() {
  const values = {};
  Object.entries(formFields).forEach(([key, input]) => {
    const value = input.value.trim();
    values[key] = value === '' ? null : value;
  });
  return values;
}

/** Shows an error next to each invalid field and focuses the first one. Returns true if valid. */
export function validateJobForm(values) {
  const errors = {};
  if (!values.company) errors.company = 'Please enter the company name.';
  if (!values.role) errors.role = 'Please enter the role or job title.';
  if (values.job_link && !toSafeUrl(values.job_link)) {
    errors.job_link = 'Paste the full link, starting with https://';
  }

  Object.entries(fieldErrors).forEach(([key, errorEl]) => {
    if (errors[key]) showFieldError(formFields[key], errorEl, errors[key]);
    else clearFieldError(formFields[key], errorEl);
  });

  const firstInvalid = Object.keys(fieldErrors).find((key) => errors[key]);
  if (firstInvalid === 'job_link') jobMore.open = true; // the link field lives in "More details"
  if (firstInvalid) formFields[firstInvalid].focus();
  return !firstInvalid;
}

/** Shows an error at the top of the form (e.g. storage is full). */
export function setJobFormMessage(text) {
  setMessage(jobFormMessage, text);
}

/** Calls onSubmit when the form is saved and onDelete when "Delete" is clicked in it. */
export function onJobForm({ onSubmit, onDelete }) {
  jobForm.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit();
  });
  jobDeleteBtn.addEventListener('click', onDelete);
}

/* =============================================================
   Delete confirmation
   ============================================================= */

/** Opens the delete confirmation. Focus starts on Cancel, the safe choice. */
export function openDeleteDialog(job) {
  deleteJobName.textContent = jobTitle(job);
  setMessage(deleteMessage, '');
  deleteDialog.showModal();
  deleteDialog.querySelector('[data-close]').focus();
}

/** Closes the delete confirmation. */
export function closeDeleteDialog() {
  deleteDialog.close();
}

/** Shows an error inside the delete dialog. */
export function setDeleteMessage(text) {
  setMessage(deleteMessage, text);
}

/** Calls the handler when the user confirms the delete. */
export function onDeleteConfirm(handler) {
  deleteConfirmBtn.addEventListener('click', handler);
}

/* =============================================================
   Dialog basics
   ============================================================= */

/** Wires up [data-close] buttons, live field-error clearing, and the status hint. */
export function initDialogs() {
  document.querySelectorAll('dialog [data-close]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });
  Object.entries(fieldErrors).forEach(([key, errorEl]) => {
    formFields[key].addEventListener('input', () => clearFieldError(formFields[key], errorEl));
  });
  formFields.status.addEventListener('change', updateStatusHint);
}

/* =============================================================
   Backup download (CSV)
   ============================================================= */

const CSV_COLUMNS = [
  ['company', 'Company'],
  ['role', 'Role'],
  ['status', 'Status'],
  ['work_setup', 'Work setup'],
  ['date_applied', 'Date applied'],
  ['location', 'Location'],
  ['salary_range', 'Salary range'],
  ['job_link', 'Job link'],
  ['notes', 'Notes'],
  ['created_at', 'Created at'],
  ['updated_at', 'Updated at'],
];

/**
 * Quotes one CSV cell. Values starting with = + - @ are prefixed with ' so spreadsheet apps
 * treat them as text instead of formulas (CSV injection protection).
 */
function toCsvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Value for one CSV column, using readable labels for status and work setup. */
function csvValue(job, key) {
  if (key === 'status') return STATUS_BY_VALUE[job.status]?.label ?? job.status;
  if (key === 'work_setup') return SETUP_BY_VALUE[job.work_setup]?.label ?? '';
  return job[key];
}

/** Downloads all jobs as a CSV file that also opens in Excel and Google Sheets. */
export function exportJobsToCsv(jobs) {
  const header = CSV_COLUMNS.map(([, label]) => toCsvCell(label)).join(',');
  const rows = jobs.map((job) => CSV_COLUMNS.map(([key]) => toCsvCell(csvValue(job, key))).join(','));
  // The BOM (﻿) makes Excel read the file as UTF-8 (keeps characters like ₱ and ñ intact).
  const csv = `﻿${[header, ...rows].join('\r\n')}`;

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = createEl('a');
  link.href = url;
  link.download = `job-tracker-backup-${todayIso()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* =============================================================
   Theme
   ============================================================= */

/** Returns 'light' or 'dark' if the user picked one, otherwise null. */
function getSavedTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}

/** Applies a theme and updates the toggle button's accessible label. */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

/** Sets the initial theme, follows system changes, and wires up the toggle button. */
export function initTheme() {
  applyTheme(getSavedTheme() || (systemDarkQuery.matches ? 'dark' : 'light'));

  systemDarkQuery.addEventListener('change', (event) => {
    if (!getSavedTheme()) applyTheme(event.matches ? 'dark' : 'light');
  });

  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked (e.g. private mode): the theme still changes for this visit.
    }
    applyTheme(next);
  });
}
