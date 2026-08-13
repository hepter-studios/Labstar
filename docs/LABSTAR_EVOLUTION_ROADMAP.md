# ✨ Labstar Evolution Roadmap

> From an internal company tool to a developer-first platform people choose to install.

Updated: **August 13, 2026**.

This roadmap defines the product evolution required to make Labstar valuable not only because a company adopts it, but because individual developers actively want it in their workflow.

The order is intentional: first remove onboarding friction, then create daily utility, then deepen collaboration, and only after that add network effects and a public ecosystem.

---

## 🌌 Product model — decision resolved

The old model treated Labstar itself as a private internal product. That is no longer the target.

The new model is:

> **Labstar is a public product. Organizations created inside Labstar are private by default.**

This resolves the strategic conflict that previously blocked public developer features.

### What can be public

- Labstar itself;
- public product documentation;
- the public repository and development roadmap;
- public landing/product surfaces;
- an optional developer profile explicitly enabled by the user;
- deliberately aggregated or user-approved activity.

### What remains private by default

- organization membership;
- channels and direct messages;
- projects and operational data;
- connected repositories when the organization marks them private;
- internal GitHub events and CI information;
- roles, permissions, files and attachments;
- company-specific Context Graph data;
- War Rooms and internal incidents.

### Security rule

A public feature must never become a shortcut around organization authorization.

Public data should be generated from a dedicated public projection or explicit opt-in record — **not by making private organization tables readable from the public internet**.

---

## ⭐ Existing Labstar foundations to reuse

The features below are not greenfield infrastructure. Labstar already contains important pieces that should be extended instead of rebuilt.

### Realtime

Supabase Realtime is already part of the architecture through messaging, Presence and Broadcast.

Reuse it for:

- GitHub Pulse;
- live developer status;
- War Room updates;
- CI activity;
- lightweight live operational events.

Do not create a parallel realtime stack unless scale or reliability measurements later prove it necessary.

### Company directory and roles

Labstar already has role and organizational concepts.

GitHub organization sync should become an **input** to that directory rather than replacing the Labstar model entirely.

GitHub Teams may seed squads and membership, while Labstar keeps organization-specific roles, business departments and permissions that do not exist in GitHub.

### Invitations and membership

The invitation system can evolve from purely manual onboarding to policy-driven onboarding.

Examples:

- invite a verified member of a connected GitHub organization;
- auto-suggest GitHub Org members to admins;
- optionally auto-approve members matching an organization policy;
- immediately revoke or review access when upstream membership changes.

Never assume GitHub membership alone should always grant Labstar access. The organization administrator remains in control.

### Resilient account switching

Labstar already contains work to keep account switching usable even during backend failures.

That reliability should be treated as a product quality principle, not only a historical bugfix.

### Desktop deep links

The desktop flow already uses:

```text
labstar://auth/callback
```

The same deep-link infrastructure can later support actions such as:

```text
labstar://pr/42
labstar://room/pr/42
labstar://squad/platform
labstar://member/username
```

The CLI can open these directly in the desktop application.

### Discord-inspired interaction model

Existing channels, rooms, messaging surfaces and organization navigation should be reused by Command Palette and War Rooms.

The goal is to make developer workflows feel native to Labstar, not to create a disconnected second application inside the product.

---

# 🚀 Implementation order

## Phase 1 — Remove onboarding friction

### 1. GitHub Organization Integration

**What it is**

Connect a GitHub organization to Labstar and use its real structure as an onboarding source: members, teams, repositories and relevant permissions.

**Why it matters**

A company should not manually rebuild inside Labstar what already exists in GitHub.

This is the largest avoidable adoption cost for software teams.

**Implementation direction**

Prefer a **GitHub App** for organization/repository access and webhooks, while OAuth remains useful for user identity.

This is safer and more scalable than requesting a permanently broad classic OAuth `repo` scope from every user.

Minimum design:

- install GitHub App into an organization;
- request only the repository/organization permissions actually required;
- read organization membership and teams;
- allow an admin to choose which repositories Labstar can access;
- map GitHub Teams → suggested Labstar squads;
- map GitHub members → suggested organization members;
- preserve Labstar-specific roles and permissions;
- store external IDs for stable synchronization;
- support incremental synchronization through GitHub webhooks;
- maintain an audit trail for membership changes.

Relevant GitHub events can include organization membership, teams, repositories and installation changes.

**Privacy requirement**

Connecting GitHub must not make repository activity public. Data belongs to the connected Labstar organization unless a separate user-controlled public projection is created.

**Depends on:** existing identity/auth foundation.

---

### 2. Command Palette — `Cmd+K` / `Ctrl+K`

**What it is**

Fast keyboard-first navigation across the entire product.

**Why it matters**

Developers evaluate perceived speed almost immediately. A good command palette changes Labstar from “a web dashboard” into something that feels like a developer tool.

**MVP index**

- organizations;
- squads;
- channels;
- members;
- projects;
- settings;
- recent PRs when GitHub integration exists;
- common actions such as switch organization, create room or open notifications.

**Implementation direction**

