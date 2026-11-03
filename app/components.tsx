import Form from "next/form";
import Link from "next/link";
import type { Article, Country, Filters, Language, SearchResponse, Topic, WfmError } from "@/lib/wfm";

export type Options = { countries: Country[]; languages: Language[]; topics: Topic[] };

// next/form submits as a GET to this page, so the filters live in the URL:
// a search can be bookmarked or shared, and the browser's back button works.
export function SearchForm({ filters, countries, languages, topics }: { filters: Filters } & Options) {
  const filtered = Boolean(filters.keywords || filters.country || filters.language || filters.topic);

  return (
    <Form action="/" className="search" role="search">
      <div className="query">
        <label htmlFor="keywords" className="visually-hidden">
          Keywords
        </label>
        <input
          id="keywords"
          name="keywords"
          type="search"
          maxLength={255}
          defaultValue={filters.keywords}
          placeholder="Search the world's news"
        />
        <button type="submit">Search</button>
      </div>

      <div className="filters">
        <Select name="country" label="Country" value={filters.country} any="Every country">
          {countries.map((country) => (
            <option key={country.iso_3} value={country.iso_3}>
              {country.name}
            </option>
          ))}
        </Select>
        <Select name="language" label="Language" value={filters.language} any="Every language">
          {languages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </Select>
        <Select name="topic" label="Topic" value={filters.topic} any="Every topic">
          {topics.map((topic) => (
            <option key={topic.key} value={topic.key}>
              {topic.name}
            </option>
          ))}
        </Select>
        {filtered && (
          <Link href="/" className="clear">
            Clear filters
          </Link>
        )}
      </div>
    </Form>
  );
}

function Select({ name, label, value, any, children }: { name: string; label: string; value?: string; any: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="visually-hidden">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={value ? "is-set" : undefined}>
        <option value="">{any}</option>
        {children}
      </select>
    </label>
  );
}

/** What is on screen, as a sentence: "297 articles from Japan about Politics". */
export function Summary({ meta, filters, options }: { meta: SearchResponse["meta"]; filters: Filters; options: Options }) {
  const country = options.countries.find((c) => c.iso_3 === filters.country || c.iso_2 === filters.country)?.name ?? filters.country;
  const language = options.languages.find((l) => l.code === filters.language)?.name ?? filters.language;
  const topic = options.topics.find((t) => t.key === filters.topic)?.name ?? filters.topic;
  const count = meta.total_items;

  return (
    <div className="summary">
      <p>
        <strong>
          {count.toLocaleString("en")} {count === 1 ? "article" : "articles"}
        </strong>
        {filters.keywords && <> matching “{filters.keywords}”</>}
        {country ? <> from {country}</> : <> from every country</>}
        {language && <> in {language}</>}
        {topic && <> about {topic}</>}
      </p>
      <small>Published in the last day</small>
    </div>
  );
}

export function ArticleList({ articles }: { articles: Article[] }) {
  return (
    <ol className="articles">
      {articles.map((article) => (
        <li key={article.uuid} className="article">
          <Dateline article={article} />
          <div className="story">
            <h2>
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                {article.title}
              </a>
            </h2>
            <p className="byline">
              <b>{article.source.name}</b>
              <span>{article.language.name}</span>
              {article.author && <span>By {article.author}</span>}
            </p>
            {article.content && <p className="excerpt">{article.content}</p>}
            {article.macro_categories.length > 0 && (
              <ul className="topics" aria-label="Topics">
                {article.macro_categories.map((topic) => (
                  <li key={topic.key}>{topic.name}</li>
                ))}
              </ul>
            )}
          </div>
          {article.image && (
            // A plain <img>: articles come from thousands of publisher hosts,
            // which next/image would need listed one by one.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="thumb" src={article.image} alt="" loading="lazy" />
          )}
        </li>
      ))}
    </ol>
  );
}

// Where and when, as a wire service files it. The API gives the publisher's
// local time with its timezone, so that is what is shown: 09:12 in Tokyo.
function Dateline({ article }: { article: Article }) {
  const local = article.published_at ? parseLocal(article.published_at) : null;

  return (
    <div className="dateline">
      <abbr title={article.country.name}>{article.country.iso_2}</abbr>
      {local && <time dateTime={article.published_at!.replace(" ", "T")}>{local.time}</time>}
      {local && <span>{local.date}</span>}
      {article.published_timezone && <span>{place(article.published_timezone)}</span>}
    </div>
  );
}

function parseLocal(value: string): { time: string; date: string } {
  const [day, time] = value.split(" ");
  const [year, month, date] = day.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });

  return { time: time.slice(0, 5), date: label };
}

