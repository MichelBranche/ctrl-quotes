import { connection, NextResponse } from "next/server";
import { readFileEmails } from "@/server/email";

export async function GET(): Promise<Response> {
  await connection();
  if (process.env.ENABLE_DEV_MAILBOX !== "1" || process.env.VERCEL) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  const messages = await readFileEmails();
  return NextResponse.json(messages);
}
