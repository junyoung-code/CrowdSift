# CrowdSift Rebrand Design

## 1. Goal

Complete the approved `CrowdSift` rebrand across the application, tests,
current documentation, generated product context, and newly-created technical
identifiers without changing API credentials, deleting user data, or rewriting
historical audit records.

## 2. Canonical names

| Use | Value |
| --- | --- |
| Product display name | `CrowdSift` |
| Package and slug name | `crowdsift` |
| Local development label | `CrowdSift Local Development` |
| Default workspace name | `내 CrowdSift` |
| Destructive confirmation phrase | `CROWDSIFT 데이터 삭제` |
| Stage 1 prompt version | `crowdsift-stage1-v2` |
| Stage 2 prompt version | `crowdsift-stage2-v2` |
| Dashboard summary prompt version | `crowdsift-dashboard-summary-v2` |
| YouTube OAuth state cookie | `crowdsift_youtube_oauth_state` |

## 3. Rebrand boundaries

### 3.1 User-facing application

Replace the product name in metadata, landing navigation and footer, sign-in,
application shell, accessible labels, YouTube connection guidance, dashboard
copy, settings, and data deletion controls. The existing icon may remain until
the UI implementation milestone defines a new CrowdSift logo asset.

No routes change. Google sign-in and YouTube authorization remain separate
flows, and the rebrand must not change their callback URLs.

### 3.2 Runtime and package identifiers

Change package metadata, global fixture guard keys, the YouTube OAuth state
cookie, test-only example hosts, and other newly-created runtime labels to the
lowercase `crowdsift` slug.

Environment variable names remain unchanged because they describe providers,
not the product. Secret values, OAuth client IDs, API keys, token encryption
keys, Supabase row IDs, and YouTube identifiers must never be modified.

### 3.3 AI prompt versions and audit history

Change the product name inside active system prompts and introduce the three
new `crowdsift-*-v2` prompt identifiers. Updating prompt text without advancing
the version is forbidden.

Existing database rows that contain the pre-rebrand v1 prompt identifiers
remain immutable. They describe analyses that were actually produced by the
earlier prompt. New model runs use the CrowdSift v2 identifiers.

### 3.4 Database defaults

Do not edit an applied migration. Add a new migration that:

1. changes the `workspaces.name` default to `내 CrowdSift`;
2. updates existing rows only when the name is exactly the former generated
   default;
3. leaves custom workspace names untouched.

The migration does not delete comments, analyses, feedback, actions, evidence,
or audit logs.

### 3.5 Documentation and references

Update active Markdown documentation, Codex guides, specifications, plans,
README links, and AGENTS instructions to use CrowdSift. Rename tracked files and
folders whose paths contain the former product slug.

Generate `docs/CrowdSift_Project_Context_v1.0.pdf` from the updated canonical
product context and remove the old binary from the active tree. Its original
bytes remain recoverable through Git history.

Untracked files whose names end in ` 2` are not silently deleted or merged.
They are user-owned duplicate copies and will be reported separately after the
tracked rebrand is complete.

### 3.6 Local infrastructure identifiers

The running Supabase project ID `commenthawk-real-vertical-slice` is a Docker
volume namespace rather than a customer-facing brand. It remains unchanged in
this pass to preserve the configured local Google login and current data.
Changing it requires recreating the local Supabase stack and is a separate,
explicitly destructive operation.

The local root directory also remains unchanged during this Codex task because
renaming the active workspace would invalidate open terminals and file links.
It is renamed only after the task and development server are closed.

## 4. External services

The following external changes cannot be inferred from local source and require
the account owner to confirm them:

- current GitHub repository display name and slug to `CrowdSift`;
- Google OAuth consent-screen application name and logo;
- Supabase cloud project display name, if a hosted project exists;
- deployment project name and public domain when Vercel is connected.

After the GitHub repository is renamed, the local `origin` URL can be updated to
the new URL without changing Git history.

Google Cloud project IDs, OAuth client IDs, API keys, and OpenAI project IDs are
stable provider identifiers. Already-created CrowdSift display labels are
sufficient; no credentials are regenerated for the rebrand.

## 5. Test strategy

The rebrand uses behavior-first tests:

1. update the landing, sign-in, application shell, and deletion tests to expect
   CrowdSift and verify that they fail against the current implementation;
2. update production copy and constants until those tests pass;
3. update prompt-version and evaluation tests first, verify the old identifiers
   fail, then update the prompt implementation;
4. add a pgTAP test for the new workspace default and exact legacy-name
   migration before adding the migration;
5. run a tracked-file scan that rejects active former-brand strings except for
   applied migrations and the explicitly preserved local Supabase project ID;
6. run all unit tests, evaluation tests, database tests, end-to-end tests that
   do not require external mutation, lint, and the production build.

## 6. Completion criteria

- Every active user-facing screen says CrowdSift.
- New prompt and runtime records use CrowdSift identifiers.
- Existing comments, analyses, login configuration, and credentials still work.
- The default workspace name is `내 CrowdSift`; custom names are unchanged.
- Canonical tracked documentation and filenames use CrowdSift.
- The only permitted tracked legacy strings are immutable applied migrations,
  the exact-name conversion migration, and the preserved local Supabase Docker
  namespace documented in this specification.
- All required tests, lint, and build pass with fresh output.
- Remaining account-owner actions are listed with exact console locations and
  expected values.
