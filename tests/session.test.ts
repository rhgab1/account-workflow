import { describe, expect, it, vi } from "vitest";
const randomInt = vi.hoisted(() => vi.fn());
const randomUUID = vi.hoisted(() => vi.fn());
vi.mock("node:crypto", () => ({ randomInt, randomUUID }));
import { createSessionIdentity } from "../src/core/session.js";
import { browserOptionsFromEnvironment } from "../src/core/config.js";

describe("session configuration reused by any workflow", () => {
  it("creates fresh identity without mutating reusable proxy options", () => {
    randomUUID.mockReturnValueOnce("aaaa-bbbb").mockReturnValueOnce("cccc-dddd");
    randomInt.mockReturnValueOnce(12345).mockReturnValueOnce(54321);
    const proxy = { server: "http://pool.test:80", username: "account-session-{session}", password: "secret" };
    const first = createSessionIdentity({ proxy });
    const second = createSessionIdentity({ proxy });
    expect(first.fingerprintSeed).toBe(12345);
    expect(second.fingerprintSeed).toBe(54321);
    expect(first.proxy?.username).toBe("account-session-aaaabbbb");
    expect(second.proxy?.username).toBe("account-session-ccccdddd");
    expect(proxy.username).toBe("account-session-{session}");
    expect(first.proxy?.server).toBe(second.proxy?.server);
  });
  it("selects one pool entry for a whole execution", () => {
    randomUUID.mockReturnValue("session-id");
    randomInt.mockReturnValueOnce(1).mockReturnValueOnce(12345);
    const proxyPool = [{ server: "http://one.test:80" }, { server: "http://two.test:80" }];
    expect(createSessionIdentity({ proxyPool }).proxy?.server).toBe("http://two.test");
    expect(randomInt).toHaveBeenCalledWith(2);
  });
  it("rejects missing required proxy or ambiguous configuration", () => {
    expect(() => createSessionIdentity({ requireProxy: true })).toThrow(/obrigatório/);
    expect(() => createSessionIdentity({ proxyPool: [] })).toThrow(/vazia/);
    expect(() => createSessionIdentity({ proxy: { server: "" } })).toThrow(/vazio/);
    expect(() => createSessionIdentity({ proxy: { server: "ftp://bad.test" } })).toThrow(/inválido/);
    expect(() => createSessionIdentity({ proxy: { server: "http://one.test" }, proxyPool: [{ server: "http://two.test" }] })).toThrow(/ambos/);
  });
  it("loads configuration from environment for programmatic callers", () => {
    const result = browserOptionsFromEnvironment({
      WORKFLOW_PROXY_SERVER: "http://gateway.test:8080",
      WORKFLOW_PROXY_USERNAME: "session-{session}",
      WORKFLOW_REQUIRE_PROXY: "true",
    }, { headless: false });
    expect(result).toMatchObject({ headless: false, requireProxy: true, proxy: { server: "http://gateway.test:8080", username: "session-{session}" } });
  });
  it("validates pool entries and handles gateway overrides", () => {
    const env = { WORKFLOW_PROXY_POOL: '["http://one.test:80","http://two.test:80"]' };
    expect(browserOptionsFromEnvironment(env).proxyPool).toHaveLength(2);
    expect(browserOptionsFromEnvironment(env, { proxyServer: "http://override.test:80" }).proxy?.server).toBe("http://override.test");
    for (const value of ["oops", "[]", "[123]", '[""]']) expect(() => browserOptionsFromEnvironment({ WORKFLOW_PROXY_POOL: value })).toThrow();
  });
});
