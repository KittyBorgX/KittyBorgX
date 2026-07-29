# Development notes

## Files

- `scripts/fetch-github.mjs` — fetches live GitHub stats and recent repositories
- `scripts/render.mjs` — renders the main broadcast SVG
- `scripts/render-ascii.mjs` — renders the all-ASCII SVG
- `config.json` — personal content and tower settings
- `data/demo.json` — local preview data
- `data/github.json` — generated live data

## Commands

```bash
npm run build      # render from demo data
npm run update     # fetch live data and render assets
npm run preview    # open a local preview server
npm run check      # syntax check scripts
```

## Important note

The timing tower excludes the profile repository itself by default using both:

- the GitHub username
- anything listed in `config.tower.exclude`