/** "Asia/Tokyo" reads as "Tokyo"; a bare offset such as "+11:00" as "UTC+11:00". */
export function place(timezone: string): string {
  if (/^[+-]\d{2}:\d{2}$/.test(timezone)) return `UTC${timezone}`;
  return timezone.split("/").pop()!.replaceAll("_", " ");
}

export function Pagination({ filters, meta }: { filters: Filters; meta: SearchResponse["meta"] }) {
  const page = filters.page ?? 1;
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries({ ...filters, page: target })) {
      if (value !== undefined && !(name === "page" && value === 1)) params.set(name, String(value));
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  if (!meta.has_previous && !meta.has_next) return null;

  return (
    <nav className="pagination" aria-label="Pages">
      {meta.has_previous ? <Link href={href(page - 1)}>Previous page</Link> : <i />}
      <span>
        Page {meta.current_page} of {meta.total_pages}
      </span>
      {meta.has_next ? <Link href={href(page + 1)}>Next page</Link> : <i />}
    </nav>
  );
}

export function Empty() {
  return (
    <section className="empty">
      <h2>No articles match this search</h2>
      <p>
        Searches cover the last day. Try fewer filters or different keywords, or <Link href="/">clear the filters</Link>.
      </p>
    </section>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">Loading articles…</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} />
      ))}
    </div>
  );
}

// A daily allowance resets in hours, a minute's in seconds: say it the way a person would.
export function duration(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 120) return plural(seconds, "second");
  if (seconds < 7200) return plural(Math.round(seconds / 60), "minute");
  return plural(Math.round(seconds / 3600), "hour");
}

const HELP: Record<WfmError["kind"], { title: string; hint?: React.ReactNode }> = {
  "missing-credentials": {
    title: "Add your API credentials to start",
    hint: (
      <ol>
        <li>
          Create a free account at <a href="https://worldfeedmonitor.com/register">worldfeedmonitor.com/register</a>.
        </li>
        <li>In the dashboard, open API Credentials and create one. Copy the secret: it is shown once.</li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in <code>WFM_API_KEY</code> and{" "}
          <code>WFM_API_SECRET</code>, and restart <code>npm run dev</code>.
        </li>
      </ol>
    ),
  },
  unauthorized: {
    title: "Your credentials were not accepted",
    hint: (
      <p>
        Check <code>WFM_API_KEY</code> and <code>WFM_API_SECRET</code> in <code>.env.local</code>. A lost secret cannot be
        shown again: create a new credential in the dashboard.
      </p>
    ),
  },
  forbidden: {
    title: "Your account cannot use the API yet",
    hint: <p>Confirm your email address from the dashboard, or check that your account is active.</p>,
  },
  invalid: { title: "The API did not accept this search" },
  "rate-limited": {
    title: "Your plan's allowance is used up",
    hint: (
      <p>
        Every request counts, including the filter lists, which this example caches for a day. See your usage in the{" "}
        <a href="https://worldfeedmonitor.com/customer">dashboard</a>.
      </p>
    ),
  },
  unavailable: { title: "The API could not be reached", hint: <p>Check your connection and try again.</p> },
};

export function ErrorPanel({ error }: { error: WfmError }) {
  const help = HELP[error.kind];

  return (
    <section className="error" role="alert">
      <h2>{help.title}</h2>
      {error.kind !== "missing-credentials" && <p>{error.message}</p>}
      {error.retryAfter !== undefined && <p>Try again in {duration(error.retryAfter)}.</p>}
      {error.fields && (
        <ul>
          {Object.entries(error.fields).map(([field, messages]) => (
            <li key={field}>
              <code>{field}</code>: {messages.join(" ")}
            </li>
          ))}
        </ul>
      )}
      {help.hint}
    </section>
  );
}
