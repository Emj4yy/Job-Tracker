// Data layer: create, read, update and delete jobs in this browser's localStorage.
// Nothing is sent to a server, so there is no login: each device/browser keeps its own list.
// Every function returns { data, error } and never throws.

export const STATUSES = [
  { value: 'wishlist', label: 'Wishlist', description: "Saved for later. You haven't applied yet." },
  { value: 'waiting', label: 'Wait for Reply', description: 'Application sent, waiting to hear back.' },
  { value: 'interviewing', label: 'Interviewing', description: 'In interviews, exams or assessments.' },
  { value: 'accepted', label: 'Accepted', description: 'You got the job offer and accepted it.' },
  { value: 'rejected', label: 'Rejected', description: 'The company declined your application.' },
  { value: 'withdrawn', label: 'Rejected Myself', description: 'You withdrew or turned down the offer.' },
  { value: 'ghosted', label: 'Ghosted', description: 'No reply for a long time.' },
];

export const WORK_SETUPS = [
  { value: 'onsite', label: 'On-site', icon: '🏢' },
  { value: 'hybrid', label: 'Hybrid', icon: '🔀' },
  { value: 'remote', label: 'Remote', icon: '🏠' },
];

const STORAGE_KEY = 'job-tracker-jobs';
const LAST_BACKUP_KEY = 'job-tracker-last-backup';

/** Reads all saved jobs. Throws if storage is blocked. */
function readAll() {
  const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

/** Saves all jobs. Throws if storage is blocked or full. */
function writeAll(jobs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

/** Runs a storage action and returns { data, error } with a friendly error message. */
function run(action, fn) {
  try {
    return { data: fn(), error: null };
  } catch (error) {
    let message = `Couldn't ${action}. This browser may be blocking storage (for example in private mode).`;
    if (error?.name === 'QuotaExceededError') {
      message = 'This device is out of storage space. Download a backup, then delete some old applications.';
    } else if (error?.message === 'not-found') {
      message = 'This application no longer exists. Refresh the page and try again.';
    }
    return { data: null, error: { message } };
  }
}

/** Asks the browser not to auto-clear this site's storage when space runs low. */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}

/** Loads all jobs, newest first. */
export function listJobs() {
  return run('load your applications', () =>
    readAll().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
  );
}

/** Creates a job and returns it. */
export function createJob(fields) {
  return run('add the job', () => {
    const now = new Date().toISOString();
    const job = { ...fields, id: crypto.randomUUID(), created_at: now, updated_at: now };
    writeAll([job, ...readAll()]);
    return job;
  });
}

/** Updates some or all fields of a job and returns the updated job. */
export function updateJob(id, fields) {
  return run('save your changes', () => {
    const jobs = readAll();
    const index = jobs.findIndex((job) => job.id === id);
    if (index === -1) throw new Error('not-found');
    jobs[index] = { ...jobs[index], ...fields, id, updated_at: new Date().toISOString() };
    writeAll(jobs);
    return jobs[index];
  });
}

/** Deletes a job. */
export function deleteJob(id) {
  return run('delete the job', () => {
    writeAll(readAll().filter((job) => job.id !== id));
    return null;
  });
}

/**
 * Same company, role and date applied = the same application. (created_at is left out because
 * Excel often rewrites timestamps when a CSV is opened and saved.)
 */
function duplicateKey(job) {
  return [job.company, job.role, job.date_applied]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('|');
}

/** Adds jobs from a backup, skipping ones already saved. Returns { data: { added, duplicates } }. */
export function importJobs(importedJobs) {
  return run('restore the backup', () => {
    const existing = readAll();
    const seen = new Set(existing.map(duplicateKey));
    const now = new Date().toISOString();
    const added = [];

    importedJobs.forEach((fields) => {
      const key = duplicateKey(fields);
      if (seen.has(key)) return;
      seen.add(key);
      added.push({
        ...fields,
        id: crypto.randomUUID(),
        created_at: fields.created_at || now,
        updated_at: fields.updated_at || fields.created_at || now,
      });
    });

    if (added.length > 0) writeAll([...added, ...existing]);
    return { added: added.length, duplicates: importedJobs.length - added.length };
  });
}

/** Records that a backup was downloaded just now. */
export function markBackedUp() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    // Storage blocked: the backup reminder just keeps showing.
  }
}

/** When a backup was last downloaded, as a Date, or null if never. */
export function getLastBackup() {
  try {
    const date = new Date(localStorage.getItem(LAST_BACKUP_KEY));
    return Number.isNaN(date.getTime()) || date.getTime() === 0 ? null : date;
  } catch {
    return null;
  }
}

/** Calls back when another tab or window on this device changes the saved jobs. */
export function onJobsChangedElsewhere(callback) {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) callback();
  });
}
