# Feature Import Plan — 1com / PBXM → PBX Platform

**Status:** APPROVED — execution in progress (started 2026-09-17)  
**Branch:** `feature/pbx-1com-feature-import`  

### Progress

| Phase | Status | Notes |
|-------|--------|-------|
| 0 i18n HE/EN/FR + RTL | **IN** | Message catalogs, locale switcher, tenant locale settings, platform locale packs |
| 1 schedules/IVR/DID/media | **PARTIAL** | CRUD API + tenant UI for schedules/IVR/media; DID inbound UI still uses existing numbers page |
| 2 queues/hunts/codes/blacklist | **PARTIAL** | CRUD API + UI pages; runtime dialplan wiring pending |
| 3 peer ops / CDR / KPIs | PENDING | |
| 4 VM / MoH / conf / phonebooks | **PARTIAL** | Conferences/paging/phonebooks CRUD+UI; MoH schema; VM inbox pending |
| 5 custom dest / webhooks / paging | **PARTIAL** | Safe custom destinations CRUD; answer webhook runtime pending |
| 6 campaigns / DNC / cron | **PARTIAL** | DNC lists API; campaigns UI placeholder |
| 7 BLF / fax / SMS | PENDING | Provisioning UI placeholder |
| 8 docs / QA / isolation | PENDING | |  
**Source system:** `https://pbx6webserver.1com.co.il` (1com management UI / PBXM-class)  
**Target:** canonical repo multi-tenant PBX (API + web + telephony-controller + Asterisk)  
**Decision date:** 2026-09-17  

---

## Mission Brief

Import the full 1com customer-PBX feature surface into our infrastructure, including multi-language (HE / EN / FR minimum), with a clear ownership split:

| Owner | Meaning |
|-------|---------|
| **Tenant** | Customer admin / operators configure and run *their* PBX day-to-day |
| **Platform Owner** | Global catalogs, carriers, entitlements, cross-tenant ops, system defaults |
| **Shared** | Platform defines / assigns; tenant consumes and customizes within limits |

Do **not** copy 1com’s PHP monolith, ChanSIP, or insecure “API key in URL” custom-destination patterns. Map capabilities onto our API, permissions, RLS, entitlements, and ARI controller.

---

## Ownership rule (canonical)

1. **If it is dialplan, media, users, or call data for one customer → Tenant.**
2. **If it is a global resource, commercial catalog, carrier, or cross-tenant control → Platform Owner.**
3. **If Platform Owner must help a customer → use audited tenant context / impersonation, not a duplicate config model.**
4. **Entitlements gate tenant features** (queues, campaigns, fax, BLF provisioning, concurrent campaign calls, etc.). Tenant admins cannot raise their own limits.
5. **Secrets and provider credentials stay Platform-managed or psst-injected** — never pasted into tenant custom destinations.

---

## Classification matrix

Legend: **T** = Tenant UI/API · **P** = Platform Owner · **S** = Shared (P catalog / assign, T configure) · **Exist** = already present in some form

### A. Identity, shell, i18n

| Feature | Owner | Notes |
|---------|-------|-------|
| UI locales HE / EN / FR (+ later) | **S** | **P** manages locale packs & completeness; **T** enables locales; **user** picks preference |
| RTL layout when locale is HE | **T** (shell) | Web layout direction follows active locale |
| Tenant switcher (multi-customer operator) | **P** | Platform → Customers; tenant users stay single-tenant |
| Password change / password policy | **S** | **P** sets global policy; user changes own password |
| Cluster / node picker | **P** | Only if we ever multi-node; not tenant-facing |
| Quick shortcuts / personal dashboard pins | **T** | Per-user preference |
| Role-gated Stats | **T** | Permission-based (already our model) |

### B. Live dashboard & KPIs

| Feature | Owner | Notes |
|---------|-------|-------|
| Connected / disconnected extensions | **T** | Tenant dashboard |
| Active internal / external calls | **T** | |
| Inbound / outbound today | **T** | |
| Recent calls widget | **T** | |
| Cross-tenant KPI rollup | **P** | Platform dashboard |
| System health (ARI, Asterisk, DB, Redis) | **P** | Exist |

