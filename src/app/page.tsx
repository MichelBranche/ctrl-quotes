import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { readSession } from "@/server/session";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeGate />
    </Suspense>
  );
}

async function HomeGate() {
  await connection();
  const session = await readSession();
  redirect(session ? "/app/overview" : "/login");
  return null;
}
