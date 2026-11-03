import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizationHeader,
  DEFAULT_API_URL,
  errorFrom,
  listFilterOptions,
  parseFilters,
  readCredentials,
  searchArticles,
  searchUrl,
  WfmError,
} from "@/lib/wfm";

const credentials = { key: "test-key", secret: "test-secret", baseUrl: "https://api.example.test/v1" };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

afterEach(() => vi.unstubAllGlobals());

describe("parseFilters", () => {
  it("keeps valid filters and normalises their case", () => {
    expect(parseFilters({ keywords: "  energy prices ", country: "ita", language: "IT", topic: "politics", page: "2" })).toEqual({
      filters: { keywords: "energy prices", country: "ITA", language: "it", topic: "politics", page: 2 },
      ignored: [],
    });
  });

  it("leaves out values the API would refuse, and says which", () => {
    expect(parseFilters({ country: "Italy", language: "english", topic: "Politics & more", page: "0" })).toEqual({
      filters: {},
      ignored: ["country", "language", "topic", "page"],
    });
    expect(parseFilters({ keywords: "x".repeat(256) }).ignored).toEqual(["keywords"]);
  });

  it("treats empty values as no filter at all", () => {
    expect(parseFilters({ keywords: "", country: "", page: undefined })).toEqual({ filters: {}, ignored: [] });
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parseFilters({ country: ["DEU", "FRA"] }).filters).toEqual({ country: "DEU" });
  });
});

describe("searchUrl", () => {
  it("uses the API's parameter names", () => {
    const url = searchUrl(credentials.baseUrl, { keywords: "climate", country: "BRA", language: "pt", topic: "business", page: 3 });

    expect(url.origin + url.pathname).toBe("https://api.example.test/v1/feeds/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      keywords: "climate",
      country: "BRA",
      language: "pt",
      macro_category: "business",
      page: "3",
    });
  });

  it("sends no parameters for a worldwide first page", () => {
    expect(searchUrl(`${credentials.baseUrl}/`, { page: 1 }).toString()).toBe("https://api.example.test/v1/feeds/search");
  });
});

describe("credentials", () => {
  it("builds an HTTP Basic header from key and secret", () => {
    expect(authorizationHeader("test-key", "test-secret")).toBe(`Basic ${btoa("test-key:test-secret")}`);
  });

  it("reads them from the environment, defaulting to the production API", () => {
    expect(readCredentials({ WFM_API_KEY: "k", WFM_API_SECRET: "s" })).toEqual({ key: "k", secret: "s", baseUrl: DEFAULT_API_URL });
    expect(readCredentials({ WFM_API_KEY: "k", WFM_API_SECRET: "s", WFM_API_URL: "http://localhost/v1" }).baseUrl).toBe("http://localhost/v1");
  });

  it.each([
    [{}],
    [{ WFM_API_KEY: "k" }],
    [{ WFM_API_KEY: "your-api-key", WFM_API_SECRET: "your-api-secret" }],
  ])("refuses to start without real ones: %j", (env) => {
    expect(() => readCredentials(env)).toThrowError(expect.objectContaining({ kind: "missing-credentials" }));
  });
});

describe("requests", () => {
  it("sends the Basic header and parses a page of articles", async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { meta: { total_items: 1 }, data: [{ uuid: "a" }] }));
    vi.stubGlobal("fetch", fetch);

    const result = await searchArticles({ country: "JPN" }, credentials);

    expect(result.data).toEqual([{ uuid: "a" }]);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://api.example.test/v1/feeds/search?country=JPN");
    expect(init.headers.Authorization).toBe(authorizationHeader("test-key", "test-secret"));
    expect(init.next).toEqual({ revalidate: 60 });
  });

  it("fetches the three filter lists, cached for a day", async () => {
    const fetch = vi.fn().mockImplementation(async () => json(200, { data: [] }));
    vi.stubGlobal("fetch", fetch);

    await listFilterOptions(credentials);

    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname).sort()).toEqual([
      "/v1/metadata/countries",
      "/v1/metadata/languages",
      "/v1/metadata/macro-categories",
    ]);
    expect(fetch.mock.calls.every(([, init]) => init.next.revalidate === 86_400)).toBe(true);
  });

  it("turns a network failure into an error the page can show", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(searchArticles({}, credentials)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("errors", () => {
  it("401 says the credentials were not accepted", async () => {
    expect(await errorFrom(json(401, { message: "Invalid credentials" }))).toMatchObject({ kind: "unauthorized", status: 401 });
  });

  it("403 keeps the API's own reason", async () => {
    const error = await errorFrom(json(403, { message: "Email address not confirmed." }));
    expect(error).toMatchObject({ kind: "forbidden", message: "Email address not confirmed." });
  });

  it("422 keeps the per-field errors", async () => {
    const error = await errorFrom(json(422, { message: "Invalid.", errors: { country: ["ZZZ is not a country we know."] } }));
    expect(error).toMatchObject({ kind: "invalid", fields: { country: ["ZZZ is not a country we know."] } });
  });

  it("429 says when to try again, from the body or the Retry-After header", async () => {
    expect(await errorFrom(json(429, { message: "Allowance used.", window: "day", retry_after: 3600 }))).toMatchObject({
      kind: "rate-limited",
      retryAfter: 3600,
    });
    expect(await errorFrom(json(429, { message: "Allowance used." }, { "Retry-After": "24" }))).toMatchObject({ retryAfter: 24 });
  });

  it("anything else is reported as unavailable, even without a JSON body", async () => {
    const error = await errorFrom(new Response("Bad gateway", { status: 502 }));
    expect(error).toBeInstanceOf(WfmError);
    expect(error).toMatchObject({ kind: "unavailable", status: 502 });
  });
});

describe("retry wording", async () => {
  const { duration } = await import("@/app/components");

  it("says seconds, minutes or hours", () => {
    expect([duration(1), duration(24), duration(600), duration(3600), duration(86_400)]).toEqual([
      "1 second",
      "24 seconds",
      "10 minutes",
      "60 minutes",
      "24 hours",
    ]);
  });
});
