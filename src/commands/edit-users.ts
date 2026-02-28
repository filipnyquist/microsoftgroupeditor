import { getAccessToken } from "../auth.js";
import {
  getUsersByDepartmentContains,
  updateUserDepartment,
  findGroupsByName,
  addUserToGroup,
  removeUserFromGroup,
  type GraphUser,
} from "../graph.js";

export interface EditUsersOptions {
  /** Item to search for in the comma-separated department field (default: "sexistenz"). */
  from: string;
  /** Replacement value for the matched item (default: ""). Empty string removes the item. */
  to: string;
  /** When true, perform the operation but only show what would change. */
  dryRun: boolean;
  /**
   * When true, sync group membership:
   *   - Remove user from any group named after the matched item (`from`).
   *   - Add user to any group named after the replacement item (`to`)
   *     (skipped when `to` is empty).
   */
  syncGroups: boolean;
}

/**
 * The department field is a comma-separated list of items (e.g. "sexistenz, engineering").
 * Split by ", ", replace any item that exactly matches `from` (case-insensitive) with `to`,
 * remove the item entirely when `to` is empty, then re-join.
 */
function replaceDepartment(department: string, from: string, to: string): string {
  const fromLower = from.toLowerCase();
  const updated = department
    .split(", ")
    .map((item) => (item.toLowerCase() === fromLower ? to : item))
    .filter((item) => item.length > 0);
  return updated.join(", ");
}

/**
 * Edit all users whose department field contains `opts.from`, replacing
 * that substring with `opts.to`, and optionally syncing group memberships.
 */
export async function runEditUsers(opts: EditUsersOptions): Promise<void> {
  const token = await getAccessToken();

  console.log(
    `Searching for users with "${opts.from}" in the department field…\n`
  );
  const users: GraphUser[] = await getUsersByDepartmentContains(token, opts.from);

  if (users.length === 0) {
    console.log(`No users found with "${opts.from}" in the department field.`);
    return;
  }

  console.log(
    `Found ${users.length} user(s) to update${opts.dryRun ? " (dry-run – no changes will be made)" : ""}:\n`
  );

  let updatedCount = 0;
  let errorCount = 0;

  for (const user of users) {
    const oldDept = user.department ?? "";
    const newDept = replaceDepartment(oldDept, opts.from, opts.to);
    const name = user.displayName ?? user.userPrincipalName;

    console.log(`  ${name} (${user.userPrincipalName})`);
    console.log(`    Department: "${oldDept}" → "${newDept}"`);

    if (opts.syncGroups) {
      await logGroupChanges(token, user, opts.from, opts.to, opts.dryRun);
    }

    if (opts.dryRun) {
      console.log(`    [dry-run] Skipped.\n`);
      continue;
    }

    try {
      await updateUserDepartment(token, user.id, newDept);

      if (opts.syncGroups) {
        await syncGroupMembership(token, user, opts.from, opts.to);
      }

      console.log(`    ✅  Updated.\n`);
      updatedCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    ❌  Error: ${msg}\n`);
      errorCount++;
    }
  }

  if (!opts.dryRun) {
    console.log(
      `Done. ${updatedCount} user(s) updated, ${errorCount} error(s).`
    );
  }
}

/** Print what group changes would be made (for both dry-run and live runs). */
async function logGroupChanges(
  token: string,
  user: GraphUser,
  fromItem: string,
  toItem: string,
  dryRun: boolean
): Promise<void> {
  const prefix = dryRun ? "[dry-run] Would remove from" : "Removing from";

  if (fromItem) {
    const oldGroups = await findGroupsByName(token, fromItem);
    for (const g of oldGroups) {
      console.log(`    ${prefix} group: "${g.displayName}"`);
    }
  }

  if (toItem) {
    const addPrefix = dryRun ? "[dry-run] Would add to" : "Adding to";
    const newGroups = await findGroupsByName(token, toItem);
    for (const g of newGroups) {
      console.log(`    ${addPrefix} group: "${g.displayName}"`);
    }
  }
}

/** Perform the actual group membership changes for a user. */
async function syncGroupMembership(
  token: string,
  user: GraphUser,
  fromItem: string,
  toItem: string
): Promise<void> {
  // Remove from groups matching the old department item
  if (fromItem) {
    const oldGroups = await findGroupsByName(token, fromItem);
    for (const g of oldGroups) {
      await removeUserFromGroup(token, g.id, user.id);
      console.log(`    Removed from group: "${g.displayName}"`);
    }
  }

  // Add to groups matching the new department item
  if (toItem) {
    const newGroups = await findGroupsByName(token, toItem);
    for (const g of newGroups) {
      await addUserToGroup(token, g.id, user.id);
      console.log(`    Added to group: "${g.displayName}"`);
    }
  }
}
