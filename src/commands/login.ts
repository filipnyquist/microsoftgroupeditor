import { loginDeviceCode, logout } from "../auth.js";
import { CACHE_PATH } from "../config.js";

/** Authenticate via device-code flow and cache the token. */
export async function runLogin(): Promise<void> {
  console.log("Starting device-code login…");
  const result = await loginDeviceCode();
  console.log(
    `\n✅  Logged in as: ${result.account?.username ?? "unknown"}`
  );
  console.log(`   Token cache: ${CACHE_PATH}`);
}

/** Remove the cached token (logout). */
export async function runLogout(): Promise<void> {
  await logout();
  console.log("✅  Logged out. Token cache cleared.");
}
