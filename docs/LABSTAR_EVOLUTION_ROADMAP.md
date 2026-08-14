# ✨ Labstar Evolution Roadmap

> From an internal tool to a developer-first organization platform people choose to install.

Updated: **August 13, 2026**.

Labstar is being designed for **organizations**, not only companies. An organization can be a software team, startup, company, studio, research lab, open-source group, community, student team or any other group building and coordinating projects together.

The product model is:

> **Labstar is public. Organizations created inside Labstar are private by default.**

A company can use Labstar because a company is one kind of organization — not because companies are the only target.

---

## 🌌 What Labstar should become

Labstar should help an organization:

- organize members, squads, roles and permissions;
- communicate through channels, direct messages and realtime presence;
- build and monitor projects;
- connect repositories and engineering activity;
- follow pull requests, reviews, CI and deployments;
- keep technical decisions and project context searchable;
- automate repetitive operational work;
- move between web, desktop and terminal without losing context.

The goal is to become a workspace developers choose to use themselves, while still being strong enough for entire organizations to adopt.

---

## ⭐ Existing foundations to reuse

Labstar already has pieces that should be extended rather than rebuilt:

- **Supabase Realtime** for messages, Presence and Broadcast;
- **organization roles and directory concepts**;
- **invitations and membership flows**;
- **resilient account switching**;
- **Tauri deep links** such as `labstar://auth/callback`;
- **Discord-inspired channels and rooms**;
- **Rust/Axum API** for protected rules;
- **Supabase Auth, PostgreSQL and Storage**.

GitHub integration, Command Palette, Pulse and War Rooms should sit on top of those foundations.

---

# 🚀 Implementation order

## Phase 1 — Remove onboarding friction

### 1. GitHub Organization Integration

**Goal:** connect a GitHub organization and use its real structure as an onboarding source.

Use a **GitHub App** for organization/repository access and webhooks, while OAuth remains useful for user identity.

Minimum direction:

- install the GitHub App into an organization;
- request only required permissions;
- read teams, members and selected repositories;
- map GitHub Teams to suggested Labstar squads;
- map GitHub members to suggested organization members;
- preserve Labstar-specific roles and permissions;
- synchronize incrementally through webhooks;
- audit membership and permission changes.

Connecting GitHub must never make private repository activity public.

### 2. Command Palette — `Cmd+K` / `Ctrl+K`

**Goal:** make Labstar feel keyboard-first and fast.

Index:

- organizations;
- squads;
- channels;
- members;
- projects;
- repositories;
- recent PRs;
- settings;
- common actions.

Permissions must be applied before results are shown.

---

## Phase 2 — Give developers a reason to keep Labstar open

### 3. GitHub Pulse

Turn real engineering events into live context inside Labstar:

- pushes;
- pull requests;
- reviews;
- CI/check state;
- deployments;
- repository activity relevant to the current user.

Implementation should include signed webhook verification, idempotent ingestion, normalized events, Realtime publication and native Tauri notifications.

Pulse should prioritize relevance instead of mirroring every GitHub event into chat.

### 4. Labstar CLI

A terminal companion that uses the same Labstar API rather than duplicating domain rules.

```bash
labstar login
labstar status
labstar pr list
labstar pr open 42
labstar squad
labstar room open pr:42
```

Use a secure browser/device authorization flow. Do not require users to paste long-lived production session tokens into shell history.

Initial distribution can evaluate npm / `npx`, followed by Homebrew and native binaries where useful.

---

## Phase 3 — Own collaboration around code

### 5. Automatic PR War Rooms

Create a contextual room around a pull request or failed CI run.

A War Room can include:

- PR title and repository;
- author and reviewers;
- changed-file summary;
- CI/check state;
- relevant logs;
- deployment state;
- linked project and squad;
- direct GitHub link.

Start conservatively: manual creation first, then organization-controlled automatic rules for failed protected checks or high-priority work. Do not create a room for every PR by default.

### 6. Context Graph / Project Memory

This can become one of Labstar's strongest long-term differentiators.

The core idea is to connect:

```text
people ↔ code ↔ repositories ↔ PRs ↔ issues
   ↕                                  ↕
squads ↔ conversations ↔ decisions ↔ incidents
                     ↕
              docs / CI / deploys
```

Eventually a developer should be able to ask:

