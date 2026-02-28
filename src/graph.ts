const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Escape a string value for safe embedding inside an OData single-quoted literal. */
function escapeODataString(value: string): string {
  // OData escapes a literal single-quote by doubling it: ' → ''
  return value.replace(/'/g, "''");
}

export interface GraphUser {
  id: string;
  displayName: string | null;
  userPrincipalName: string;
  department: string | null;
  mail: string | null;
}

export interface GraphGroup {
  id: string;
  displayName: string;
}

async function graphRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Graph API error ${res.status} ${res.statusText} on ${path}: ${body}`
    );
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

/** Fetch all pages of a collection, following @odata.nextLink. */
async function graphGetAll<T>(
  token: string,
  path: string,
  select?: string
): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  let url: string | null =
    `${GRAPH_BASE}${path}${select ? `${sep}$select=${select}` : ""}`;
  const items: T[] = [];

  while (url) {
    const res = (await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }).then(async (r) => {
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(
          `Graph API error ${r.status} ${r.statusText}: ${body}`
        );
      }
      return r.json();
    })) as { value?: T[]; "@odata.nextLink"?: string };

    items.push(...(res.value ?? []));
    url = res["@odata.nextLink"] ?? null;
  }

  return items;
}

/**
 * List users whose department contains the given substring.
 * Uses $filter=contains(department,'<filter>') which requires
 * ConsistencyLevel: eventual + $count=true for advanced filters.
 */
export async function getUsersByDepartmentContains(
  token: string,
  filter: string
): Promise<GraphUser[]> {
  const encoded = encodeURIComponent(`contains(department,'${escapeODataString(filter)}')`);
  const path = `/users?$filter=${encoded}&$count=true&$select=id,displayName,userPrincipalName,department,mail`;

  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ConsistencyLevel: "eventual",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Graph API error ${res.status} ${res.statusText}: ${body}`
    );
  }

  const data = (await res.json()) as {
    value?: GraphUser[];
    "@odata.nextLink"?: string;
};

  const users: GraphUser[] = [...(data.value ?? [])];

  // Follow pagination
  let nextLink = data["@odata.nextLink"];
  while (nextLink) {
    const nextRes = await fetch(nextLink, {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    });
    if (!nextRes.ok) break;
    const nextData = (await nextRes.json()) as {
      value?: GraphUser[];
      "@odata.nextLink"?: string;
    };
    users.push(...(nextData.value ?? []));
    nextLink = nextData["@odata.nextLink"];
  }

  return users;
}

/** Update a user's department field. */
export async function updateUserDepartment(
  token: string,
  userId: string,
  department: string
): Promise<void> {
  await graphRequest(token, `/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ department: department || null }),
  });
}

/** Find groups whose displayName equals the given name (exact match). */
export async function findGroupsByName(
  token: string,
  name: string
): Promise<GraphGroup[]> {
  const encoded = encodeURIComponent(`displayName eq '${escapeODataString(name)}'`);
  return graphGetAll<GraphGroup>(
    token,
    `/groups?$filter=${encoded}`,
    "id,displayName"
  );
}

/** Add a user to a group. Ignores "already a member" errors. */
export async function addUserToGroup(
  token: string,
  groupId: string,
  userId: string
): Promise<void> {
  const body = JSON.stringify({
    "@odata.id": `${GRAPH_BASE}/directoryObjects/${userId}`,
  });
  try {
    await graphRequest(token, `/groups/${groupId}/members/$ref`, {
      method: "POST",
      body,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // 400 with "already exists" is fine
    if (!msg.includes("already exist")) throw err;
  }
}

/** Remove a user from a group. Ignores "not a member" errors. */
export async function removeUserFromGroup(
  token: string,
  groupId: string,
  userId: string
): Promise<void> {
  try {
    await graphRequest(token, `/groups/${groupId}/members/${userId}/$ref`, {
      method: "DELETE",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // 404 means not a member – that's fine
    if (!msg.includes("404")) throw err;
  }
}
