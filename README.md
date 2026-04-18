# Flyff Skill Simulator

A skill planner for [Flyff Universe](https://universe.flyff.com), with full support for 3rd-class skills and master variations.

Try it: [flyff-skill-sim.pages.dev](https://flyff-skill-sim.pages.dev)

## Features

- Plan builds across every 1st, 2nd, and 3rd class tree
- 3rd-class master variations
- Skill point budgeting per level (up to 190)
- Shareable build URLs
- Multiple languages: English, Deutsch, Français, Español, 中文
- Light and dark themes

## Stack

- React 18 + TypeScript
- Vite 6
- Mantine UI
- Zustand (state)
- React Router
- i18next

## Getting started

```sh
yarn install
yarn dev         # dev server on http://localhost:5173
yarn build       # production build → dist/
yarn preview     # preview the production build
yarn test        # run the test suite (Vitest)
yarn typecheck   # TypeScript check only
yarn scrape      # refresh skills/classes/icons from the Flyff Universe API
```

## Project layout

- `src/engine/` — framework-free skill system engine (skill-point budgeting, prerequisites, master variations)
- `src/app/` — React app: pages, components, stores, i18n
- `public/data/` — scraped skill/class data and icon sprite sheets
- `tools/` — scraper and offline utilities

## Deployment

The app is a plain Vite SPA, so it builds to a static `dist/` folder and runs on any static host. `public/_redirects` provides the SPA fallback so deep-linked routes resolve correctly on hosts that honor it.

## License

Source code is released under the [MIT License](LICENSE). Flyff Universe game assets are **not** covered by this license — see the note at the bottom of the LICENSE file.

## Disclaimer

Fan community project. Not affiliated with or endorsed by Gala Lab Inc. Flyff Universe and all related names, logos, and artwork are property of Gala Lab Inc. Game assets (icons, names, descriptions) remain the property of their respective owners and are used here for informational purposes only.
