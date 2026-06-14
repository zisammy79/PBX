# PLAN — PBX Final Closeout

Execution plan and gates: [docs/PRODUCTION_V1_CLOSEOUT_PLAN.md](docs/PRODUCTION_V1_CLOSEOUT_PLAN.md).

**Approved narrow mission (2026-06-13):** [PLAN_INPUT.md](PLAN_INPUT.md) — extension management UI: credential rotation, recorded-call playback, safe deletion.

**Extension management session (2026-06-13):** rotate/reconcile backend existed; UI completed for rotate (one-time password), recordings list/playback API, and logical delete with telephony reconcile.

**Current gate:** `PRODUCTION_V1_EXTERNAL_GATE: READY_FOR_PLATFORM_OWNER_CONFIGURATION`

**Remaining P0:** Platform Owner credentials for OpenAI Realtime, SIP carrier (PSTN), Stripe test mode; then live verification scripts and `make production-v1-verify`.

**Verification ladder:** [README.md](README.md#verification-commands), [docs/TEST_PLAN.md](docs/TEST_PLAN.md).
