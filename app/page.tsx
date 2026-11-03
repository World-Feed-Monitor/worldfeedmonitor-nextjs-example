import { Suspense } from "react";
import { listFilterOptions, parseFilters, searchArticles, WfmError, type Filters } from "@/lib/wfm";
import { ArticleList, Empty, ErrorPanel, Pagination, ResultsSkeleton, SearchForm, Summary, type Options } from "./components";

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
        <Results filters={filters} options={options} />
      </Suspense>
    </Shell>
  );
}

async function Results({ filters, options }: { filters: Filters; options: Options }) {
  const result = await attempt(() => searchArticles(filters));

  if (result instanceof WfmError) return <ErrorPanel error={result} />;
  if (result.data.length === 0) return <Empty />;

  return (
    <>
      <Summary meta={result.meta} filters={filters} options={options} />
      <ArticleList articles={result.data} />
      <Pagination filters={filters} meta={result.meta} />
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
      <header className="masthead">
        <h1>Global News Dashboard</h1>
        <p>
          An example built on the <a href="https://worldfeedmonitor.com/docs">World Feed Monitor API</a>
        </p>
      </header>
      {children}
    </main>
  );
}
