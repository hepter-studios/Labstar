# Privacy Notice — Pre-Release Draft

**Status:** product/privacy planning draft. This is not a finalized commercial privacy notice and should receive professional legal review before broad public launch.

Updated: **August 13, 2026**.

## 1. Privacy model

Labstar is being designed around one central boundary:

> **The platform can be public; organization data is private by default.**

Public repository visibility does not expose organization workspaces, messages, projects, repositories, files or internal activity.

## 2. Data categories the product may process

Depending on enabled features, Labstar may process:

- account identity such as name, email and avatar;
- authentication identifiers from supported identity providers;
- organization membership, roles and permissions;
- channels, messages and collaboration metadata;
- project and operational records;
- files and attachments;
- connected GitHub organization/repository metadata;
- pull request, review, CI and deployment events when integrations are enabled;
- device/application diagnostics needed to operate desktop or web clients;
- audit/security events;
- user preferences such as language and notifications.

The final production notice must be aligned with the actual data collected at launch.

## 3. Organization data

Organization data should be isolated by organization at the database, API, Realtime and storage layers.

A user may only receive organization data when their account has the required membership and permission.

Public features should consume a separate intentionally public projection rather than weakening the protection of private organization records.

## 4. GitHub and third-party integrations

GitHub integration is planned to use least-privilege permissions and, where appropriate, a GitHub App for organization/repository access and webhooks.

OAuth may continue to be used for user identity.

Labstar should request only permissions required for enabled features and should explain meaningful permissions to organization administrators before connection.

Third-party services process data under their own policies in addition to Labstar's handling of integration data.

## 5. Public developer profile

A future public developer profile is planned as **opt-in**.

Privacy requirements:

- off by default;
- user-controlled publication;
- preview before publishing;
- no private repository names or private organization activity exposed automatically;
- organization administrators cannot silently publish an individual's profile;
- ability to unpublish;
- public profile data stored as a deliberate public projection with provenance.

## 6. Context Graph / project memory

The planned Context Graph may connect repositories, pull requests, projects, people, rooms, decisions, incidents and documentation.

The graph must remain permission-aware. Search, retrieval and future AI-assisted features must not cross organization boundaries.

Private customer data should not be used to train shared models without a future explicit policy, lawful basis and appropriate customer/user controls.

## 7. Telemetry and diagnostics

Product telemetry should be limited, transparent and configurable where practical.

The intended principle is to collect what is needed to understand reliability, performance and product health without turning private work content into analytics data.

Final telemetry behavior must be documented before broad commercial release.

## 8. Retention, export and deletion

Before commercial launch, Labstar should define and test:

- account data export;
- organization data export where appropriate;
- account deletion;
- organization deletion/closure;
- retention periods for backups, logs and audit records;
- behavior after integration removal;
- legal/contractual retention exceptions where applicable.

## 9. Security

Labstar's public reporting process is described in [`../../SECURITY.md`](../../SECURITY.md).

Security design priorities include organization isolation, least privilege, protected secrets, webhook validation, auditability and signed desktop distribution.

## 10. International processing

The international roadmap includes evaluation of LGPD, GDPR and other requirements applicable to launch jurisdictions.

The final privacy notice should identify the relevant controller/operator roles, purposes and lawful bases, subprocessors, international transfers, retention periods and data-subject rights based on the actual commercial architecture.

## 11. Children and age requirements

Age eligibility and any restrictions for the commercial product have not yet been finalized. They must be defined in the reviewed legal terms before broad launch.

## 12. Contact and legal review

Final commercial privacy materials should publish an appropriate privacy contact and any legally required controller/company information.

This draft should not be treated as a substitute for professional legal review.

Related documents:

- [`TERMS_OF_USE_DRAFT.md`](TERMS_OF_USE_DRAFT.md)
- [`../INTERNATIONAL_RELEASE_ROADMAP.md`](../INTERNATIONAL_RELEASE_ROADMAP.md)
- [`../LABSTAR_EVOLUTION_ROADMAP.md`](../LABSTAR_EVOLUTION_ROADMAP.md)
