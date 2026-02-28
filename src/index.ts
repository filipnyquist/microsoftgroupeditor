#!/usr/bin/env bun
import { Command } from "commander";
import { runLogin, runLogout } from "./commands/login.js";
import { runListUsers } from "./commands/list-users.js";
import { runEditUsers } from "./commands/edit-users.js";

const program = new Command();

program
  .name("msgedit")
  .description(
    "CLI tool for editing Microsoft 365 user department fields and syncing group memberships."
  )
  .version("1.0.0");

// ── login ──────────────────────────────────────────────────────────────────
program
  .command("login")
  .description(
    "Authenticate with Microsoft 365 via device-code flow. " +
      "Opens a browser URL for you to sign in; tokens are cached locally."
  )
  .action(async () => {
    try {
      await runLogin();
    } catch (err: unknown) {
      console.error("Login failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ── logout ─────────────────────────────────────────────────────────────────
program
  .command("logout")
  .description("Remove the cached authentication tokens.")
  .action(async () => {
    try {
      await runLogout();
    } catch (err: unknown) {
      console.error("Logout failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ── list-users ─────────────────────────────────────────────────────────────
program
  .command("list-users")
  .description(
    'List all users whose department field contains the given filter string (default: "sexistenz").'
  )
  .option(
    "-f, --filter <text>",
    'Filter string to search for in the department field.',
    "sexistenz"
  )
  .option("--json", "Output results as JSON.", false)
  .action(async (opts: { filter: string; json: boolean }) => {
    try {
      await runListUsers({ filter: opts.filter, json: opts.json });
    } catch (err: unknown) {
      console.error(
        "list-users failed:",
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    }
  });

// ── edit-users ─────────────────────────────────────────────────────────────
program
  .command("edit-users")
  .description(
    'Find users whose department contains "--from" and replace that substring with "--to". ' +
      "Optionally syncs group memberships based on the old and new department values."
  )
  .option(
    "--from <text>",
    'Department substring to search for and replace.',
    "sexistenz"
  )
  .option(
    "--to <text>",
    "Replacement value for the matched department substring.",
    ""
  )
  .option(
    "--sync-groups",
    "Remove the user from groups named after the old department value and " +
      "add them to groups named after the new department value.",
    false
  )
  .option(
    "--dry-run",
    "Show what would change without making any modifications.",
    false
  )
  .action(
    async (opts: {
      from: string;
      to: string;
      syncGroups: boolean;
      dryRun: boolean;
    }) => {
      try {
        await runEditUsers({
          from: opts.from,
          to: opts.to,
          syncGroups: opts.syncGroups,
          dryRun: opts.dryRun,
        });
      } catch (err: unknown) {
        console.error(
          "edit-users failed:",
          err instanceof Error ? err.message : err
        );
        process.exit(1);
      }
    }
  );

program.parse(process.argv);
