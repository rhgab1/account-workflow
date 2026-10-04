/**
 * Abstração do navegador. O resto do projeto depende só de `openSession()`,
 * então a troca de driver/configuração fica concentrada aqui.
 */

import { createSessionIdentity, type SessionIdentity } from "./session.js";
import { launch } from "cloakbrowser";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { BrowserOptions } from "./types.js";

export interface Session {
  identity: Omit<SessionIdentity, "proxy">;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function openSession(opts: BrowserOptions = {}): Promise<Session> {
  const identity = createSessionIdentity(opts);
  const browser = await launch({
    headless: opts.headless ?? true,
    humanize: opts.humanize ?? false,
    locale: opts.locale,
    timezone: opts.timezone,
    proxy: identity.proxy,
    args: ["--fingerprint=" + identity.fingerprintSeed],
    launchOptions: opts.slowMo ? { slowMo: opts.slowMo } : undefined,
  });
  try {
  const context = await browser.newContext();
  const page = await context.newPage();

  return {
    identity: { sessionId: identity.sessionId, fingerprintSeed: identity.fingerprintSeed },
    browser,
    context,
    page,
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
