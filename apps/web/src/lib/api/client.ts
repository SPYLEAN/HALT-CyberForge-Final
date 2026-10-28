import createClient from "openapi-fetch";

import { env } from "@/env";

import type { paths } from "./schema";
import type { ApiError } from "./types";

/** Typed client generated from the API's OpenAPI document (npm run gen:api). */
export const api = createClient<paths>({
  baseUrl: env.NEXT_PUBLIC_API_ORIGIN,
  // Resolve fetch per request (not at import), so tests can replay recorded API responses.
  fetch: (request) => globalThis.fetch(request),
});

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError | undefined,
  ) {
    super(body?.message ?? `HTTP ${status}`);
  }
}

/** Return the data of an openapi-fetch result or throw ApiFailure. Never substitutes a fallback value. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  throw new ApiFailure(result.response.status, result.error as ApiError | undefined);
}
