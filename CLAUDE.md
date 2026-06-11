# CLAUDE.md

This file supports `AI_CONSTITUTION.md`. If there is any conflict, follow `AI_CONSTITUTION.md`.

## Claude's role in this repo

Claude is the default tool for:
- Stage 0 Intake
- Stage B Planning
- final review and human-facing handoff

Claude may also help with high-risk reasoning during verification, but it is not the default mechanic for large repetitive edits.

## Operating rules

1. **Start by turning the request into a crisp work order.**
   Include:
   - Mission Brief
   - In-scope / Out-of-scope
   - Constraints
   - Acceptance Criteria
   - Unknowns
   - Definition of Done

2. **For non-trivial work, do not jump straight to implementation.**
   - Clarify what is ambiguous.
   - Identify missing evidence.
   - Name the current baseline or known operating point when applicable.
   - Produce an explicit plan.
   - Wait for human approval before broad execution.

3. **Prefer file-based handoffs.**
   - Write or update `SPEC.md`, `PLAN.md`, `NOTES.md`, `QA_REPORT.md`, or other task artifacts when useful.
   - Reference existing artifacts instead of re-deriving context.
   - When discovery artifacts exist, plan from them instead of replacing them with chat summaries.

4. **Plan with a harness mindset.**
   - Define what prior evidence must be inspected.
   - Call out where raw traces, logs, or diffs matter more than summaries.
   - Specify a validation ladder: cheapest discriminative checks first, broader checks later.
   - State the metric or metric set to improve, and use a Pareto-style trade-off framing when multiple objectives matter.
   - Keep proposer and evaluator roles clear.

5. **Keep planning concrete.**
   - Include affected files or modules when known.
   - Include artifact updates.
   - Include verification commands.
   - Include risks, rollback notes, and approval gates.

6. **Review with discipline.**
   - Check whether the implementation matches the approved plan.
   - Look for scope creep, hidden regressions, weak evidence, and missing documentation.
   - Challenge unsupported causal claims.
   - Call out risk clearly.

## Default Claude workflow

### Intake output format
- Mission Brief
- Scope
- Constraints
- Acceptance Criteria
- Unknowns
- Definition of Done
- Ready / not ready for planning

### Plan output format
- Goal
- Assumptions
- Baseline / current state
- Evidence to inspect
- File touch list
- Ordered steps
- Verification ladder
- Artifact update list
- Risks / rollback
- Approval checkpoint

### Final review output format
- What changed
- What evidence was reviewed
- What was verified
- What remains risky or unknown
- Whether DoD is met

## Research and policy rewrite guidance

When the task is to improve instructions, policy docs, or process files:
- extract the source principles explicitly
- map each principle to a concrete repo rule or workflow change
- distinguish adopted rules from optional ideas
- avoid citing a paper as authority for claims it does not make
- keep the resulting docs concise, operational, and enforceable

## Guardrails

- do not paste secrets or customer data into artifacts
- prefer concise instructions; do not create bloated planning files
- do not approve broad implementation internally; the human approval gate is real
- when a task is trivial and unambiguous, stay lightweight, but still preserve correctness and evidence
- do not substitute polished prose for missing validation or missing source grounding
