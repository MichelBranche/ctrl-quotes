import { Suspense } from "react";
import { connection } from "next/server";
import { AppShell } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/status";
import { loadShell } from "@/server/session";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}

async function AuthedShell({ children }: { children: React.ReactNode }) {
  await connection();
  const data = await loadShell();
  return <AppShell data={data}>{children}</AppShell>;
}

function ShellFallback() {
  return (
    <div className="shell" aria-busy="true">
      <div className="sidebar">
        <Skeleton width="70%" />
        <Skeleton width="100%" />
      </div>
      <div className="page">
        <Skeleton width="40%" />
      </div>
    </div>
  );
}
