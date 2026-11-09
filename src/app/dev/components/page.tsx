import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ComponentCatalog } from "@/components/catalog/component-catalog";

export const metadata = { title: "Componenti" };

export default function ComponentsPage() {
  return (
    <Suspense fallback={<main className="page">Catalogo componenti</main>}>
      <CatalogGate />
    </Suspense>
  );
}

async function CatalogGate() {
  await connection();
  if (process.env.ENABLE_COMPONENT_CATALOG !== "1" || process.env.VERCEL) notFound();
  return (
    <main className="page">
      <ComponentCatalog />
    </main>
  );
}
