# GMAT, one thing at a time

A laptop-first, offline-first study app that runs the GMAT Ninja 13-week plan: what to do next, the questions,
the timer, the review and the cards. Spec: `docs/gmat-platform-spec.md` (source of truth); decisions: `docs/decisions.md`.

## Parts

| Folder | What |
|---|---|
| `importer/` | One-time Python import: the plan, the four Official Guide books, the RC and CR banks → `data/` |
| `src/core/` | Pure logic with tests: calendar, budgets, pieces, the week, the card, the mix, progress, marking |
| `src/data/` | Storage (IndexedDB via Dexie, add-only event log), backup and restore |
| `src/ui/` | Screens |
| `tests/` | `npm test` |

## Commands

```
npm run content   # rebuild data/ from the source files
npm run dev       # development (loads data/ automatically; has the time machine)
npm test
npm run build     # the version you install (no time machine, no content inside)
```

The study content never goes in the repository or on the website. The app loads `data/gmat-content-v1.json`
once from the laptop.
