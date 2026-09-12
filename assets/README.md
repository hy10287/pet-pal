# Assets (local only)

This repo **does not** ship copyrighted Live2D character models or motion packs.

Place your own licensed / official Sample assets locally (they are gitignored):

- `assets/model/` — `.model3.json` / `.moc3` / textures
- `assets/kanade/motions/` or any motions dir — `.motion3.json` + optional `motions.tags.json`

Point `config` / `%AppData%\Roaming\Electron\app.config.json` at those paths.
For a license-clean demo without private assets, use official Live2D Sample (e.g. Hiyori) as described in the root README, plus `fixtures/motions.tags.sample.json`.
