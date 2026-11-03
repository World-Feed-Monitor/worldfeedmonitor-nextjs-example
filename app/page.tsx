import { Suspense } from "react";
import { listFilterOptions, parseFilters, searchArticles, WfmError, type Filters } from "@/lib/wfm";
import { ArticleList, ErrorPanel, Pagination, ResultsSkeleton, SearchForm } from "./components";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Everything here runs on the server: the browser receives HTML, never the
// credentials or the API calls that used them.
export default async function Page({ searchParams }: Props) {
  const { filters, ignored } = parseFilters(await searchParams);
  const options = await attempt(listFilterOptions);

  if (options instanceof WfmError) {
    return (
      <Shell>
        <ErrorPanel error={options} />
      </Shell>
    );
  }

  return (
    <Shell>
      <SearchForm filters={filters} {...options} />
      {ignored.length > 0 && <p className="notice">Ignored a value that is not valid for: {ignored.join(", ")}.</p>}
      {/* Keyed by the search, so a new search shows the skeleton while it loads. */}
      <Suspense key={JSON.stringify(filters)} fallback={<ResultsSkeleton />}>
        <Results filters={filters} />
      </Suspense>
    </Shell>
  );
}

async function Results({ filters }: { filters: Filters }) {
  const result = await attempt(() => searchArticles(filters));

  if (result instanceof WfmError) return <ErrorPanel error={result} />;

  const { meta, data } = result;

  if (data.length === 0) {
    return (
      <p className="empty">
        No articles matched. Searches cover the last day by default: try fewer filters or other keywords.
      </p>
    );
  }

  return (
    <>
      <p className="summary">
        {meta.total_items.toLocaleString("en")} articles · page {meta.current_page} of {meta.total_pages}
      </p>
      <ArticleList articles={data} />
      <Pagination filters={filters} hasPrevious={meta.has_previous} hasNext={meta.has_next} />
    </>
  );
}

/** The value, or the WfmError to show in its place. Anything else is a bug and is rethrown. */
async function attempt<T>(call: () => Promise<T>): Promise<T | WfmError> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof WfmError) return error;
    throw error;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <header className="header">
        <h1>Global News Dashboard</h1>
        <p>
          Articles from every country and language, through the{" "}
          <a href="https://worldfeedmonitor.com">World Feed Monitor</a> REST API.
        </p>
      </header>
      {children}
    </main>
  );
}
