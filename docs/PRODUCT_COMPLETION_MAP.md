# Labstar Product Completion Map

Updated: 10 August 2026.

This document is the product map for taking Labstar from the current internal build to a convincing, sellable developer-work operating system. It is intentionally broader than a release checklist: it defines what the product must become, what order the work should follow, and which technologies are justified for each responsibility.

## Product position

Labstar is **not a social network** and should not drift toward feed-first engagement patterns.

The target is a private operating environment for companies, engineering teams, research teams and software projects where communication, repositories, work, permissions, files, meetings, automation and operational context live together.

The closest mental model is:

```text
GitHub organization/workflows
+ Discord-grade realtime communication
+ project operations
+ team/permission management
+ developer tooling
= Labstar
```

The goal is not to clone GitHub or Discord. Labstar should make the common work that currently jumps between those products feel native in one place.

## Product hierarchy

The canonical hierarchy is:

```text
Account
└── Organization
    ├── Spaces
    │   ├── Company
    │   ├── Product
    │   ├── Project
    │   └── Team
    ├── Repositories / Developer surfaces
    ├── Channels
    ├── Direct messages
    ├── Work items / Boards
    ├── Meetings / Voice / Video
    ├── Members / Roles / Permissions
    ├── Integrations / Automations
    └── Settings / Audit / Billing
```

**Organization** is the root commercial boundary. A person can belong to multiple organizations and switch between them. Data from one organization must never appear in another organization unless an explicit cross-organization feature is designed later.

The existing Hepter Studios workspace is the primary legacy organization and must remain intact while multi-organization support is introduced.

---

# Phase A — Organization foundation

Status: **in progress**.

Required outcome:

- organization table and membership model;
- existing Hepter Studios workspace preserved as the primary organization;
- create organization flow;
- organization switcher;
- new organizations start isolated and empty;
- no legacy workspace data appears while a secondary organization is selected;
- next migration scopes spaces, channels, roles, projects and integrations by organization;
- invitations target an organization;
- organization owner/admin/member/viewer roles become independent from global identity;
- audit logs include organization ID;
- deletion/export can operate per organization.

Exit criterion: two organizations can be used by the same account without any cross-organization data leakage in frontend, API, RLS, Realtime, Storage or background jobs.

---

# Phase B — Language and internationalization

English is the **source language and fallback language** of Labstar.

Initial locales:

- `en` — canonical product language and fallback;
- `pt-BR` — first full translation.

Expected behavior:

- first launch reads OS/browser locale automatically;
- supported locale is selected automatically when possible;
- unsupported locales fall back to English;
- user can override language in Settings;
- organization can define a default locale for new members;
- user preference overrides organization default;
- dates, numbers, time, currencies and relative time use locale-aware formatters;
- timezone is independent from language;
- emails, notifications, system messages and onboarding use the recipient locale;
- hard-coded UI strings are progressively removed from React components;
- translation keys use English semantic identifiers;
- layouts are tested with longer translated strings;
- RTL readiness is added before an RTL locale is shipped.

Recommended resolution order:

```text
user preference
→ organization default
→ operating system / browser locale
→ English
```

Exit criterion: an English-only organization can complete every required workflow without encountering Portuguese hard-coded text.

---

# Phase C — Developer-native workspaces

The application still needs more reasons for a programmer or technical company to keep Labstar open all day.

## Repository surface

Each project/space should be able to connect one or more repositories and expose:

- repository overview;
- README and project documents;
- branches;
- commits;
- pull requests;
- code review state;
- issues;
- releases/tags;
- CI checks and failed jobs;
- deployment state;
- contributors;
- linked domains/environments;
- repository files that are useful to project operations;
- open in GitHub for advanced source browsing.

Labstar should not attempt to replace Git hosting. It should make repository state operationally available next to the team and conversation that acts on it.

## Work surfaces to add

- **Code / Repositories** — repository state and development activity;
- **Pull requests** — review queue and failing checks;
- **Issues** — engineering issues linked to channels and work items;
- **CI / Runs** — builds, checks, logs and retry actions where permitted;
- **Deployments** — Vercel/Cloudflare/Fly/other environment status;
- **Environments** — production, staging and development links/secrets metadata (never secret values in the browser);
- **Packages / Releases** — release artifacts and versions;
- **Incidents** — operational incidents linked to monitoring and conversation;
- **Docs** — Markdown, README, decisions, specifications and attachments;
- **Automations** — repository/webhook/agent rules with destination channels;
- **Developer command palette** — jump to repository, channel, member, issue, PR, deployment or command.

## Reference syntax

The existing smart composer direction should become consistent across the product:

- `@person` — members;
- `#channel` — channels;
- repository/project reference syntax for developer entities;
- command syntax for explicit actions;
- suggestions narrow as the user types and complete the most likely unique match.

---

# Phase D — Communication: Discord strengths without social-network behavior

Keep the parts that are valuable for work:

- persistent text channels;
- categories;
- private channels;
- role/member access;
- direct messages;
- replies;
- edit/delete;
- attachments;
- Markdown/code blocks;
- mentions;
- pinned messages;
- search;
- voice rooms;
- video meetings;
- presence;
- notifications;
- right-click/context actions;
- integrations that post structured operational events into channels.

Avoid product patterns whose main purpose is social engagement:

- algorithmic feed;
- follower economy;
- public popularity metrics;
- engagement farming;
- unrelated recommendations;
- infinite discovery surface.

Communication exists to move work forward.

---

# Phase E — Integrations in one place

## GitHub — first-class

GitHub should be deeply integrated rather than represented by a repository URL field.

Priorities:

