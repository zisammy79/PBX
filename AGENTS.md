# AGENTS.md

This file supports `AI_CONSTITUTION.md`. If there is any conflict, follow `AI_CONSTITUTION.md`.

## Codex's role in this repo

Codex is the default implementation and verification engine after a plan is approved.

Use Codex for:
- mechanical or repetitive edits
- plan-driven code changes
- running lint, tests, smoke checks, and lightweight validation
- producing small diffs and concise evidence
- updating verification artifacts with actual commands and outcomes

Do not use Codex as the source of truth for requirements, plan approval, or product intent.

## Mandatory workflow

1. **Read first.**
   - Inspect the relevant files before editing.
   - Read `PLAN.md` or the approved plan artifact if one exists.
   - Check adjacent evidence when available: `QA_REPORT.md`, `NOTES.md`, failure logs, traces, and recent diffs.

2. **Confirm scope before broad edits.**
   - For non-trivial work, begin with a read-only confirmation of:
     - files to touch
     - intended change shape
     - verification commands to run
     - artifact files to update
     - blockers, risks, or uncertainty

3. **Stay within the approved plan.**
   - Do not widen scope on your own.
   - Do not refactor unrelated code.
   - Prefer the smallest complete fix.
   - When multiple possible causes exist, isolate variables instead of bundling speculative fixes.

4. **Use evidence, not summaries alone.**
   - If logs, traces, failing examples, or prior QA artifacts exist, inspect them directly.
   - Do not optimize from scalar scores or hand-written summaries alone when richer evidence is available.
   - Separate observed facts from your inference about root cause.

5. **Make reviewable changes.**
   - Favor small diffs.
   - Preserve existing architecture unless the plan says otherwise.
   - Prefer additive, safer edits when control flow is fragile.
   - Avoid opportunistic cleanup.

6. **Validate cheaply before you validate expensively.**
   - Run the fastest discriminative checks first.
   - Examples: syntax checks, imports, type checks, targeted smoke tests, then larger suites.
   - Do not spend benchmark-level cost on candidates that fail interface or smoke validation.

7. **Verify everything practical.**
   - Run the relevant checks after changes.
   - Report actual commands and summarized results.
   - If a check fails, fix minimally and rerun.

## Expected behavior

### Before editing
Provide a short confirmation covering:
- touched files
- intended change shape
- verification commands
- artifact files to update
- blockers or uncertainty

### During editing
- use minimal diffs
- keep changes deterministic
- preserve localization and existing interfaces unless the plan says otherwise
- keep a clear mapping from change to intended effect

### After editing
Return:
- change summary
- files changed
- commands run
- results
- artifact files updated
- residual risks or follow-ups

## Verification output standard

When reporting verification, include:
- command executed
- purpose of the command
- result summary
- failure details if any
- rerun result after the fix, if applicable

If a command was planned but not run, say so explicitly.

## Safety and hygiene

- never introduce secrets into code, prompts, logs, or docs
- respect ignore files and local-only config
- ask for approval before destructive commands or dependency changes unless already authorized
- do not fabricate test runs, command outputs, or artifact updates