- global fuzzy search layer;
- action registry rather than hard-coded one-off buttons;
- web keyboard shortcut;
- Tauri integration where native shortcut behavior is useful;
- recent/frequent actions ranked locally;
- permissions applied before a result is shown.

**Depends on:** nothing critical. Can ship in parallel with GitHub Org Integration.

---

## Phase 2 — Give developers a reason to keep Labstar open

### 3. GitHub Pulse — live engineering presence

**What it is**

Turn real GitHub events into live team context inside Labstar.

Examples:

- push;
- pull request opened/updated/merged;
- review requested or submitted;
- CI/check success and failure;
- deployment event;
- repository activity relevant to the current user.

**Why it matters**

This creates a daily retention loop. Labstar becomes where a developer sees what is happening around the team without manually checking multiple services.

**Implementation direction**

- GitHub App webhook receiver;
- signature verification before processing;
- idempotent event ingestion;
- normalized internal event model;
- durable event record where required;
- Realtime publication for active clients;
- native Tauri notification when an event requires the current user's attention;
- per-user and per-organization notification controls;
- event deduplication and rate control.

**Do not** mirror every GitHub event into chat. Pulse should prioritize relevance rather than generate noise.

**Depends on:** GitHub Org Integration improves routing, but an individual-repository version can exist earlier.

---

### 4. Labstar CLI

**What it is**

A terminal companion using the same Labstar API instead of duplicating business rules.

Example direction:

```bash
labstar login
labstar status
labstar pr list
labstar pr open 42
labstar pr review 42
labstar squad
labstar room open pr:42
```

**Why it matters**

Developers spend large parts of the day in a terminal. Every action that avoids context switching increases product stickiness.

**MVP**

- `login`;
- `status`;
- `pr list`;
- `pr open <n>`;
- `squad`;
- open desktop deep links.

**Authentication direction**

Use a secure device/browser authorization flow. Do not ask users to paste long-lived production session tokens into shell history.

**Distribution direction**

Evaluate:

- npm / `npx` for the first broad developer distribution;
- Homebrew tap for macOS/Linux;
- native binaries later if startup performance and dependency footprint justify it.

**Depends on:** Pulse provides much richer `status` data, but authentication and navigation commands can ship earlier.

---

## Phase 3 — Own the collaboration around code

### 5. Automatic PR War Rooms

**What it is**

A contextual room linked to a pull request or failed CI run, automatically gathering the people and information required to resolve it.

**Why it matters**

Generic chat tools know a conversation happened. Labstar can know **why the conversation exists**, which PR caused it, which checks failed and who is responsible.

**Creation triggers**

Start conservative:

- manually create a War Room from a PR;
- automatically create one for failed protected checks when an organization enables the rule;
- optionally create one for high-priority PRs.

Avoid automatically creating a room for every ordinary PR by default; that would create noise.

**Room context**

- PR title and repository;
- author and requested reviewers;
- changed-file summary;
- build/check state;
- relevant logs or safe excerpts;
- deployment state;
- direct link to GitHub;
- linked project/squad.

**Lifecycle**

- create/open;
- realtime collaboration;
- record key decision/result;
- archive automatically after merge/close when policy allows;
- preserve searchable decision metadata.

**Depends on:** GitHub Pulse.

---

### 6. Labstar Context Graph / Project Memory

**Added to the roadmap because it can become a major long-term differentiator.**

**What it is**

A permission-aware graph connecting the technical and organizational history of a project:

```text
repository
   ↕
pull requests ↔ people ↔ squads
   ↕              ↕
issues         conversations
   ↕              ↕
incidents ↔ decisions ↔ documentation
   ↕
deployments / CI
```

The goal is not “add a chatbot”. The valuable layer is the **structured project memory underneath**.

A developer should eventually be able to ask:

- Why was this architecture decision made?
- Which PR introduced this behavior?
- Who last worked in this subsystem?
- Which incident was related to this file?
- What changed since the last release?
- Which open PRs are blocking this project?

**Why it matters**

Chat, source control and project tools all contain fragments of company memory. The company repeatedly pays the cost of reconstructing context.

If Labstar becomes the permission-aware map between those fragments, switching away becomes much more expensive because the product contains useful organizational memory rather than just messages.

**Implementation direction**

- define canonical entity IDs for project, repo, PR, issue, room, member and decision;
- build links from real product events instead of generating relationships only with AI;
- keep organization boundaries in every graph query;
- create an explicit “decision” artifact that can be promoted from a War Room or conversation;
- add full-text and structured search first;
- semantic retrieval/AI can be layered on top later;
- responses must cite underlying Labstar/GitHub artifacts;
- never train or expose cross-customer data without an explicit future policy and consent model.

**Depends on:** GitHub integration + Pulse + War Rooms make this dramatically more valuable.

---

## Phase 4 — Create distribution and network effects

### 7. Public Developer Profile

**What it is**

An optional public page such as:

```text
labstar.dev/@username
```

Potential information:

- verified GitHub identity;
- selected public repositories;
- selected verified contributions;
- selected squads/communities where disclosure is allowed;
- activity streaks only when they do not encourage unhealthy engagement patterns;
- developer skills inferred only from data the user chooses to expose;
- badges based on verifiable public activity rather than self-declared claims.

