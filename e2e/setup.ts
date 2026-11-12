import fs from "node:fs";
import { expect, test as setup } from "@playwright/test";

const email = "giulia.neri@example.com";
const password = "Esempio123";

setup("prepara un account fittizio", async ({ request }) => {
  fs.mkdirSync("e2e/.auth", { recursive: true });
  fs.mkdirSync("data", { recursive: true });
  fs.rmSync("data/e2e-emails.jsonl", { force: true });

  const headers = { origin: "http://127.0.0.1:3000" };
  const signUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Giulia Neri", email, password },
  });
  expect(signUp.ok()).toBeTruthy();

  const mailbox = await request.get("/api/dev/emails");
  expect(mailbox.ok()).toBeTruthy();
  const messages = (await mailbox.json()) as Array<{ text: string }>;
  const link = messages.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();
  const verify = await request.get(link!);
  expect(verify.ok()).toBeTruthy();

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
  const request = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3000" });
  const headers = { origin: "http://127.0.0.1:3000" };
  const other = { name: "Paolo Verdi", email: "paolo.verdi@example.com", password: "Esempio456" };
  const signUp = await request.post("/api/auth/sign-up/email", { headers, data: other });
  expect(signUp.ok()).toBeTruthy();
  const mailbox = await request.get("/api/dev/emails");
  const messages = (await mailbox.json()) as Array<{ to: string; text: string }>;
  const link = messages.filter((message) => JSON.stringify(message).includes(other.email)).at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();
  expect((await request.get(link!)).ok()).toBeTruthy();
  expect((await request.post("/api/auth/sign-in/email", { headers, data: { email: other.email, password: other.password } })).ok()).toBeTruthy();
  expect((await request.post("/api/workspaces", { headers, data: { name: "Studio Altrui", taxProfile: "ordinario" } })).ok()).toBeTruthy();
  await request.storageState({ path: "e2e/.auth/other.json" });
  await request.dispose();
});
