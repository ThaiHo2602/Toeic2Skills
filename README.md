# TOEIC Adaptive Learning Platform MVP

React + Vite + TypeScript MVP for a TOEIC Listening and Reading practice platform.

## Implemented

- Dashboard with estimated TOEIC score, skill cards, Part accuracy, weak areas, recommendations, progress chart.
- Adaptive practice for Part 1-7 using user `level_score`, question `difficulty_score`, recent-question avoidance and weakness priority.
- Placement, mini test and full-test workflow using seeded questions.
- Deterministic scoring with Listening/Reading/Total estimated score, confidence and bội số 5 rounding.
- Attempt history, answer review, explanations and bookmarked questions.
- Question bank table with TOEIC metadata: skill, part, topic, grammar, difficulty, media.
- Architecture reference view listing backend modules, database relationships and REST API examples.
- Local persistence via `localStorage`; ready to replace with Laravel or Node.js APIs.

## Run

```bash
npm install
npm run dev -- --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

## Build

```bash
npm run build
```

## Core Files

- `src/App.tsx`: app shell, dashboard, practice runner, tests, review, bank, architecture reference.
- `src/data.ts`: seed topics, grammar points, groups, questions and answers.
- `src/types.ts`: implementation of the proposed data model as TypeScript types.
- `src/services/scoring.ts`: estimated TOEIC scoring, confidence, level delta and difficulty update logic.
- `src/services/adaptive.ts`: adaptive practice selection logic.
- `src/services/storage.ts`: local persistence, attempt submission, stats and weakness recomputation.

## Backend Migration Path

The UI currently calls local services. To connect Laravel or Node.js:

- Replace `loadState`, `saveState`, `submitAttempt` with API calls.
- Move scoring and adaptive services to backend for authoritative results.
- Keep the TypeScript types aligned with backend DTOs.
- Use the Architecture tab as the initial API/database checklist.

All displayed scores are estimated scores, not official TOEIC scores.
