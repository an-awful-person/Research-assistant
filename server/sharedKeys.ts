/**
 * Keys that the owner of this computer shares with everyone who uses the assistant, set in .env.
 * They never leave this server: browsers get a short-lived Wikipedia token, and OpenAlex searches are relayed.
 */
import { assertAllowed, readLimited, USER_AGENT } from "./fetcher.ts";

const WIKIPEDIA_TOKEN_URL = "https://meta.wikimedia.org/w/rest.php/oauth2/access_token";
const OPENALEX_URL = "https://api.openalex.org";
/** Renew a token this long before it expires, so a browser never gets one that is about to run out. */
const TOKEN_MARGIN_MS = 60_000;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 5_000_000;
const OPENALEX_WORK_PATH = /^\/works(\/[A-Za-z0-9]{1,40})?$/;
const PASSED_HEADERS = ["X-RateLimit-Remaining-USD", "X-RateLimit-Limit-USD", "X-RateLimit-Reset"];

export class SharedKeyError extends Error {}

function wikipediaCredentials(): { clientId: string; clientSecret: string } | undefined {
  const clientId = process.env.WIKIPEDIA_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.WIKIPEDIA_CLIENT_SECRET?.trim() ?? "";
  return clientId !== "" && clientSecret !== "" ? { clientId, clientSecret } : undefined;
}

function openAlexKey(): string | undefined {
  const key = process.env.OPENALEX_API_KEY?.trim() ?? "";
  return key !== "" ? key : undefined;
}

/**
 * @returns Which shared keys exist, without the keys themselves
 */
export function sharedKeys(): { wikipedia: boolean; openalex: boolean } {
  return { wikipedia: wikipediaCredentials() !== undefined, openalex: openAlexKey() !== undefined };
}

let token: { accessToken: string; expiresAt: number } | undefined;
let tokenRequest: Promise<{ accessToken: string; expiresAt: number }> | undefined;

/**
 * @returns A Wikimedia access token from the shared credentials, reused until shortly before it expires
 */
export async function wikipediaToken(): Promise<{ accessToken: string; expiresIn: number }> {
  const credentials = wikipediaCredentials();
  if (credentials === undefined) {
    throw new SharedKeyError("There is no shared Wikipedia key");
  }

  if (token === undefined || Date.now() >= token.expiresAt - TOKEN_MARGIN_MS) {
    // Browsers asking at the same time share one request.
    tokenRequest ??= requestToken(credentials).finally(() => (tokenRequest = undefined));
    token = await tokenRequest;
  }
  return { accessToken: token.accessToken, expiresIn: Math.floor((token.expiresAt - Date.now()) / 1000) };
}

async function requestToken(credentials: { clientId: string; clientSecret: string }): Promise<{ accessToken: string; expiresAt: number }> {
  const url = new URL(WIKIPEDIA_TOKEN_URL);
  assertAllowed(url);
  const response = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
    }).toString(),
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = JSON.parse(new TextDecoder().decode(await readLimited(response, MAX_BYTES)) || "{}") as {
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || typeof body.access_token !== "string" || body.access_token === "") {
    throw new Error(`Wikimedia did not accept the shared Wikipedia key (status ${response.status})`);
  }
  return { accessToken: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
}

/**
 * Relays a search or lookup of works to OpenAlex, with the shared key instead of any key the browser sent.
 * @param path /works or /works/<id>
 * @param params The query of the browser's request
 * @returns What OpenAlex answered, with the headers that tell how much of the daily budget is left
 */
export async function openAlexWorks(
  path: string,
  params: URLSearchParams,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const key = openAlexKey();
  if (key === undefined) {
    throw new SharedKeyError("There is no shared OpenAlex key");
  }
  if (!OPENALEX_WORK_PATH.test(path)) {
    throw new SharedKeyError("Only works can be looked up");
  }

  const url = new URL(`${OPENALEX_URL}${path}`);
  for (const [name, value] of params) {
    if (name !== "api_key") {
      url.searchParams.append(name, value);
    }
  }
  url.searchParams.set("api_key", key);
  assertAllowed(url);

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const headers: Record<string, string> = {};
  for (const name of PASSED_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }
  // Error messages could repeat the address, which holds the key.
  const body = new TextDecoder().decode(await readLimited(response, MAX_BYTES)).replaceAll(key, "[shared key]");
  return { status: response.status, body, headers };
}
