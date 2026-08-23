# TransMate Repository Instructions

Before changing translation, QA, repair, delivery, resume, or workflow code, read:

- `PRODUCT.md`
- `DEVELOPMENT.md`

Non-negotiable repository rules:

1. Preserve the default user flow: upload, click translate, optionally click detect. Do not require users to understand or select QA rules.
2. Do not add per-word or one-report language patches. Use tested declarative language data or downgrade uncertain findings.
3. Only deterministic, high-precision findings may block delivery or trigger automatic AI repair.
4. Heuristic findings, names, loanwords, same-script language guesses, length and fluency checks are review-only by default.
5. Never add unbounded translation or repair loops. Freeze accepted cells; use one targeted repair and at most one bounded fallback for deterministic blockers.
6. A candidate may replace the current translation only when selected findings strictly decrease and no hard finding is introduced.
7. Do not fix QA false positives by strengthening the translation prompt. Fix, delete or downgrade the detector.
8. New detection rules require real positive samples, similar negative samples, cross-language regression coverage and measurable precision.
9. Performance work must report end-to-end time, requests per 1,000 items, candidate acceptance and regression rate. Raw processed-items speed is insufficient.
10. New paths must replace obsolete paths rather than layer another permanent workflow on top.
11. UI, import, retry, candidate acceptance, and delivery must consume one canonical issue registry and one global per-cell attempt ledger. Do not duplicate issue regexes or retry budgets.
12. A completed run must save either a verified delivery artifact plus report, or an explicitly `_unverified` best-effort artifact plus report. Never label residual blockers as deliverable.
13. Language behavior belongs in a versioned `language-quality-profiles` schema. Project names and one-report terms must not enter global language profiles.

Required verification for relevant changes:

- `npm test`
- `npm run build:web`
- `node --check script.js`
- Targeted browser or desktop smoke test when UI or runtime loading changes

Before any new or upgraded hard QA rule can ship, the repository must provide and pass `npm run test:quality-replay` against versioned gold fixtures. Release candidates must also run the platform desktop build, including `npm run desktop:build:windows` on Windows.

Change handoff for translation or QA work must state:

- issue tier and evidence;
- global per-cell attempt budget;
- obsolete paths removed or the migration layer's deletion version;
- affected language profile and version;
- quality replay samples and metric deltas;
- verified vs `_unverified` terminal artifact behavior.
