# Product

## Register

product

## Users

Game localization operators, translators, reviewers, and project owners processing large spreadsheet-based text sets. They work in long-running desktop sessions, need to distinguish delivery blockers from review-only findings, and must be able to resume safely without losing accepted translations.

## Product Purpose

TransMate is an AI-assisted desktop localization workbench for splitting files, translating text, converting formats, running deterministic and AI-assisted QA, managing terminology, and producing auditable delivery files. Success means large jobs finish with clear acceptance gates, bounded API usage, resumable progress, and no silent data loss.

## Brand Personality

Focused, technical, dependable. The interface may retain its established TransMate identity, but workflow status and safety signals take priority over decoration.

## Anti-references

Do not turn the production workflow into a marketing-style dashboard, hide consequential automation behind vague one-click language, or use decorative effects that compete with task state. Avoid silent retries, silent issue suppression, and ambiguous counts that mix the current batch with the full report.

## Design Principles

1. Preserve work first: never drop translations, report rows, decisions, or resumable state while narrowing a repair scope.
2. Make automation goal-driven: state the target condition, budget, progress, and terminal reason.
3. Separate certainty levels: deterministic blockers, configurable project rules, and review-only heuristics must remain visibly distinct.
4. Keep long operations calm: support pause, safe stopping, checkpoints, and one meaningful completion signal.
5. Keep delivery claims honest: selected goals and full delivery readiness are separate gates.
6. Keep the default workflow one-click: upload, translate, and optionally detect. Internal complexity must not become user decision work.
7. Prefer fewer high-precision rules over broad detection coverage. An uncertain finding must not trigger automatic rewriting.
8. Optimize for end-to-end deliverable quality and time, not for driving the displayed issue count to zero.

## User Experience Contract

- A normal user should not need to choose issue categories, repair waves, retry strategies, or language-specific rules.
- The tool owns detection, bounded retry, rollback, freezing and safe stopping.
- A translated cell that passes high-confidence checks is frozen and must not be rewritten by later review-only findings.
- The application must finish a run without unbounded loops, even when a detector and the model cannot agree.
- Review-only findings may be shown after completion, but they must not prevent the default workflow from completing.
- The tool, not the user, chooses the default repair and stopping strategy. A run ends with either a verified delivery file or an explicitly unverified best-effort file plus report; it never asks the user to operate the repair loop.

## Engineering Contract

Detailed translation, QA, repair, performance and release guardrails live in `DEVELOPMENT.md` and are mandatory for future changes.

## Accessibility & Inclusion

Preserve keyboard-operable native controls, visible focus states, non-color status text, concise Chinese labels, and reduced-motion compatibility. New workflow states must be understandable without relying on animation or color alone.