1. repositories and organization installation;
2. PRs/reviews/checks;
3. issues;
4. Actions/workflow runs;
5. releases;
6. deployment/repository events routed to Labstar channels;
7. create/open/triage actions with explicit permission;
8. repository-aware search and command palette.

## Discord — migration/interoperability

Useful Discord compatibility:

- import/reference channel and role structures where technically and legally appropriate;
- Discord webhook/event bridge;
- route selected Labstar notifications to Discord during migration periods;
- preserve familiar channel/voice interaction patterns;
- do not make Discord a required dependency for core Labstar communication.

## Other high-value developer environments

Add based on real demand, not logo count:

- GitLab;
- Bitbucket;
- Vercel;
- Cloudflare;
- Fly.io;
- Supabase;
- Sentry;
- Datadog/Grafana-compatible monitoring;
- Linear;
- Jira;
- Slack/Microsoft Teams bridges for companies that need coexistence;
- Docker/container registries;
- package registries;
- calendars and transactional email.

Each integration should map to a common Labstar event model so the UI does not become a collection of unrelated plugins.

---

# Phase F — Mobile product

Responsive web is not the final mobile product.

Required before calling mobile complete:

- stable 320–430 px layouts;
- safe-area handling;
- touch targets and gestures;
- no desktop panes leaking into mobile;
- channels/DMs as one-surface-at-a-time navigation;
- native push notifications;
- camera/photo/file sharing;
- voice/video background behavior where the OS permits;
- deep links;
- share-to-Labstar;
- offline/reconnect states;
- mobile onboarding and organization switcher;
- Android and iOS packaging strategy;
- device matrix and automated visual tests.

Tauri 2 mobile remains the first shell candidate. Native Kotlin/Swift modules should only be added when a platform capability genuinely requires them.

---

# Phase G — Desktop product

The desktop application must feel intentionally desktop-native, not like a browser page in a window.

Required:

- signed Windows builds;
- updater with signed manifests and rollback;
- tray/menu integration;
- deep links;
- file drag-and-drop;
- native notifications;
- system media permissions;
- window state persistence;
- multi-window/floating call behavior where useful;
- startup behavior;
- protocol handlers;
- keyboard shortcuts;
- native share/open-file flows;
- crash diagnostics;
- Windows 10/11 matrix;
- macOS packaging/notarization when targeted;
- Linux package strategy when targeted.

---

# Phase H — Architecture and language strategy

Do **not** add programming languages merely because Discord or another large company uses them. Large systems become polyglot because different workloads eventually justify different runtimes.

Labstar should evolve by responsibility:

| Technology | Intended responsibility |
| --- | --- |
| TypeScript + React | web/product UI |
| Rust | trusted API, desktop/native core, security-sensitive services, performance-critical backend |
| PostgreSQL | durable relational state, authorization data and audit history |
| Supabase Auth/Realtime/Storage | identity and managed platform services while they remain the best fit |
| Python | AI/ML, research automation, data/agent workers when needed |
| Go | high-concurrency infrastructure/agents only when a service clearly benefits from it |
| Elixir/Phoenix | realtime/presence/event systems only if measured scale makes the current realtime layer inadequate |
| C++ | low-level media/SDK/performance modules only when Rust/platform APIs cannot reasonably cover them |
| Kotlin | Android-native modules when Tauri/plugins do not provide the required capability |
| Swift | iOS/macOS-native modules when required |

The target is **the smallest set of languages that solves the measured problems well**, not a language checklist.

Before adding a runtime, document:

1. the bottleneck or platform need;
2. why the existing stack is insufficient;
3. deployment/observability implications;
4. ownership and maintenance cost;
5. rollback path.

---

# Phase I — Reliability, security and enterprise readiness

- organization-scoped RLS everywhere;
- API authorization tests;
- Storage path isolation;
- Realtime topic isolation;
- rate limits;
- audit log;
- secret rotation;
- backups and restore drills;
- incident response;
- observability;
- feature flags;
- staged migrations;
- rollback procedures;
- performance budgets;
- accessibility checks;
- automated end-to-end flows;
- visual regression matrix for desktop and mobile.

---

# Phase J — Commercial product

A technically powerful app can still feel poor if onboarding and product framing are weak.

Before external sales, add:

- organization onboarding;
- templates for software company / startup / research team / game studio;
- guided GitHub connection;
- sample project or import existing repositories;
- empty states that explain the next action;
- organization branding;
- member invitation and onboarding;
- plan/usage limits;
- billing when pricing is finalized;
- export/delete controls;
- documentation/help center;
- status/security pages;
- terms/privacy/compliance work;
- product analytics focused on activation and reliability, not social engagement.

---

# Recommended execution order

```text
1. Organization foundation
2. Real organization data isolation
3. i18n foundation (English canonical + pt-BR)
4. Developer-native repository/PR/issue/CI surfaces
5. GitHub integration depth
6. Communication reliability + voice/video
7. Mobile stabilization + native packaging
8. Desktop signing/updater/native experience
9. Integration ecosystem
10. Security/observability/load testing
11. Onboarding/templates/commercial readiness
12. Controlled external beta
```

Do not start a large new language/runtime migration before steps 1–4 are structurally stable.

## Definition of “ready”

Labstar is not ready because it has many buttons. It is ready when a new technical organization can:

1. create an organization;
2. invite its team;
3. connect repositories;
4. create spaces/channels/projects;
5. communicate and meet;
6. see PR/issue/CI/deployment state;
7. turn messages into work;
8. manage permissions;
9. use the product in its supported language and timezone;
10. use web, mobile and desktop without broken layouts;
11. trust isolation, backups, audit and account controls;
12. understand the product without the founder explaining every screen.

That is the point at which the product itself can convince people to keep using it.
