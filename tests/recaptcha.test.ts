import { describe, expect, it, vi } from "vitest";
import { recaptchaFromEnvironment, verifyRecaptcha, type RecaptchaConfig } from "../src/integrations/recaptcha.js";
import { createTestServer } from "../test-site/server.js";
const config: RecaptchaConfig = { siteKey: "public-key", secretKey: "private-secret", allowedHostnames: ["localhost"] };
const payload = { fullName: "Maria Teste", email: "maria@example.test", password: "test-password", confirmPassword: "test-password", country: "BR", terms: true };
const fakeFetch = (data: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(data))) as unknown as typeof fetch;

describe("reCAPTCHA verification", () => {
  it("requires paired keys and limits hostname", () => {
    expect(recaptchaFromEnvironment({})).toBeUndefined();
    expect(() => recaptchaFromEnvironment({ RECAPTCHA_SITE_KEY: "key" })).toThrow();
    expect(() => recaptchaFromEnvironment({ RECAPTCHA_SITE_KEY: "key", RECAPTCHA_SECRET_KEY: "secret", RECAPTCHA_ALLOWED_HOSTNAMES: " , " })).toThrow();
    expect(recaptchaFromEnvironment({ RECAPTCHA_SITE_KEY: "key", RECAPTCHA_SECRET_KEY: "secret" })?.allowedHostnames).toEqual(["localhost", "127.0.0.1"]);
  });
  it.each([undefined, "", {}, 123, "x".repeat(10001)])("rejects missing/malformed token without contacting Google", async token => {
    const fetcher = fakeFetch({ success: true, hostname: "localhost" });
    expect(await verifyRecaptcha(token, config, fetcher)).toBe("invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ success: false }, { success: "true", hostname: "localhost" }, { success: true }, { success: true, hostname: "evil.test" }, null])("rejects refused or malformed results", async result => {
    expect(await verifyRecaptcha("token", config, fakeFetch(result))).toBe("invalid");
  });
  it("sends form-encoded token to the official verification API", async () => {
    const fetcher = fakeFetch({ success: true, hostname: "localhost" });
    expect(await verifyRecaptcha("test-token", config, fetcher)).toBe("valid");
    const [url, options] = vi.mocked(fetcher).mock.calls[0];
    expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
    expect(options?.method).toBe("POST");
    expect((options?.body as URLSearchParams).get("secret")).toBe(config.secretKey);
    expect((options?.body as URLSearchParams).get("response")).toBe("test-token");
  });
  it("fails closed for HTTP, JSON and network failures", async () => {
    for (const fetcher of [vi.fn().mockResolvedValue(new Response("error", { status: 503 })), vi.fn().mockResolvedValue(new Response("not json")), vi.fn().mockRejectedValue(new Error("secret"))]) {
      expect(await verifyRecaptcha("token", config, fetcher as typeof fetch)).toBe("unavailable");
    }
  });
});

describe("own test-site CAPTCHA gate", () => {
  it("exposes only site key; blocks absent/refused tokens; creates only after validation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: false }))).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hostname: "localhost" })));
    const server = createTestServer({ recaptcha: config, fetcher: fetcher as typeof fetch });
    const base = await server.listen(0);
    try {
      const publicConfig = await (await fetch(`${base}/api/captcha-config`)).json();
      expect(publicConfig).toEqual({ enabled: true, siteKey: config.siteKey });
      expect(JSON.stringify(publicConfig)).not.toContain(config.secretKey);
      for (const token of [undefined, "refused", "accepted"]) {
        const response = await fetch(`${base}/api/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, "g-recaptcha-response": token }) });
        expect(response.status).toBe(token === "accepted" ? 201 : 422);
      }
      expect(server.accounts.size).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(JSON.stringify([...server.accounts.values()])).not.toContain("accepted");
    } finally { await server.close(); }
  });
  it("returns 503 and creates no account during verifier outage", async () => {
    const server = createTestServer({ recaptcha: config, fetcher: vi.fn().mockRejectedValue(new Error("secret-error")) as typeof fetch });
    const base = await server.listen(0);
    try {
      const response = await fetch(`${base}/api/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, "g-recaptcha-response": "token" }) });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret-error");
      expect(server.accounts.size).toBe(0);
    } finally { await server.close(); }
  });
});
