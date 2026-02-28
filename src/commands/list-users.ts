import { getAccessToken } from "../auth.js";
import { getUsersByDepartmentContains, type GraphUser } from "../graph.js";

export interface ListUsersOptions {
  /** Substring to look for in the department field (default: "sexistenz"). */
  filter: string;
  /** Print as JSON instead of a formatted table. */
  json: boolean;
}

/** List all users whose department field contains the given filter string. */
export async function runListUsers(opts: ListUsersOptions): Promise<void> {
  const token = await getAccessToken();
  const users: GraphUser[] = await getUsersByDepartmentContains(
    token,
    opts.filter
  );

  if (users.length === 0) {
    console.log(`No users found with "${opts.filter}" in the department field.`);
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify(users, null, 2));
    return;
  }

  console.log(
    `Found ${users.length} user(s) with "${opts.filter}" in the department field:\n`
  );
  for (const u of users) {
    const name = u.displayName ?? u.userPrincipalName;
    console.log(`  ${name}`);
    console.log(`    UPN       : ${u.userPrincipalName}`);
    console.log(`    Department: ${u.department ?? "(none)"}`);
    if (u.mail) console.log(`    Mail      : ${u.mail}`);
    console.log();
  }
}
