import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { NavIndicatorPreview } from "@/components/shell/nav-preview";

export const metadata = { title: "Indicatore sidebar" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  await connection();
  // Local QA only. Hidden unless the catalog flag is set, and never on a
  // real Vercel deployment (VERCEL_REGION is set only in hosted functions).
  if (process.env.ENABLE_COMPONENT_CATALOG !== "1" || process.env.VERCEL_REGION) notFound();
  return <NavIndicatorPreview>{children}</NavIndicatorPreview>;
}
