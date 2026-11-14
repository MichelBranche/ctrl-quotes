import { Suspense } from "react";
import { connection } from "next/server";
import { QuotesView } from "@/components/quotes/quotes-view";
import { can } from "@/domain/permissions";
import { quoteFilters, type QuoteFilter } from "@/domain/quote-status";
import { requireContext } from "@/server/context";
import { listQuotes } from "@/server/quotes";

export const metadata = { title: "Preventivi" };

type Search = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function QuotesPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <QuotesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function QuotesContent({ searchParams }: { searchParams: Search }) {
  await connection();
  const params = await searchParams;
  const { db, actor, workspace } = await requireContext();
  const statusParam = one(params.status);
  const filter: QuoteFilter = (quoteFilters as readonly string[]).includes(statusParam ?? "") ? (statusParam as QuoteFilter) : "all";
  const page = Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1);
  const q = one(params.q)?.slice(0, 100) ?? "";
  const list = await listQuotes(db, actor, { filter, q, page, pageSize: 15 });
  if (!list.ok) throw new Error(list.message);
  return <QuotesView list={list.value} filter={filter} canWrite={can(workspace.role, "quotes.write")} />;
}
