// The whole World Feed Monitor integration: credentials, request building,
// the HTTP call and error handling. Copy this file into your own project.
//
// `server-only` makes the build fail if a Client Component ever imports this
// module, so the API secret cannot end up in browser JavaScript.
import "server-only";

export const DEFAULT_API_URL = "https://api.worldfeedmonitor.com/v1";

// ---------------------------------------------------------------- response types
// Only the fields this example reads. The full schema is in the API reference:
// https://worldfeedmonitor.com/docs

export type Named = { uuid: string; key: string; name: string };

export type Article = {
  uuid: string;
  title: string;
  url: string;
  content: string;
  author: string | null;
  image: string | null;
  published_at: string | null; // "YYYY-MM-DD HH:MM:SS", in published_timezone
  published_timezone: string | null;
  source: { name: string; url: string };
  country: { name: string; iso_2: string; iso_3: string };
  language: { name: string; code: string };
  macro_categories: Named[];
};

export type SearchResponse = {
  meta: {
    total_items: number;
    total_pages: number;
    items_per_page: number;
    current_page: number;
    has_previous: boolean;
    has_next: boolean;
    applied_filters: Record<string, unknown>;
  };
  data: Article[];
};

export type Country = { name: string; iso_2: string; iso_3: string };
export type Language = { name: string; code: string };
export type Topic = { name: string; key: string };

// ---------------------------------------------------------------------- filters

export type Filters = {
  keywords?: string;
  country?: string; // ISO 3166-1 alpha-2 or alpha-3
  language?: string; // ISO 639-1
  topic?: string; // macro category key, e.g. "politics"
  page?: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const PATTERNS = {
  country: /^[A-Za-z]{2,3}$/,
  language: /^[A-Za-z]{2}$/,
  topic: /^[a-z0-9_-]{1,64}$/,
};

/**
 * Turns the page's query string into filters the API accepts.
 *
 * Checked before anything is sent, so a hand-edited URL never spends a request
 * on a search the API would refuse. A value that does not fit is left out and
 * named in `ignored`.
 */
export function parseFilters(params: SearchParams): { filters: Filters; ignored: string[] } {
  const one = (name: string): string => {
    const value = params[name];
    return (Array.isArray(value) ? value[0] : value ?? "").trim();
  };

  const filters: Filters = {};
  const ignored: string[] = [];

  const keywords = one("keywords");
  if (keywords) {
    if (keywords.length <= 255) filters.keywords = keywords;
    else ignored.push("keywords");
  }

  for (const name of ["country", "language", "topic"] as const) {
    const value = one(name);
    if (!value) continue;
    if (PATTERNS[name].test(value)) {
      filters[name] = name === "country" ? value.toUpperCase() : value.toLowerCase();
    } else {
      ignored.push(name);
    }
  }

  const page = one("page");
  if (page) {
    const number = Number(page);
    if (Number.isInteger(number) && number >= 1 && number <= 1000) filters.page = number;
    else ignored.push("page");
  }

  return { filters, ignored };
}

/** The search request, with the API's own parameter names. */
export function searchUrl(baseUrl: string, filters: Filters): URL {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/feeds/search`);

  if (filters.keywords) url.searchParams.set("keywords", filters.keywords);
  if (filters.country) url.searchParams.set("country", filters.country);
  if (filters.language) url.searchParams.set("language", filters.language);
  if (filters.topic) url.searchParams.set("macro_category", filters.topic);
  if (filters.page && filters.page > 1) url.searchParams.set("page", String(filters.page));

  return url;
}

// ------------------------------------------------------------------ credentials

export type Credentials = { key: string; secret: string; baseUrl: string };

/** Reads WFM_API_KEY and WFM_API_SECRET. Never prefix them with NEXT_PUBLIC_. */
export function readCredentials(env: Record<string, string | undefined> = process.env): Credentials {
  const key = env.WFM_API_KEY?.trim() ?? "";
  const secret = env.WFM_API_SECRET?.trim() ?? "";

  // The placeholders from .env.example count as missing.
  if (!key || !secret || key === "your-api-key" || secret === "your-api-secret") {
    throw new WfmError(
      "missing-credentials",
      "WFM_API_KEY and WFM_API_SECRET are not set. Copy .env.example to .env.local and add your credentials.",
    );
  }

  return { key, secret, baseUrl: env.WFM_API_URL?.trim() || DEFAULT_API_URL };
}

/** HTTP Basic: the API key is the username and the API secret the password. */
export function authorizationHeader(key: string, secret: string): string {
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

// ------------------------------------------------------------------------ errors

export type WfmErrorKind =
  | "missing-credentials"
  | "unauthorized" // 401: key or secret wrong
  | "forbidden" // 403: account not active, or email not confirmed
  | "invalid" // 422: a filter value the API does not know
  | "rate-limited" // 429: a plan allowance is spent
  | "unavailable"; // network failure or 5xx

export class WfmError extends Error {
  constructor(
    public readonly kind: WfmErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: number,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "WfmError";
  }
}

/** Maps an unsuccessful response to a WfmError, using the API's own message. */
export async function errorFrom(response: Response): Promise<WfmError> {
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    errors?: Record<string, string[]>;
    retry_after?: number;
  };
  const message = body.message ?? `The API answered ${response.status}.`;

  switch (response.status) {
    case 401:
      return new WfmError("unauthorized", "The API key or secret was not accepted.", 401);
    case 403:
      return new WfmError("forbidden", message, 403);
    case 422:
      return new WfmError("invalid", message, 422, undefined, body.errors);
    case 429: {
      const header = Number(response.headers.get("Retry-After"));
      const retryAfter = body.retry_after ?? (Number.isFinite(header) && header > 0 ? header : undefined);
      return new WfmError("rate-limited", message, 429, retryAfter);
    }
    default:
      return new WfmError("unavailable", message, response.status);
  }
}

// ----------------------------------------------------------------------- requests

/**
 * One authenticated GET. Every call counts against your plan, so `revalidate`
 * lets Next.js answer a repeat from its data cache instead of spending another.
 */
async function get<T>(url: URL, credentials: Credentials, revalidate: number): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: authorizationHeader(credentials.key, credentials.secret),
        Accept: "application/json",
      },
      next: { revalidate },
    });
  } catch {
    throw new WfmError("unavailable", "The World Feed Monitor API could not be reached.");
  }

  if (!response.ok) throw await errorFrom(response);

  return (await response.json()) as T;
}

/** A page of articles. The same search within a minute is served from cache. */
export function searchArticles(filters: Filters, credentials = readCredentials()): Promise<SearchResponse> {
  return get<SearchResponse>(searchUrl(credentials.baseUrl, filters), credentials, 60);
}

/** The filter lists change rarely, so each is fetched at most once a day. */
export async function listFilterOptions(credentials = readCredentials()): Promise<{
  countries: Country[];
  languages: Language[];
  topics: Topic[];
}> {
  const list = <T>(path: string) =>
    get<{ data: T[] }>(new URL(`${credentials.baseUrl.replace(/\/+$/, "")}${path}`), credentials, 86_400).then(
      (body) => body.data,
    );

  const [countries, languages, topics] = await Promise.all([
    list<Country>("/metadata/countries"),
    list<Language>("/metadata/languages"),
    list<Topic>("/metadata/macro-categories"),
  ]);

  return { countries, languages, topics };
}