### C. Extensions, devices, peers

| Feature | Owner | Notes |
|---------|-------|-------|
| Extensions CRUD | **T** | Exist |
| SIP devices (multi-device) | **T** | Exist |
| Credential rotate / one-time reveal | **T** | Exist |
| Peer status (IP, port, RTT, online) | **T** | Expand status page |
| Force unregister / reset / clear MWI | **T** | Ops actions; audit |
| Desk-phone reboot (if provisioned) | **T** | Only when device provisioning enabled |
| ChanSIP ↔ PJSIP migrate | **—** | **Do not import** — PJSIP-only |
| Platform view of any tenant’s peers | **P** | Via customer console |

### D. Numbers & routing

| Feature | Owner | Notes |
|---------|-------|-------|
| Buy / inventory / carrier DID pool | **P** | Twilio / SIP carrier integrations |
| Assign DID → tenant | **P** | Exist pattern |
| Inbound route: DID → destination | **T** | After assignment |
| Outbound routes / caller ID policies | **S** | **P** trunks & default routes; **T** outbound CID / route selection within plan |
| Short numbers / speed dial | **T** | |
| Blacklist (inbound block) | **T** | |
| DNC / only-call lists | **T** | Especially for campaigns |

### E. Call-flow objects (core PBX)

| Feature | Owner | Notes |
|---------|-------|-------|
| Media library (prompts) | **T** | Entitlement: storage / count |
| Global prompt pack (system greetings) | **P** | Optional catalog tenants can clone |
| Music on Hold classes | **T** | |
| Time conditions / calendars / holidays | **T** | `WEEKTIME`, `WEEKDAY`, `CALENDAR`, `DATEBETWEEN`, state-based |
| Shared holiday calendar templates (IL) | **P** | Tenants clone / subscribe |
| IVR menus | **T** | Exist schema — productize |
| Hunt / ring groups (multi-extension) | **T** | Exist schema — productize; distinct from multi-device |
| Queues + agents (ext and/or external numbers) | **T** | Exist schema — productize |
| Queue strategies beyond ring-all | **T** | rrmemory, leastrecent, etc. as we enable |
| Conferences (PIN / admin PIN / max) | **T** | |
| Paging groups | **T** | Entitlement-gated |
| Custom destinations | **T** | Types below |
| Feature codes (*DND, CFWD, pickup, park…) | **S** | **P** defines code catalog defaults; **T** enables/overrides codes within policy |
| Voicemail boxes | **T** | Exist schema — productize |
| Call flows / versioned graphs | **T** | Exist schema — unify UI |

**Custom destination types (tenant):**

| Type | Import? | Implementation note |
|------|---------|---------------------|
| Forward to PSTN / number | Yes | Via outbound trunk entitlements |
| Set language (HE/EN/…) | Yes | Channel lang for TTS/IVR |
| Set channel variable | Yes | Allow-listed vars only |
| HTTP webhook on answer / screen-pop | Yes | **Signed tenant webhooks** — no secrets in URL |
| Raw dialplan / curl with embedded API keys | **No** | Reject; use webhooks + psst |

### F. Status, CDR, recordings, messaging

| Feature | Owner | Notes |
|---------|-------|-------|
| CDR filters (date, src, dst, DID, queue, duration) | **T** | Expand calls UI |
| Inline recording player | **T** | Exist |
| Queue logs / IVR logs | **T** | |
| Live queue / conference status | **T** | |
| Voicemail message inbox + player | **T** | |
| Fax inbox/outbox | **T** | Entitlement; Phase later |
| Cross-tenant CDR search | **P** | Support / audit only |

### G. Campaigns & automation

| Feature | Owner | Notes |
|---------|-------|-------|
| Voice / SMS / FAX campaigns | **T** | Heavy entitlement + carrier capability |
| Campaign concurrency / attempt limits | **S** | **P** plan limits; **T** operates within them |
| Cron / scheduled telephony jobs | **T** | e.g. flip night mode, play announcement |
| Platform job runners / worker health | **P** | |

### H. Phonebooks & provisioning

