# ForgeFit PWA v1.2.0

ForgeFit is a private, offline-first workout tracker designed for home training with bodyweight, a bench, and 5/10/15/20/30 lb dumbbells.

## New in v1.2.0: Complete PDF progress statements

Open **Settings & backup → Export complete PDF statement** to create a polished, printable PDF containing:

- Statement cover and reporting period
- All-time activity summary
- Monthly workout totals
- Training volume by muscle group
- Exercise progress register
- Every readiness check-in
- Workout directory with PDF page references
- Every completed workout, exercise, set, planned target, actual result, skip, effort rating, and pain flag
- Any unfinished workout stored at export time
- Custom presets
- Weekly schedule, equipment profile, baseline date, and app settings
- Page numbers and report-period footers

The PDF engine is built directly into ForgeFit. It requires no server, account, external website, or internet connection after the app is cached. Large histories are automatically paginated; the generator was stress-tested with a report approaching 500 pages.

The JSON export remains the restorable machine-readable backup. The PDF is the reviewable and printable statement.

## Updating an existing GitHub Pages installation

1. In the current app, export a JSON backup.
2. Replace the repository files with the contents of this folder.
3. Wait for GitHub Pages to deploy.
4. Open ForgeFit while online and reload it twice so the new service worker cache activates.
5. Confirm **Settings & backup** shows version `1.2.0` and the PDF statement button.
6. Import the JSON backup only if your local browser data was cleared.

## New installation

1. Create a GitHub repository.
2. Upload every file and folder here to the repository root.
3. In **Settings → Pages**, deploy from the `main` branch and `/ (root)`.
4. Open the resulting `https://USERNAME.github.io/REPOSITORY/` address in Chrome.
5. Use ForgeFit's **Install app** button or Chrome's **Install app** command.

Keep `.nojekyll`, `manifest.webmanifest`, `sw.js`, `pdf-report.js`, and the `icons` folder at the repository root.

## Data storage

Workout data is stored locally in the browser. Export JSON backups before clearing browser data, changing phones, or performing major upgrades.
