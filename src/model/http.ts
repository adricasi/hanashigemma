import { ModelUnavailableError, type UnavailableReason } from "./adapter.js";

/** NFR-004: server-side model timeout per attempt. */
export const MODEL_TIMEOUT_MS = 45_000;

/**
 * Upper bound on generated tokens. A full reply measured ~200 tokens on gemma4:e4b; the cap
 * stops a runaway answer from holding the model until the timeout.
 */
export const MAX_OUTPUT_TOKENS = 1536;

export interface PostJsonOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
  /** The caller's signal, e.g. aborted when the browser goes away. */
  signal?: AbortSignal | undefined;
}

export interface JsonResponse {
  status: number;
  /** Parsed body for 2xx responses; null otherwise (error bodies are never read or logged). */
  body: unknown;
}

function failureReason(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  fallback: UnavailableReason,
): UnavailableReason {
  if (callerSignal?.aborted === true) {
    return "cancelled";
  }
  return error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : fallback;
}

/**
 * POSTs JSON to a model backend. Network failures, the timeout and caller aborts become a
 * ModelUnavailableError; HTTP statuses are left to the adapter to interpret.
 */
export async function postJson(
  url: URL,
  payload: unknown,
  { headers = {}, timeoutMs, signal: callerSignal }: PostJsonOptions,
): Promise<JsonResponse> {
  // One signal covers the request and reading the body: timeout or caller, first wins.
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([timeout, callerSignal]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
      // Never follow redirects: fetch would forward custom headers such as the API key.
      redirect: "error",
      signal,
    });
  } catch (error) {
    throw new ModelUnavailableError(failureReason(error, callerSignal, "unreachable"), {
      cause: error,
    });
  }

  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, body: null };
  }
  try {
    return { status: response.status, body: await response.json() };
  } catch (error) {
    throw new ModelUnavailableError(failureReason(error, callerSignal, "upstream"), {
      cause: error,
    });
  }
}