| Feature | Owner | Notes |
|---------|-------|-------|
| Company phonebooks / directories | **T** | |
| DB-backed directory sources | **T** | Read-only connectors; secrets via integrations |
| Button layouts / BLF templates | **T** | Entitlement: hardware provisioning |
| Phone firmware / vendor templates | **P** | Global template catalog |
| Provisioning server / DHCP opts | **P** | Infra |

### I. Billing & resources

| Feature | Owner | Notes |
|---------|-------|-------|
| Plans, prices, entitlements | **P** | Exist |
| Tenant usage / over-limit UI | **T** | Exist |
| Invoices / credits | **S** | Exist |
| Prepaid “balance” à la 1com | **S** | Map to **credits ledger** (exist) — do not add parallel balance field |
| Carrier cost / margin reports | **P** | |

### J. Platform-only (no tenant admin edit)

| Feature | Owner |
|---------|-------|
| SIP carriers / trunks credentials | **P** |
| OpenAI / Stripe / Twilio credentials | **P** |
| Suspend / reactivate / archive tenant | **P** |
| Create customer + provisioning wizard | **P** |
| Plan limit overrides | **P** |
| Global feature flags | **P** |
| Locale pack authoring / translation coverage | **P** |
| Asterisk runtime / generated config hygiene | **P** / ops |
| Multi-tenant isolation audits | **P** |

---

## Multi-language design

### Languages (v1)

| Code | UI | RTL | IVR/prompts |
|------|----|-----|-------------|
| `he` | Yes | Yes | Yes |
| `en` | Yes | No | Yes |
| `fr` | Yes | No | Yes |

### Layers

| Layer | Owner | Behavior |
|-------|-------|----------|
| Locale packs (message catalogs) | **P** | Store key→string per locale; versioned; missing keys fall back `en` |
| Tenant enabled locales | **T** | Subset of platform-enabled locales |
| Tenant default locale | **T** | Used for new users + default IVR language |
| User UI locale | User | Preference; cookie/profile |
| Extension / IVR language | **T** | Channel language for playback / TTS |
| Media prompts per language | **T** | Optional `prompt_key` + locale variant in media library |
| System emails / invitations | **S** | Template per locale; send in recipient preference |

### Implementation sketch

- Web: `next-intl` (or equivalent) with `he`/`en`/`fr` JSON catalogs under `apps/web/messages/`
- API: `Accept-Language` + user preference; error `code` stable, `message` localized when safe
- Telephony: `Set(CHANNEL(language)=…)` / prompt selection by locale
- Platform UI: locale pack coverage dashboard (missing keys)

---

## Target IA (information architecture)

### Tenant nav (import target)

```text
Overview
  Dashboard (KPIs)
  Statistics
  Health

Telephony
  Extensions & Devices
  Numbers & Inbound routes
  Call flows
    Schedules & calendars
    IVR
    Hunt groups
    Queues
    Conferences
    Paging
    Feature codes
    Custom destinations
    Short numbers
  Media & MoH
  Voicemail
  Phonebooks
  Blacklist / DNC
  Campaigns          [entitlement]
  Provisioning       [entitlement]
  Calls (CDR)
  Live status (peers / queues / conferences)
  Operator / Agent panels
  Users & invitations

AI                          (keep — our differentiator)
Billing / Usage
Settings
  Telephony
  Locales
  Webhooks
  Cloud backup
```

### Platform Owner nav (import target)

```text
Overview / Health
Customers (all-tenant management — exist)
  → open tenant in audited context (full tenant IA)

Billing
  Plans / Prices / Entitlements catalog
  Credits / prepaid policy

Integrations
  SIP carriers, Twilio, numbers pool
  AI, Stripe, cloud storage
  SMS / Fax providers (when campaigns/fax enabled)

Catalogs
  Locale packs
  System prompt packs
  Holiday calendar templates (IL)
  Feature-code defaults
  Phone vendor / BLF templates

Ops
  Cross-tenant peer / trunk health
  Worker / campaign runners
  Audit
```

---

## Entitlements to add / extend

