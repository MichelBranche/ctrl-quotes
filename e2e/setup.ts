import fs from "node:fs";
import { expect, test as setup, type APIRequestContext } from "@playwright/test";

const baseURL = `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
const email = "giulia.neri@example.com";
const password = "Esempio123";

/** Sign-up sends a six digit code (email OTP): read it from the file mailbox and confirm. */
async function verifyByCode(request: APIRequestContext, headers: Record<string, string>, messages: Array<{ to: string; text: string }>, address: string) {
  const otp = messages.filter((message) => message.to === address).at(-1)?.text.match(/Codice:\s*(\d{6})/)?.[1];
  expect(otp, `codice per ${address}`).toBeTruthy();
  return request.post("/api/auth/email-otp/verify-email", { headers, data: { email: address, otp } });
}

setup("prepara un account fittizio", async ({ request }) => {
  fs.mkdirSync("e2e/.auth", { recursive: true });
  fs.mkdirSync("data", { recursive: true });
  fs.rmSync("data/e2e-emails.jsonl", { force: true });

  const headers = { origin: baseURL };
  const signUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Giulia Neri", email, password },
  });
  expect(signUp.ok()).toBeTruthy();

  const mailbox = await request.get("/api/dev/emails");
  expect(mailbox.ok()).toBeTruthy();
  const messages = (await mailbox.json()) as Array<{ to: string; text: string }>;
  expect((await verifyByCode(request, headers, messages, email)).ok()).toBeTruthy();

  const signIn = await request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password },
  });
  expect(signIn.ok()).toBeTruthy();

  const workspace = await request.post("/api/workspaces", {
    headers,
    data: { name: "Studio Esempio", taxProfile: "ordinario" },
  });
  expect(workspace.ok()).toBeTruthy();
  await request.storageState({ path: "e2e/.auth/state.json" });
});

setup("prepara un secondo account in un altro workspace", async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL });
  const headers = { origin: baseURL };
  const other = { name: "Paolo Verdi", email: "paolo.verdi@example.com", password: "Esempio456" };
  const signUp = await request.post("/api/auth/sign-up/email", { headers, data: other });
  expect(signUp.ok()).toBeTruthy();
  const mailbox = await request.get("/api/dev/emails");
  const messages = (await mailbox.json()) as Array<{ to: string; text: string }>;
  expect((await verifyByCode(request, headers, messages, other.email)).ok()).toBeTruthy();
  expect((await request.post("/api/auth/sign-in/email", { headers, data: { email: other.email, password: other.password } })).ok()).toBeTruthy();
  expect((await request.post("/api/workspaces", { headers, data: { name: "Studio Altrui", taxProfile: "ordinario" } })).ok()).toBeTruthy();
  await request.storageState({ path: "e2e/.auth/other.json" });
  await request.dispose();
});
