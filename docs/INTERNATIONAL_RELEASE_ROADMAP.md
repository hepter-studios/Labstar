# 🌍 Labstar International Release Roadmap

Updated: **August 13, 2026**.

Labstar is evolving from a Hepter Studios-only internal tool into a **public multi-organization product**. The central rule is now:

> **Labstar can be public. Organizations created inside Labstar remain private by default.**

This roadmap covers global, commercial, operational and privacy readiness. Developer-adoption features are tracked in [`LABSTAR_EVOLUTION_ROADMAP.md`](LABSTAR_EVOLUTION_ROADMAP.md).

## 🌌 Principles

- security before growth;
- protected authorization remains enforced by the Rust backend;
- organization isolation exists in database, API, Realtime, storage and integrations;
- external integrations use least privilege;
- public developer data is explicit opt-in;
- public repository visibility never implies public customer data;
- English is the product source/fallback language;
- signed releases and rollback precede broad desktop distribution;
- documentation, backup and incident recovery precede scale.

## Phase 0 — Public product foundation

- make `organization_id` a hard tenancy boundary wherever organization data exists;
- separate platform administration from organization administration;
- support one account belonging to multiple organizations;
- inventory RLS, Storage and Realtime rules for every organization-scoped resource;
- keep public profile data in a separate public projection instead of weakening private tables;
- remove assumptions that Hepter Studios is the only possible organization;
- keep repository licensing separate from SaaS/product Terms of Use.

**Exit criterion:** two independent test organizations can coexist with no cross-organization data, event or permission leakage.

## Phase 1 — Reliable multi-organization alpha

- complete authentication and membership matrix;
- organization creation/onboarding;
- multi-organization account switching;
- explicit identity linking where required;
- isolate members, channels, projects, files and notifications;
- isolate Realtime Presence/Broadcast;
- isolate Storage access;
- define owner/admin/member boundaries;
- administrative audit trail;
- operational logs without secrets;
- availability/error monitoring;
- backup and restoration test in a separate environment.

**Exit criterion:** external test organizations can complete daily workflows without cross-tenant exposure, unrecoverable access failures or data loss.

## Phase 2 — Security and enterprise operations

- full RLS/API authorization review;
- automated negative tests proving tenant A cannot access tenant B;
- rate limiting on sensitive endpoints;
- invitation abuse protection;
- webhook signature verification and idempotent ingestion;
- secret inventory and rotation;
- retention/deletion design;
- incident response process;
- dependency/security update policy;
- recurring restoration exercises;
- threat modeling for integrations, CLI auth, public profiles and organization provisioning;
- public vulnerability reporting process through [`../SECURITY.md`](../SECURITY.md).

## Phase 3 — Professional desktop distribution

- Windows code signing;
- signed EXE/MSI/updater artifacts;
- stable and preview update channels;
- cryptographic package verification;
- release automation and rollback;
- supported Windows test matrix;
- version/changelog policy;
- optional transparent telemetry;
- privacy-aware crash diagnostics;
- deep-link compatibility across releases.

## Phase 4 — Internationalization

Language resolution target:

```text
user preference
→ organization default
→ OS/browser language
→ English
```

- structured i18n framework;
- English (`en`) as canonical source/fallback;
- Brazilian Portuguese (`pt-BR`) as first complete translation;
- user language selector;
- organization default language;
- localized dates, times, numbers and currencies;
- timezone support independent of UI language;
- localized emails/notifications;
- international character and longer-text testing;
- accessibility review;
- RTL preparation before adding RTL languages.

**Exit criterion:** an English-first organization completes every critical workflow without fixed Portuguese product text.

## Phase 5 — Global infrastructure

- measure real latency by region before adding regions;
- CDN for public assets;
- TURN infrastructure before promising global voice/video reliability;
- async queues for jobs and notifications;
- transactional email with verified domain;
- centralized observability;
- availability/latency/error alerts;
- per-organization and per-plan quotas;
- load testing;
- disaster recovery plan;
- GitHub rate-limit strategy;
- data residency evaluation for enterprise customers.

## Phase 6 — Commercial and legal readiness

Pre-release planning documents live in:

- [`legal/TERMS_OF_USE_DRAFT.md`](legal/TERMS_OF_USE_DRAFT.md)
- [`legal/PRIVACY_NOTICE_DRAFT.md`](legal/PRIVACY_NOTICE_DRAFT.md)
- [`../SECURITY.md`](../SECURITY.md)

Before a broad commercial launch:

- plans and billing;
- export/deletion procedures;
- retention schedule;
- subprocessors inventory;
- support policy and enterprise SLA direction;
- LGPD/GDPR assessment where applicable;
- professional review of Terms and Privacy Notice;
- public status/security pages;
- separate decision on repository software licensing/source-available strategy.

## Phase 7 — Controlled external beta

- onboard a small number of external organizations;
- verify isolation before each onboarding wave;
- measure activation, retention, errors and cost per organization;
- structured feedback;
- Portuguese and English support;
- release freeze/rollback rules;
- validate the developer-adoption roadmap with real engineering teams.

## Phase 8 — International launch

- commercial site in English and Portuguese;
- public product docs/help center;
- pricing;
- status page;
- sales/support process;
- signed stable releases;
- stable auto-update;
- reviewed Terms, Privacy and Security policies;
- continuous monitoring of conversion, uptime, latency and cost;
- clear onboarding paths for individual developers and organizations.

## 🔭 Connection to the Evolution Roadmap

| Evolution feature | International foundation |
| --- | --- |
| GitHub Org Integration | multi-org permissions + integration security |
| Command Palette | permission-aware navigation |
| GitHub Pulse | webhook reliability + Realtime isolation |
| CLI | secure auth + stable API |
| PR War Rooms | tenant isolation + event model |
| Context Graph | permission-aware data + retention controls |
| Public Dev Profile | explicit public/private projection + consent |
| Developer Platform | stable APIs + scoped credentials + abuse controls |

## 🚧 What blocks broad commercial launch today

Public development is not blocked. A broad commercial release still requires validated multi-organization isolation, signed desktop distribution, updater/rollback, restoration testing, structural i18n, mature observability/support, billing boundaries, external beta evidence, integration security testing and professional legal review.

## ✅ Completion rule

A phase is complete only with test evidence, a responsible owner, updated documentation, recovery/rollback planning when applicable, security/privacy review for affected boundaries, and owner approval.

<p align="center">🌌　⭐　🪐　🌍　🚀　🛰️　🌍　🪐　⭐　🌌</p>

<p align="center"><strong>Global product. Private organizations. Explicit public surfaces.</strong></p>
