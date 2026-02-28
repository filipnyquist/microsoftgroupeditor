import { join } from "path";
import { homedir } from "os";

/**
 * Azure App Registration settings.
 * Set AZURE_CLIENT_ID and AZURE_TENANT_ID in your environment or a .env file.
 *
 * Required app permissions (delegated):
 *   User.ReadWrite.All
 *   Group.ReadWrite.All
 *   Directory.Read.All
 */
export const CLIENT_ID: string = process.env["AZURE_CLIENT_ID"] ?? "";
export const TENANT_ID: string = process.env["AZURE_TENANT_ID"] ?? "common";
export const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

export const SCOPES = [
  "User.ReadWrite.All",
  "Group.ReadWrite.All",
  "Directory.Read.All",
];

/** Path to the persisted MSAL token cache file. */
export const CACHE_PATH = join(
  homedir(),
  ".config",
  "microsoftgroupeditor",
  "token-cache.json"
);
