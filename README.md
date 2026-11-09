# 💼 Job Tracker

A simple, private tracker for your job applications. Open the page and start adding jobs. No sign-up, no login.

**Live site:** https://emj4yy.github.io/Job-Tracker/

## How it works

- **Add** each job you apply to: company, role, status and date. Location, salary, link and notes are optional.
- **Update the status** by tapping the colored label: Wishlist, Wait for Reply, Interviewing, Accepted, Rejected, Rejected Myself or Ghosted.
- **Edit or delete** a job by clicking its row (or tapping its card on a phone).
- **See your progress** at a glance: total applications, this month, interviews and offers.
- **Filter** by tapping a status above the list, or search by company or role.

## Where your data is saved

Everything stays in your browser, on your device. Nothing is uploaded anywhere, and nobody else can see your list.

This also means:

- Each browser and device has its own list.
- Clearing your browser's site data, or using a private/incognito window, erases the list.

Use **Download backup** now and then to save a copy (a CSV file that also opens in Excel or Google Sheets). Use **Restore backup** to load it back, or to move your list to another device. Applications that are already saved are skipped, so restoring twice won't create duplicates.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout |
| `css/style.css` | Styles, light and dark mode, and layouts for phones, tablets and desktops |
| `js/main.js` | Starts the app and connects buttons to actions |
| `js/ui.js` | Draws the list, forms and dialogs |
| `js/jobs.js` | Saves and loads jobs in the browser (localStorage) |
| `js/importCsv.js` | Reads a backup file |

It's plain HTML, CSS and JavaScript with no build step and no dependencies. To publish, push these files to GitHub and turn on GitHub Pages for the main branch.
