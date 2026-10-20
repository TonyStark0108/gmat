# GMAT, one thing at a time

A laptop-first, offline-first study app that runs the GMAT Ninja 13-week plan: what to do next, the questions,
the timer, the review and the cards. Spec: `docs/gmat-platform-spec.md` (source of truth); decisions: `docs/decisions.md`.

## How it works

Everything you do is an event, added to a log in the browser (IndexedDB) and never edited. Every screen is
computed from that log by pure functions in `src/core`, so the same logic runs in the app, in the unit tests
and in the simulated-student tests.

```
events (IndexedDB) ──► derive() ──► buildModel() ──► chooseCard() ──► the one card on home
                                       │
                                       ├── reviews: sets, the redo ladder, mixed review      (review.ts)
                                       ├── cards: starter decks + your lines, FSRS            (cards.ts)
                                       ├── extras: top-ups, extra practice, drill repeats    (extras.ts)
                                       ├── adapting: topic stats, the lean, difficulty        (adapt.ts, adaptView.ts)
                                       └── mocks, Ready, booking, the end game                (mocks.ts)
upkeep(model) ──► the records the app adds itself: the week, weeks that counted, levels, new cards
```

## The tutor

`src/core/tutor/` (what it knows: `brief.ts`; its tools: `tools.ts`; its instructions: `prompt.ts`; cost: `cost.ts`)
and `src/data/tutor.ts` (the streaming tool loop with Claude Opus 5.5, the server-side fallback and prompt
caching). It uses your own Claude API key, kept only in the browser. Answers you haven't retried stay hidden from
it; homework it sets waits for your OK. Tests run against a stand-in for Claude's service (`tests/sse.ts`), so
they never spend money.

## Parts

| Folder | What |
|---|---|
| `importer/` | One-time Python import: the plan, the four Official Guide books, the RC and CR banks → `data/` |
| `src/core/` | Pure logic: calendar, budgets, pieces, the week, the card, the mix, the review and redo ladder, cards, adapting, results lines, mocks, life events, links, the Sunday note |
| `src/data/` | Storage (IndexedDB via Dexie, add-only event log), backup and restore |
| `src/ui/` | Screens |
| `tests/` | `npm test`: the logic, including a simulated month and a simulated full plan (`bot.ts`) |
| `e2e/` | `npm run e2e`: the whole app in Chromium, by a robot, with screenshot albums (including the tutor) |

## Commands

```
npm run content   # rebuild data/ from the source files
npm run dev       # development (loads data/ automatically; has the time machine)
npm test          # the logic: ~95 tests, a simulated month and a simulated full plan (about a minute)
npm run e2e       # the app in a real browser: first run, offline, bus, backup and restore, the review by
                  # keyboard, cards, mixed review, CR, something came up, sharing in, Sunday note, mocks,
                  # booking and test week. Writes e2e-report/album.html and album-phase2.html.
npm run build     # the version you install (no time machine, no content inside)
```

Tests that need the study content (`data/gmat-content-v1.json`) skip themselves where it isn't present, such
as on GitHub, which builds and deploys every push to `main`.

The study content never goes in the repository or on the website. The app loads `data/gmat-content-v1.json`
once from the laptop.
