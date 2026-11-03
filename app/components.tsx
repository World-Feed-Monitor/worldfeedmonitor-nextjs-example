import Form from "next/form";
import Link from "next/link";
import type { Article, Country, Filters, Language, Topic, WfmError } from "@/lib/wfm";

// next/form submits as a GET to this page, so the filters live in the URL:
// a search can be bookmarked or shared, and the browser's back button works.
export function SearchForm({
  filters,
  countries,
  languages,
  topics,
}: {
  filters: Filters;
  countries: Country[];
  languages: Language[];
  topics: Topic[];
}) {
  return (
    <Form action="/" className="search">
      <label className="field wide">
        <span>Keywords</span>
        <input name="keywords" type="search" maxLength={255} defaultValue={filters.keywords} placeholder="e.g. elections, energy prices" />
      </label>
      <label className="field">
        <span>Country</span>
        <select name="country" defaultValue={filters.country ?? ""}>
          <option value="">Every country</option>
          {countries.map((country) => (
            <option key={country.iso_3} value={country.iso_3}>
              {country.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Language</span>
        <select name="language" defaultValue={filters.language ?? ""}>
          <option value="">Every language</option>
          {languages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Topic</span>
        <select name="topic" defaultValue={filters.topic ?? ""}>
          <option value="">Every topic</option>
          {topics.map((topic) => (
            <option key={topic.key} value={topic.key}>
              {topic.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Search</button>
    </Form>
  );
}

export function ArticleList({ articles }: { articles: Article[] }) {
  return (
    <ol className="articles">
      {articles.map((article) => (
        <li key={article.uuid} className="article">
          {article.image && (
            // A plain <img>: articles come from thousands of publisher hosts,
            // which next/image would need listed one by one.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.image} alt="" loading="lazy" />
          )}
          <div>
            <h2>
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                {article.title}
              </a>
            </h2>
            <p className="meta">
              <span>{article.source.name}</span>
              {article.published_at && <span>{published(article)}</span>}
              <span>{article.country.name}</span>
              <span>{article.language.name}</span>
            </p>
            {article.content && <p className="excerpt">{article.content}</p>}
            {article.macro_categories.length > 0 && (
              <p className="topics">
                {article.macro_categories.map((topic) => (
                  <span key={topic.key}>{topic.name}</span>
                ))}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// The API gives the publisher's local time and its timezone, not UTC.
function published(article: Article): string {
  const time = article.published_at!.slice(0, 16);
  return article.published_timezone ? `${time} (${article.published_timezone})` : time;
}

export function Pagination({ filters, hasPrevious, hasNext }: { filters: Filters; hasPrevious: boolean; hasNext: boolean }) {
  const page = filters.page ?? 1;
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries({ ...filters, page: target })) {
      if (value !== undefined && !(name === "page" && value === 1)) params.set(name, String(value));
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <nav className="pagination" aria-label="Pages">
      {hasPrevious ? <Link href={href(page - 1)}>← Previous</Link> : <span />}
      {hasNext && <Link href={href(page + 1)}>Next →</Link>}
    </nav>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">Loading articles…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} />
      ))}
    </div>
  );
}

const HELP: Record<WfmError["kind"], { title: string; hint?: React.ReactNode }> = {
  "missing-credentials": {
    title: "Add your API credentials",
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

// A daily allowance resets in hours, a minute's in seconds: say it the way a person would.
export function duration(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 120) return plural(seconds, "second");
  if (seconds < 7200) return plural(Math.round(seconds / 60), "minute");
  return plural(Math.round(seconds / 3600), "hour");
}

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
