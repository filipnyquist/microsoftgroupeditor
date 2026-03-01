# microsoftgroupeditor

A Bun/TypeScript CLI tool that edits the `department` field of Microsoft 365 users and
dynamically syncs their group memberships based on the new department value.

## Features

- **`login`** – Device-code OAuth2 login (no secrets stored; tokens cached locally).
- **`logout`** – Clear the cached token.
- **`list-users`** – List all users with a given string in their `department` field.
- **`edit-users`** – Replace a substring in users' `department` field and (optionally)
  add/remove them from groups whose name matches the old/new department value.

## Prerequisites

1. **Bun ≥ 1.0** – https://bun.sh/docs/installation
2. An **Azure App Registration** with these delegated permissions:
   - `User.ReadWrite.All`
   - `Group.ReadWrite.All`
   - `Directory.Read.All`

   Enable **"Allow public client flows"** (device-code) in the app registration's
   Authentication settings.

## Setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/filipnyquist/microsoftgroupeditor
cd microsoftgroupeditor
bun install

# 2. Set your Azure App Registration credentials
export AZURE_CLIENT_ID="<your-client-id>"
export AZURE_TENANT_ID="<your-tenant-id>"   # or "common" for multi-tenant

# Or place them in a .env file (never commit this file):
# AZURE_CLIENT_ID=...
# AZURE_TENANT_ID=...
```

## Usage

```bash
# Authenticate (device-code flow – opens a browser URL)
bun run start login

# List users with "sexistenz" in their department
bun run start list-users

# List users with a custom department filter
bun run start list-users --filter "engineering"

# Output as JSON
bun run start list-users --json

# Dry-run: preview what would change (no modifications made)
bun run start edit-users --dry-run

# Replace "sexistenz" with "" (empty) in department for all matching users
bun run start edit-users

# Replace "sexistenz" with "Engineering" and sync group memberships
bun run start edit-users --from "sexistenz" --to "Engineering" --sync-groups

# Log out (clear cached token)
bun run start logout
```

### Group sync (`--sync-groups`)

When `--sync-groups` is specified:

1. For each matching user the tool finds **groups whose `displayName` equals the old
   department value** and **removes** the user from those groups.
2. It then finds **groups whose `displayName` equals the new department value** and
   **adds** the user to those groups (skipped when `--to` is empty).

This lets you maintain group memberships dynamically based on the `department` field.

## Token cache

After a successful `login`, the access token is cached at:

```
~/.config/microsoftgroupeditor/token-cache.json
```

The file is written with mode `0600` (owner read/write only).
