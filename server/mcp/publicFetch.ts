import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable, Transform } from "node:stream";
import { isPublicAddress, publicLookup } from "../pageReader.ts";

const MAX_RESPONSE_BYTES = 5_000_000;
const TIMEOUT_MS = 60_000;

export class NotPublicError extends Error {}

/** @returns Why a server someone added can't be connected to, if it can't */
export function refusalForPersonalServer(address: string): string | undefined {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return "That isn't a valid address.";
  }
  if (url.protocol !== "https:") {
    return "Only https:// addresses can be added here. The owner of this computer can list local servers in config/mcp.json.";
  }
  if (url.username !== "" || url.password !== "") {
    return "An address can't contain a user name or password. Use the key field instead.";
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    return "Addresses on this computer or its network can't be added here.";
  }
  return undefined;
}

/**
 * A fetch that only reaches https addresses on the public internet, checked at the moment of connecting so that a
 * name can't point somewhere else afterwards. It doesn't follow redirects, which could lead anywhere.
 */
export const publicFetch: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const refusal = refusalForPersonalServer(request.url);
  if (refusal !== undefined) {
    return Promise.reject(new NotPublicError(refusal));
  }

  return request.text().then((body) => new Promise<Response>((resolve, reject) => {
    const outgoing = httpsRequest(
      url,
      {
        method: request.method,
        headers: { ...Object.fromEntries(request.headers.entries()), ...(body === "" ? {} : { "content-length": Buffer.byteLength(body) }) },
        lookup: publicLookup as never,
        timeout: TIMEOUT_MS,
        signal: init?.signal ?? undefined,
      },
      (incoming) => {
        let received = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            received += chunk.length;
            done(received > MAX_RESPONSE_BYTES ? new Error("The answer of this server is too large") : null, chunk);
          },
        });
        incoming.on("error", (error) => limiter.destroy(error));
        const status = incoming.statusCode ?? 502;
        const headers = new Headers();
        Object.entries(incoming.headers).forEach(([name, value]) => {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        });
        const hasNoBody = [101, 204, 205, 304].includes(status);
        if (hasNoBody) incoming.resume();
        resolve(new Response(hasNoBody ? null : (Readable.toWeb(incoming.pipe(limiter)) as ReadableStream), { status, headers }));
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new Error("This server took too long to answer")));
    outgoing.on("error", reject);
    outgoing.end(body === "" ? undefined : body);
  }));
};
