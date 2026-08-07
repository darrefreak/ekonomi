import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const DEMO_EMAIL = "demo@ffos.local";
const DEMO_PASSWORD = "demo-password-123";
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3001";
const authFile = path.join(__dirname, ".auth", "demo.json");

setup("authenticate demo user", async ({ page, request }) => {
  const login = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const body = (await login.json()) as {
    tokens: { accessToken: string; refreshToken: string };
  };

  const households = await request.get(`${API_URL}/api/v1/households`, {
    headers: { Authorization: `Bearer ${body.tokens.accessToken}` },
  });
  expect(households.ok()).toBeTruthy();
  const list = (await households.json()) as Array<{ id: string }>;
  expect(list[0]?.id).toBeTruthy();

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.goto("/login");
  await page.evaluate(
    ({ accessToken, refreshToken, householdId }) => {
      localStorage.setItem("ffos.accessToken", accessToken);
      localStorage.setItem("ffos.refreshToken", refreshToken);
      localStorage.setItem("ffos.householdId", householdId);
    },
    {
      accessToken: body.tokens.accessToken,
      refreshToken: body.tokens.refreshToken,
      householdId: list[0]!.id,
    },
  );
  await page.context().storageState({ path: authFile });
});
