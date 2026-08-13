<p align="center">
  <img src="docs/assets/labstar-readme-hero.webp" alt="Labstar" width="100%" />
</p>

<h1 align="center">Labstar</h1>

<p align="center">
  <strong>A business workspace for communication, projects, teams and operations.</strong>
</p>

<p align="center">
  <a href="https://labstar.pages.dev/">Web App</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-11.2.9-2563eb" />
  <img alt="React" src="https://img.shields.io/badge/React-19-20232a?logo=react&logoColor=61dafb" />
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-20232a?logo=tauri&logoColor=ffc131" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-backend-20232a?logo=rust&logoColor=white" />
  <img alt="Status" src="https://img.shields.io/badge/status-active%20development-0f766e" />
</p>

## About

**Labstar** is a business collaboration platform developed by **Hepter Studios**. It is designed to bring communication, organizational structure, projects and operational workflows into one connected environment.

Instead of separating company communication from the work itself, Labstar is being built around a single idea: **keep people, context and execution together**.

The repository is public so the product and its technical evolution can be followed openly while development continues.

## Core product areas

- **Workspaces and channels** for teams, departments and business contexts.
- **Direct communication and realtime experiences** for day-to-day collaboration.
- **Roles, permissions and invitations** for controlled company access.
- **Projects and operational organization** connected to communication.
- **External integrations** designed to bring events and workflows into Labstar.
- **Web/PWA and desktop** experiences built from the same product foundation.
- **Native desktop capabilities** powered by Tauri 2 and Rust.

## Current status

Current application version: **`11.2.9`**.

| Area | Technology / direction |
| --- | --- |
| Web / PWA | React 19 + TypeScript + Vite |
| Desktop | Tauri 2 + Rust |
| Backend | Rust + Axum |
| Authentication | Supabase Auth |
| Database | PostgreSQL / Supabase |
| Realtime | Supabase Realtime |
| Storage | Supabase Storage |
| Web deployment | Cloudflare Pages |
| API deployment | Fly.io |

> Labstar is under active development. Some areas are still being refined before broader business use.

## Architecture

```text
                         Labstar
                            │
              ┌─────────────┴─────────────┐
              │                           │
         Web / PWA                   Desktop App
  React 19 + TypeScript            Tauri 2 + Rust
              │                           │
              └─────────────┬─────────────┘
                            │
                     Rust / Axum API
                            │
              ┌─────────────┼─────────────┐
              │             │             │
             Auth       PostgreSQL     Realtime
              │                           │
              └──────────── Storage ──────┘
```

## Repository structure

```text
.
├── src/          # React application and product UI
├── src-tauri/    # Tauri 2 desktop application
├── backend/      # Rust/Axum backend
├── supabase/     # Database and Supabase resources
├── public/       # Public web assets
├── docs/         # Project documentation
├── scripts/      # Build and maintenance scripts
└── .github/      # CI and repository workflows
```

## Local development

### Requirements

- Node.js 22
- npm
- Rust 1.85+ for desktop/backend development

### Web

```bash
git clone https://github.com/hepter-studios/Labstar.git
cd Labstar
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Build the web application:

```bash
npm run build
```

Build the desktop application:

```bash
npm run desktop:build
```

## Roadmap

Labstar is moving toward a more complete business platform. Current priorities include:

- hardened desktop releases and updates;
- stronger multi-organization support;
- richer project and operational workflows;
- deeper business integrations;
- improved communication and notifications;
- internationalization;
- observability and production readiness;
- continued UI/UX polish across desktop and responsive layouts.

## Public repository

This repository is publicly visible for product transparency and development visibility. **No software license is currently included.** Unless a license is added, public source visibility does not grant permission to copy, redistribute or commercially reuse the code.

Development is currently maintained by **Hepter Studios**.

---

<p align="center">
  <strong>Labstar — organize the company, connect the team, keep the work in context.</strong>
</p>
