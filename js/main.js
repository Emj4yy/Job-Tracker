// App startup and wiring: loads the saved jobs and connects the UI events to the jobs module.
// Jobs are saved in this browser only (see jobs.js), so there is no login.
import { parseJobsCsv } from './importCsv.js';
import {
  STATUSES,
  createJob,
  deleteJob,
  getLastBackup,
  importJobs,
  listJobs,
  markBackedUp,
  onJobsChangedElsewhere,
  requestPersistentStorage,
  updateJob,
} from './jobs.js';
import {
  closeDeleteDialog,
  closeJobForm,
  exportJobsToCsv,
  focusStatusSelect,
  initDialogs,
  initSelectOptions,
  initTheme,
  onDeleteConfirm,
  onFiltersChange,
  onJobForm,
  openDeleteDialog,
  openJobForm,
  pluralApps,
  readJobForm,
  renderBackupInfo,
  renderJobs,
  setDeleteMessage,
  setJobFormMessage,
  showListError,
  showToast,
  showView,
  toggleStatusFilter,
  validateJobForm,
} from './ui.js';

let jobs = []; // all saved jobs, newest first
let editingJobId = null; // id of the job in the edit form, or null when adding
let jobPendingDelete = null; // job shown in the delete confirmation

const listHandlers = {
  onEdit: handleEditClick,
  onStatusChange: handleStatusChange,
  onStatusFilter: (status) => {
    toggleStatusFilter(status);
    refreshList();
  },
};

/** Display label for a status value, e.g. 'withdrawn' -> 'Rejected Myself'. */
function statusLabel(value) {
  return STATUSES.find((status) => status.value === value)?.label ?? value;
}

/** Re-renders the list and the backup info from `jobs`. */
function refreshList() {
  renderJobs(jobs, listHandlers);
  renderBackupInfo(jobs.length, getLastBackup());
}

/** Reads the saved jobs and shows them (or an error if storage is blocked). */
function loadJobs() {
  const { data, error } = listJobs();
  if (error) {
    showListError(error.message);
    return;
  }
  jobs = data;
  refreshList();
}

/* =============================================================
   Add and edit
   ============================================================= */

function handleAddClick() {
  editingJobId = null;
  openJobForm();
}

function handleEditClick(job) {
  editingJobId = job.id;
  openJobForm(job);
}

/** Validates the form, then creates or updates the job. */
function handleJobSubmit() {
  const values = readJobForm();
  if (!validateJobForm(values)) return;

  const isEdit = editingJobId !== null;
  const { data, error } = isEdit ? updateJob(editingJobId, values) : createJob(values);
  if (error) {
    setJobFormMessage(error.message);
    return;
  }

  jobs = isEdit ? jobs.map((job) => (job.id === data.id ? data : job)) : [data, ...jobs];
  closeJobForm();
  refreshList();
  showToast(isEdit ? `Saved changes to ${data.company}.` : `Added ${data.company}.`);
}

/* =============================================================
   Quick status change
   ============================================================= */

/** Saves a new status picked from a job's status dropdown. */
function handleStatusChange(job, newStatus) {
  const { data, error } = updateJob(job.id, { status: newStatus });
  if (error) {
    refreshList(); // puts the dropdown back to the saved status
    showToast(error.message, 'error');
    return;
  }

  jobs = jobs.map((item) => (item.id === data.id ? data : item));
  refreshList();
  focusStatusSelect(data.id); // keep keyboard focus on the dropdown after re-rendering
  showToast(`${data.company} moved to ${statusLabel(data.status)}.`);
}

/* =============================================================
   Delete
   ============================================================= */

/** "Delete" in the edit form: swap the form for the confirmation. */
function handleDeleteClick() {
  jobPendingDelete = jobs.find((job) => job.id === editingJobId);
  if (!jobPendingDelete) return;
  closeJobForm();
  openDeleteDialog(jobPendingDelete);
}

/** Deletes the job after the user confirms. */
function handleDeleteConfirm() {
  if (!jobPendingDelete) return;
  const job = jobPendingDelete;

  const { error } = deleteJob(job.id);
  if (error) {
    setDeleteMessage(error.message);
    return;
  }

  jobs = jobs.filter((item) => item.id !== job.id);
  jobPendingDelete = null;
  closeDeleteDialog();
  refreshList();
  showToast(`Deleted ${job.company}.`);
}

/* =============================================================
   Backup and restore
   ============================================================= */

function handleExportClick() {
  if (jobs.length === 0) {
    showToast('Nothing to back up yet. Add a job first.', 'info');
    return;
  }
  exportJobsToCsv(jobs);
  markBackedUp();
  refreshList();
  showToast(`Backup downloaded with ${pluralApps(jobs.length)}. Keep the file somewhere safe.`);
}

/** Reads the chosen backup file and adds its applications, skipping ones already saved. */
async function handleImportFile(event) {
  const input = event.target;
  const file = input.files[0];
  input.value = ''; // so choosing the same file again still works
  if (!file) return;

  let parsed;
  try {
    parsed = parseJobsCsv(await file.text());
  } catch (error) {
    showToast(error.message || "Couldn't read that file.", 'error');
    return;
  }
  if (parsed.jobs.length === 0) {
    showToast('No applications found in that file.', 'info');
    return;
  }

  const { data, error } = importJobs(parsed.jobs);
  if (error) {
    showToast(error.message, 'error');
    return;
  }

  loadJobs();
  const skipped = [];
  if (data.duplicates > 0) skipped.push(`${data.duplicates} already saved`);
  if (parsed.skipped > 0) skipped.push(`${parsed.skipped} missing a company or role`);
  const skippedText = skipped.length > 0 ? ` Skipped ${skipped.join(' and ')}.` : '';
  showToast(`Restored ${pluralApps(data.added)}.${skippedText}`, data.added > 0 ? 'success' : 'info');
}

/* =============================================================
   Startup
   ============================================================= */

/** Connects all buttons, forms and filters to their handlers. */
function wireEvents() {
  const importInput = document.getElementById('import-input');

  document.getElementById('add-job-btn').addEventListener('click', handleAddClick);
  document.getElementById('empty-add-btn').addEventListener('click', handleAddClick);
  document.getElementById('table-add-btn').addEventListener('click', handleAddClick);
  document.getElementById('export-btn').addEventListener('click', handleExportClick);
  document.getElementById('reminder-backup-btn').addEventListener('click', handleExportClick);
  document.getElementById('import-btn').addEventListener('click', () => importInput.click());
  document.getElementById('retry-btn').addEventListener('click', loadJobs);
  importInput.addEventListener('change', handleImportFile);

  onJobForm({ onSubmit: handleJobSubmit, onDelete: handleDeleteClick });
  onDeleteConfirm(handleDeleteConfirm);
  onFiltersChange(refreshList);
  onJobsChangedElsewhere(loadJobs);
  initDialogs();
}

initTheme();
initSelectOptions();
wireEvents();
requestPersistentStorage();
showView('app');
loadJobs();
