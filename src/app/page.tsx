import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readSession } from "@/server/session";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeGate />
    </Suspense>
  );
}

async function HomeGate() {
  const session = await readSession();
  redirect(session ? "/app/overview" : "/login");
  return null;
}