**Why it matters**

This creates an individual reason to join Labstar even before an employer requires it.

It also gives the product an organic distribution surface: profiles are shareable outside Labstar.

**Non-negotiable privacy rules**

- disabled by default;
- explicit user opt-in;
- organization admins cannot silently publish an employee profile;
- private repository names/activity never leak through aggregation;
- preview exactly what becomes public before publishing;
- one-click unpublish;
- public data stored as a separate projection with clear provenance.

**Depends on:** GitHub identity + integration + event model. War Room/private activity is not required to be public.

---

### 8. Developer Platform, SDK & Automations

**Added to the roadmap because ecosystem leverage can be more valuable than adding dozens of first-party integrations manually.**

**What it is**

Turn Labstar into a platform other developers can extend.

Potential surfaces:

- public API;
- scoped personal/organization tokens;
- outgoing webhooks;
- incoming signed events;
- slash/command actions;
- automation rules;
- lightweight extension SDK;
- integration directory or marketplace later.

**Why it matters**

A team will always need one integration Hepter Studios has not built yet. A safe extension layer lets users solve their own long-tail needs and creates an ecosystem around Labstar.

**MVP direction**

Start with an automation/event API rather than arbitrary in-process plugins.

Example:

```text
WHEN check.failed
IF repository = api
THEN open war-room + notify backend-squad
```

This is easier to secure and operate than executing third-party code inside the Labstar desktop app.

**Depends on:** stable API contracts, event model and permission system.

---

# 🪐 Phase map

| Phase | Goal | Main deliverables |
| --- | --- | --- |
| **0** | Product model | public platform + private organizations |
| **1** | Activation | GitHub Org Integration + Command Palette |
| **2** | Daily retention | GitHub Pulse + CLI |
| **3** | Deep team value | War Rooms + Context Graph |
| **4** | Organic distribution | Public Dev Profile + Developer Platform |
| **5** | Commercial/global scale | billing, enterprise controls, i18n, compliance, global infrastructure |

The international/commercial work is tracked separately in [`INTERNATIONAL_RELEASE_ROADMAP.md`](INTERNATIONAL_RELEASE_ROADMAP.md).

---

# 🛰️ Dependency graph

```text
GitHub Org Integration ───────────────┐
        │                             │
        ├────────► GitHub Pulse ──────┼────► PR War Rooms
        │                 │           │           │
        │                 ├────► CLI  │           ▼
        │                 │           └────► Context Graph
        │                 │                       │
        │                 └──────────────┐        │
        ▼                                ▼        ▼
Public Dev Profile ◄──────────── public projections / opt-in

Command Palette ── independent early win

Stable API + Events ─────────────► Developer Platform / Automations
```

---

# 🌠 Product metrics that decide whether the roadmap is working

Do not judge these features only by whether they were shipped.

Measure whether they change behavior.

### Activation

- time from account creation to first useful organization state;
- percentage of GitHub-connected organizations that finish onboarding;
- number of manual setup steps removed by GitHub sync.

### Developer retention

- developers who voluntarily install desktop/CLI;
- weekly active developers;
- useful Pulse interactions versus muted/ignored events;
- Command Palette usage;
- percentage of CLI users returning weekly.

### Collaboration

- PRs resolved through War Room workflows;
- time from CI failure to first relevant response;
- decisions captured and later reopened from project memory.

### Distribution

- public developer profiles voluntarily published;
- profile-driven signups;
- organizations created by users who first joined individually;
- third-party automations/integrations created.

### Business

- organization activation;
- conversion to paid plans when billing exists;
- retention by company size;
- cost to serve per active organization;
- expansion inside existing organizations.

---

# 🔐 Guardrails

Developer adoption is not worth destroying trust.

Every roadmap item should preserve these rules:

1. **private organization data stays private by default;**
2. **public profile data is opt-in;**
3. **GitHub permissions use least privilege;**
4. **backend authorization remains authoritative;**
5. **webhook signatures are verified;**
6. **event ingestion is idempotent and auditable;**
7. **notifications optimize relevance, not engagement spam;**
8. **AI/search never crosses organization boundaries;**
9. **public source visibility does not imply public customer data;**
10. **major integration permissions must be explainable to an administrator.**

---

# 💫 What can actually make Labstar difficult to replace

No roadmap can make business success or wealth guaranteed. The strongest path is to build compounding advantages rather than a larger checklist of features.

The most defensible combination in this plan is:

> **GitHub-native onboarding + live engineering events + contextual collaboration + permission-aware project memory + a developer extension ecosystem.**

Any one of those features can be copied. Their integration into one coherent graph of **people + code + decisions + operations** is much harder to reproduce well.

That is the long-term strategic direction behind this roadmap.

---

<p align="center">
  ✦　🌌　⭐　🪐　🚀　🛰️　🪐　⭐　🌌　✦
</p>

<p align="center"><strong>Build the product developers choose — then make it the place their company cannot afford to lose context.</strong></p>
