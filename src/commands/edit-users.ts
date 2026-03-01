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

/** Split a comma-separated department string into trimmed, non-empty items. */
function splitItems(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

/**
 * The department field is a comma-separated list of items (e.g. "draften, engineering").
 * Replace any item that exactly matches `from` (case-insensitive) with all items from `to`
 * (which may itself be comma-separated, e.g. "draften, sexistenz").
 * Items that already exist elsewhere in the list are not duplicated.
 * When `to` is empty the matched item is removed entirely.
 */
function replaceDepartment(department: string, from: string, to: string): string {
  const fromLower = from.toLowerCase();
  const toItems = splitItems(to);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of splitItems(department)) {
    if (item.toLowerCase() === fromLower) {
      for (const newItem of toItems) {
        const key = newItem.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(newItem);
        }
      }
    } else {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
  }
  return result.join(", ");
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
      await logGroupChanges(token, user, oldDept, newDept, opts.dryRun);
    }

    if (opts.dryRun) {
      console.log(`    [dry-run] Skipped.\n`);
      continue;
    }

    try {
      await updateUserDepartment(token, user.id, newDept);

      if (opts.syncGroups) {
        await syncGroupMembership(token, user, oldDept, newDept);
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
  const { toRemove, toAdd } = diffItems(fromItem, toItem);

  for (const item of toRemove) {
    const groups = await findGroupsByName(token, item);
    const prefix = dryRun ? "[dry-run] Would remove from" : "Removing from";
    for (const g of groups) {
      console.log(`    ${prefix} group: "${g.displayName}"`);
    }
  }

  for (const item of toAdd) {
    const groups = await findGroupsByName(token, item);
    const prefix = dryRun ? "[dry-run] Would add to" : "Adding to";
    for (const g of groups) {
      console.log(`    ${prefix} group: "${g.displayName}"`);
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
  const { toRemove, toAdd } = diffItems(fromItem, toItem);

  for (const item of toRemove) {
    const groups = await findGroupsByName(token, item);
    for (const g of groups) {
      await removeUserFromGroup(token, g.id, user.id);
      console.log(`    Removed from group: "${g.displayName}"`);
    }
  }

  for (const item of toAdd) {
    const groups = await findGroupsByName(token, item);
    for (const g of groups) {
      await addUserToGroup(token, g.id, user.id);
      console.log(`    Added to group: "${g.displayName}"`);
    }
  }
}

/**
 * Given the old and new department strings, return the items that should be
 * removed from groups (items that disappeared) and those that should be
 * added to groups (items that are new). Comparison is case-insensitive.
 */
function diffItems(
  oldDept: string,
  newDept: string
): { toRemove: string[]; toAdd: string[] } {
  const oldItems = splitItems(oldDept);
  const newItems = splitItems(newDept);
  const oldLower = new Set(oldItems.map((i) => i.toLowerCase()));
  const newLower = new Set(newItems.map((i) => i.toLowerCase()));
  return {
    toRemove: oldItems.filter((i) => !newLower.has(i.toLowerCase())),
    toAdd: newItems.filter((i) => !oldLower.has(i.toLowerCase())),
  };
}
