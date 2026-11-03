# World Feed Monitor · Next.js example

A **Global News Dashboard** built on the [World Feed Monitor](https://worldfeedmonitor.com/?utm_source=github) REST API with Next.js (App Router) and TypeScript.

Search news from every country and language by keyword, country, language and topic, and read it as article cards linking to the original publishers. It runs on a Free account, and needs no database and no backend of its own.

![The Global News Dashboard showing articles filtered by country and topic](docs/dashboard.png)

## What it demonstrates

- Calling `GET /v1/feeds/search` with HTTP Basic authentication, **from the server only**: the API secret never reaches the browser.
- Filling the country, language and topic filters from the metadata endpoints.
- Validating filters before a request is spent on them.
- Handling every documented error: 401, 403, 422 and 429.
- Keeping quota use low with Next.js's built-in fetch cache. There is no separate caching layer.

The whole integration is one file, [`lib/wfm.ts`](lib/wfm.ts) (about 250 lines). Copy it into your own project.

## Prerequisites

- Node.js 20.9 or later
- A World Feed Monitor account. The Free plan is enough and needs no card.

Want to see the data first? The [API Playground](https://worldfeedmonitor.com/playground?utm_source=github) runs the same search with no account.

## 1. Create a free account

Sign up at [worldfeedmonitor.com/register](https://worldfeedmonitor.com/register?utm_source=github) with an email address, GitHub or Google. Every account starts on the Free plan. Confirm your email address: the API answers only once it is confirmed.

## 2. Create API credentials

In the dashboard, open **API Credentials** and create one. You get:

- an **API key**, which you can see again later;
- an **API secret**, which is **shown once**. Copy it straight away. If you lose it, create a new credential.

## 3. Configure the example

```bash
git clone https://github.com/World-Feed-Monitor/worldfeedmonitor-nextjs-example.git
cd worldfeedmonitor-nextjs-example
cp .env.example .env.local
```

Edit `.env.local`:

```bash
WFM_API_KEY=your-api-key
WFM_API_SECRET=your-api-secret
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `WFM_API_KEY` | yes | Your API key |
| `WFM_API_SECRET` | yes | Your API secret |
| `WFM_API_URL` | no | Defaults to `https://api.worldfeedmonitor.com/v1` |

`.env.local` is ignored by git. Never give these variables a `NEXT_PUBLIC_` prefix: that would ship the secret to every visitor.

## 4. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without credentials, the page tells you what is missing and how to fix it.

## How the API integration works

Everything that talks to the API is in [`lib/wfm.ts`](lib/wfm.ts), which starts with `import "server-only"`. If a Client Component ever imports it, the build fails.

**Authentication** is HTTP Basic, with the key as username and the secret as password:

```ts
headers: {
  Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
}
```

The curl equivalent:

```bash
curl -u "YOUR_API_KEY:YOUR_API_SECRET" "https://api.worldfeedmonitor.com/v1/feeds/search?country=JPN"
```

**Search** is one request to `/v1/feeds/search`:

| Dashboard filter | API parameter | Values |
| --- | --- | --- |
| Keywords | `keywords` | Free text, up to 255 characters |
| Country | `country` | ISO 3166-1 alpha-2 or alpha-3, e.g. `JP` or `JPN` |
| Language | `language` | ISO 639-1, e.g. `ja` |
| Topic | `macro_category` | A topic key, e.g. `politics` |
| Page | `page` | 1-based, 25 articles per page |

With no dates, a search covers the last day. The response is `{ meta, data }`:
- `data` holds the articles.
- `meta` holds `total_items`, `current_page`, `has_next`, and `applied_filters`, which echoes how each filter was understood.

**Filter lists** come from `/v1/metadata/countries`, `/v1/metadata/languages` and `/v1/metadata/macro-categories`.

**Data flow.** The page is a Server Component:
1. It reads the filters from the URL and validates them.
2. It calls the API on the server and renders HTML.

The form is a `next/form` GET form, so every search is a shareable URL, and the browser never makes a request to World Feed Monitor.

## Usage limits

Every API call counts against your plan, **metadata requests included**. Free allows 30 requests a minute, 1,000 a day and 10,000 a month. Check your current figures and usage in the dashboard.

To spend as few requests as possible, this example uses Next.js's fetch cache:

- The three filter lists are fetched **at most once a day**.
- Repeating the same search within **60 seconds** is served from cache.

## Error handling

| Status | Meaning | What the dashboard shows |
| --- | --- | --- |
| — | `WFM_API_KEY` or `WFM_API_SECRET` missing | Setup steps |
| 401 | Key or secret not accepted | Check `.env.local`, or create a new credential |
| 403 | Account not active, or email not confirmed | The API's reason |
| 422 | A filter value the API does not know | The API's message for each field |
| 429 | A plan allowance (minute, day or month) is used up | The API's message and when to retry (`retry_after`) |
| other | Network failure or server error | A retry hint |

Invalid filters in the URL, such as `?country=Italy`, are dropped before any request is made, and the page says which ones.

## Project structure

```
app/
  page.tsx         Server Component: reads filters, calls the API, renders
  components.tsx   Search form, article cards, pagination, error panel
  layout.tsx, globals.css
lib/
  wfm.ts           The API client (server-only)
tests/
  wfm.test.ts                   Requests, auth header, filters, errors
  credential-isolation.test.ts  The secret cannot reach the browser
```

## Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm test            # unit tests (Vitest)
npm run lint        # ESLint
npm run typecheck   # TypeScript
```

## Links

- [API Playground](https://worldfeedmonitor.com/playground?utm_source=github): try searches without an account
- [API reference](https://worldfeedmonitor.com/docs?utm_source=github)
- [OpenAPI document](https://worldfeedmonitor.com/openapi.json)
- [MCP server](https://worldfeedmonitor.com/?utm_source=github#mcp): the same data for AI agents

## License

[MIT](LICENSE)
