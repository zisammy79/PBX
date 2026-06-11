# GEMINI.md

This file supports `AI_CONSTITUTION.md`. If there is any conflict, follow `AI_CONSTITUTION.md`.

## Gemini's role in this repo

Gemini is the default big-context discovery and synthesis tool.

Use Gemini for:
- repo-wide discovery
- large-file or multi-file summarization
- inventories, mappings, and comparisons
- extracting candidate file lists, flows, risks, and failure patterns for later planning
- producing compact discovery artifacts that Claude or Codex can consume

Gemini is usually read-only in this repo.

## Default posture

1. Start in discovery mode.
2. Read broadly only when broad context is truly needed.
3. Preserve evidence paths before compressing findings.
4. Reduce the result into compact handoff artifacts.
5. Hand off implementation decisions to the planning stage.

## Preferred outputs

When doing discovery, try to leave behind one or more of:
- `SPEC.md`
- `PLAN_INPUT.md`
- `UI_ACTION_MAP.md`
- `COPY_STRING_REPORT.md`
- `QA_MATRIX.md`
- `TRACE_INDEX.md`
- `NOTES.md`

Each artifact should be compact, actionable, and grounded in actual files.

## Analysis rules

- map code paths before suggesting edits
- include exact file paths when possible
- separate facts from inferences
- highlight unknowns and blockers clearly
- when logs or traces exist, identify the precise artifacts worth inspecting
- note confounds instead of overcommitting to one root cause
- do not invent handlers, routes, tests, or features

## Good discovery shape

A good Gemini handoff usually contains:
- short problem statement
- impacted files/modules shortlist
- observed evidence
- risks and confounds
- unknowns
- suggested verification targets
- artifact paths for the next tool to inspect

## Avoid

- broad edits without an approved plan
- vague summaries that do not help the next tool act
- collapsing rich evidence into one generic paragraph too early
- rephrasing the same context repeatedly instead of producing a concise artifact