- Why was this architecture decision made?
- Which PR introduced this behavior?
- Who last worked in this subsystem?
- Which incident was related to this file?
- What changed since the last release?
- Which PRs are blocking this project?

Build structured links first. AI can be layered on top later. Search and AI must always respect organization boundaries and cite the underlying artifacts.

---

## Phase 4 — Create organic distribution

### 7. Public Developer Profile

Optional public profile, for example:

```text
labstar.dev/@username
```

Possible content:

- verified GitHub identity;
- selected public repositories;
- selected verified contributions;
- user-approved squads or communities;
- verifiable public badges.

Privacy rules are non-negotiable:

- disabled by default;
- explicit user opt-in;
- organization admins cannot silently publish a member profile;
- private repository names or activity cannot leak through aggregation;
- preview exactly what becomes public;
- one-click unpublish;
- public data stored as a separate projection.

### 8. Developer Platform, SDK & Automations

Turn Labstar into something other developers can extend.

Potential surfaces:

- public API;
- scoped personal/organization tokens;
- outgoing webhooks;
- incoming signed events;
- command actions;
- automation rules;
- lightweight SDK;
- integration directory or marketplace later.

Start with an automation/event model rather than arbitrary third-party code inside the desktop app.

Example:

```text
WHEN check.failed
IF repository = api
THEN open war-room + notify backend-squad
```

---

# 🪐 Phase map

| Phase | Goal | Main deliverables |
| --- | --- | --- |
| **0** | Product model | public platform + private organizations |
| **1** | Activation | GitHub Org Integration + Command Palette |
| **2** | Daily retention | GitHub Pulse + CLI |
| **3** | Deep project value | War Rooms + Context Graph |
| **4** | Organic distribution | Public Dev Profile + Developer Platform |
| **5** | Global sustainability | plans, advanced controls, i18n, compliance and global infrastructure |

Global launch work is tracked in [`INTERNATIONAL_RELEASE_ROADMAP.md`](INTERNATIONAL_RELEASE_ROADMAP.md).

---

# 🛰️ Dependency graph

```text
GitHub Org Integration ────────┐
        │                      │
        ├────► GitHub Pulse ───┼────► PR War Rooms
        │             │        │            │
        │             ├──► CLI │            ▼
        │             │        └────► Context Graph
        ▼             ▼
Public Dev Profile   Realtime

Command Palette ── independent early win

Stable API + Events ─────────► Developer Platform / Automations
```

---

# 🌠 Metrics

### Activation

- time from account creation to first useful organization state;
- GitHub-connected organizations completing onboarding;
- manual setup steps removed by sync.

### Developer retention

- voluntary desktop/CLI installs;
- weekly active developers;
- Command Palette usage;
- useful Pulse interactions;
- returning CLI users.

### Collaboration

- PRs resolved through War Rooms;
- time from CI failure to relevant response;
- decisions captured and later recovered from project memory.

### Distribution

- public profiles voluntarily published;
- profile-driven signups;
- organizations created by individual users;
- third-party automations and integrations.

### Sustainability

- organization activation;
- paid conversion when plans exist;
- retention by organization type and size;
- cost to serve per active organization;
- expansion inside existing organizations.

---

# 🔐 Guardrails

1. Private organization data stays private by default.
2. Public profile data is opt-in.
3. GitHub permissions use least privilege.
4. Backend authorization remains authoritative.
5. Webhook signatures are verified.
6. Event ingestion is idempotent and auditable.
7. Notifications optimize relevance, not engagement spam.
8. AI/search never crosses organization boundaries.
9. Public source visibility does not imply public organization data.
10. Major integration permissions must be explainable to an administrator.

---

# 💫 Strategic advantage

No roadmap can guarantee product success. The strongest path is to build advantages that compound together.

The most defensible combination in this plan is:

> **GitHub-native onboarding + live engineering events + contextual collaboration + permission-aware project memory + a developer extension ecosystem.**

Any one feature can be copied. Their integration into one coherent graph of **people + code + projects + decisions + operations** is much harder to reproduce well.

---

<p align="center">✦　🌌　⭐　🪐　🚀　🛰️　🪐　⭐　🌌　✦</p>

<p align="center"><strong>Build the product developers choose — then make it the place their organization never wants to lose context.</strong></p>
