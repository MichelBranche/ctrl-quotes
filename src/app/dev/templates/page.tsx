import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { TemplateLab } from "./template-lab";
import { templateKeys, type TemplateKey } from "@/domain/templates";

export const metadata = { title: "Template lab" };

export default function TemplateLabPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={<main className="page">Template lab</main>}>
      <Gate searchParams={searchParams} />
    </Suspense>
  );
}

/** Dev only: renders the sample quote with one template, to check sheet and flow layouts. */
async function Gate({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (process.env.ENABLE_COMPONENT_CATALOG !== "1" || process.env.VERCEL) notFound();
  const params = await searchParams;
  const key = (templateKeys as readonly string[]).includes(params.t ?? "") ? (params.t as TemplateKey) : "minimal";
  const layout = params.layout === "flow" || params.layout === "sheet" ? params.layout : "auto";
  return (
    <main style={{ padding: layout === "sheet" ? 24 : 0, background: "#eceae6", minHeight: "100vh" }}>
      <TemplateLab templateKey={key} layout={layout} />
    </main>
  );
}
