import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * One IPv6 subscriber usually gets a whole /64, so each address in it would otherwise be a
 * fresh client. IPv4 (including IPv4-mapped IPv6) is kept as is.
 */
function normalise(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) {
    return mapped[1];
  }
  if (!address.includes(":")) {
    return address;
  }
  const withoutZone = address.split("%")[0] ?? address;
  const [head = "", tail] = withoutZone.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0");
  const groups = tail === undefined ? headGroups : [...headGroups, ...zeros, ...tailGroups];
  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group || "0", 16).toString(16));
  return `${prefix.join(":")}::/64`;
}

/**
 * Who is asking, for the per-client limit (AC-011.1). Never logged (NFR-002).
 *
 * Behind Cloud Run (`trustProxy`), the client can put anything in X-Forwarded-For and the
 * proxy appends the address it saw, so only the right-most entry is trustworthy. If Google
 * adds a hop of its own, all visitors share one key: stricter, never bypassable.
 */
export function clientKey(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const entries = (c.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    return normalise(entries.at(-1) ?? "unknown");
  }
  try {
    return normalise(getConnInfo(c).remote.address ?? "unknown");
  } catch {
    // No Node socket, e.g. requests made in tests.
    return "unknown";
  }
}
