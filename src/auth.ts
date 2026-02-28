import {
  PublicClientApplication,
  type Configuration,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
} from "@azure/msal-node";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { dirname } from "path";
import { AUTHORITY, CACHE_PATH, CLIENT_ID, SCOPES } from "./config.js";

/** File-based MSAL token cache plugin. */
function createCachePlugin(cachePath: string): ICachePlugin {
  return {
    beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
      if (existsSync(cachePath)) {
        ctx.tokenCache.deserialize(readFileSync(cachePath, "utf-8"));
      }
      return Promise.resolve();
    },
    afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
      if (ctx.cacheHasChanged) {
        mkdirSync(dirname(cachePath), { recursive: true });
        writeFileSync(cachePath, ctx.tokenCache.serialize(), {
          encoding: "utf-8",
          mode: 0o600,
        });
      }
      return Promise.resolve();
    },
  };
}

function buildMsalApp(): PublicClientApplication {
  const config: Configuration = {
    auth: {
      clientId: CLIENT_ID,
      authority: AUTHORITY,
    },
    cache: {
      cachePlugin: createCachePlugin(CACHE_PATH),
    },
  };
  return new PublicClientApplication(config);
}

/**
 * Perform device-code login. Prints the device-code URL and code to stdout,
 * waits for the user to authenticate in a browser, then caches the token.
 */
export async function loginDeviceCode(): Promise<AuthenticationResult> {
  if (!CLIENT_ID) {
    throw new Error(
      "AZURE_CLIENT_ID is not set. Please set it in your environment or a .env file."
    );
  }

  const app = buildMsalApp();
  const result = await app.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      console.log("\n" + response.message + "\n");
    },
  });

  if (!result) {
    throw new Error("Authentication failed: no result returned.");
  }
  return result;
}

/**
 * Return a valid access token from cache (silently refreshes if needed).
 * Throws if the user has not logged in yet.
 */
export async function getAccessToken(): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error(
      "AZURE_CLIENT_ID is not set. Please set it in your environment or a .env file."
    );
  }

  const app = buildMsalApp();
  const accounts = await app.getTokenCache().getAllAccounts();

  if (accounts.length === 0) {
    throw new Error(
      'Not logged in. Run "msgedit login" first.'
    );
  }

  const firstAccount = accounts[0];
  if (!firstAccount) {
    throw new Error('Not logged in. Run "msgedit login" first.');
  }

  const result = await app.acquireTokenSilent({
    scopes: SCOPES,
    account: firstAccount,
  });

  if (!result?.accessToken) {
    throw new Error(
      'Session expired or no token available. Run "msgedit login" again.'
    );
  }

  return result.accessToken;
}

/** Remove the cached tokens (logout). */
export async function logout(): Promise<void> {
  const app = buildMsalApp();
  const accounts = await app.getTokenCache().getAllAccounts();
  for (const account of accounts) {
    await app.getTokenCache().removeAccount(account);
  }
}