| Dimension | Gates |
|-----------|-------|
| `max_ivrs` / `max_queues` / `max_hunt_groups` | Call-flow objects |
| `max_conferences` / `max_paging_groups` | |
| `max_media_bytes` / `max_moh_classes` | Media |
| `max_campaigns` / `max_campaign_concurrent` | Campaigns |
| `fax_enabled` / `sms_campaigns_enabled` | Messaging |
| `hardware_provisioning_enabled` | BLF / phone layouts |
| `max_phonebook_entries` | Directories |
| Existing | extensions, devices, users, webhooks, concurrent calls |

Grandfathering rules unchanged: over-limit existing resources keep working; new creates blocked; UI shows `over_limit`.

---

## Phased delivery (all features, ordered)

Approval of this plan authorizes phased implementation — not a single mega-commit.

| Phase | Scope | Owner surface | Exit criteria |
|-------|-------|---------------|---------------|
| **0** | i18n foundation (HE/EN/FR), RTL, locale prefs, Platform locale packs | T+P | Switch language; HE RTL; no hardcoded critical nav |
| **1** | Schedules/calendars, IVR UI+runtime, DID inbound destination UI, media library | T (+P holiday templates) | Inbound DID → schedule → IVR → extension proven |
| **2** | Hunt groups, queues (+ live status), feature codes (DND/CFWD), blacklist | T | Ring strategies + agent membership live |
| **3** | Peer ops console, CDR advanced filters, queue/IVR logs, dashboard KPIs | T (+P rollup) | Unregister + filtered CDR + KPIs |
| **4** | Voicemail boxes + inbox UI, MoH, conferences, short numbers, phonebooks | T | VM leave/retrieve; MoH on hold |
| **5** | Custom destinations (safe types), answer webhooks/screen-pop, paging | T | Screen-pop via signed webhook |
| **6** | Campaigns (voice first), DNC lists, cron jobs | T+P limits | Concurrent campaign under entitlement |
| **7** | Hardware button layouts / BLF, fax, SMS campaigns | T+P catalogs | Behind entitlements; optional |
| **8** | Docs, QA matrix, five-tenant isolation for new objects, regression | — | DoD per phase |

Preserve always: offline-destination gate, recording pipeline, multi-device ringing, tenant lifecycle telephony effects, RLS isolation.

---

## Explicit non-goals

- ChanSIP support or ChanSIP↔PJSIP migration UI  
- Embedding provider API keys in dialplan/custom destinations  
- Parallel prepaid balance field (use credits ledger)  
- Cloning 1com visual design / SmartAdmin  
- Weakening multi-tenant isolation for “support convenience”  
- Implementing all phases in one unreviewed commit storm  

---

## Permissions (delta)

Add tenant permissions as features land (examples):

```text
tenant:callflow:manage     (expand use — IVR/queue/hunt/schedule)
tenant:media:manage
tenant:voicemail:manage
tenant:campaign:manage
tenant:phonebook:manage
tenant:provisioning:manage
tenant:peer:operate        (unregister / reboot)
```

Platform keeps integration/credential permissions. No new “tenant can edit carrier secrets.”

---

## Verification ladder (per phase)

1. Unit / contract tests for new schemas and permissions  
2. API integration: tenant A cannot read tenant B new objects  
3. Telephony smoke: route/queue/IVR as applicable  
4. UI locale flip HE↔EN↔FR on touched screens  
5. Entitlement race where count-limited  
6. Update `QA_MATRIX.md` / `QA_REPORT.md` with phase evidence  

---

## Risks

| Risk | Mitigation |
|------|------------|
| Scope explosion | Phase gates; no phase N+1 without N exit |
| Dialplan complexity vs ARI controller | Prefer controller-owned routing; generate Asterisk only where required |
| Hebrew RTL regressions | Visual smoke on Phase 0 + each UI-heavy phase |
| Campaign abuse / cost | Entitlements + Platform carrier assign + DNC |
| Secret leakage in custom destinations | Allow-list + webhook signing only |

---

## Approval checkpoint

Reply with one of:

1. **`APPROVE AS WRITTEN`** — begin Phase 0 (i18n) then Phase 1  
2. **`APPROVE WITH CHANGES:`** … — adjust classification/phases  
3. **`REJECT`** — stop; no import implementation  

Until then: **no broad implementation**.
