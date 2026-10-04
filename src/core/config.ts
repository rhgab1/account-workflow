import { proxyFromEnvironment } from "./proxy.js";
import type { BrowserOptions, ProxyOptions } from "./types.js";

/** Reutilizável pela CLI, testes e aplicações que importem o runner. */
export function browserOptionsFromEnvironment(
  env: Record<string, string | undefined> = process.env,
  overrides: BrowserOptions & { proxyServer?: string } = {},
): BrowserOptions {
  const { proxyServer, ...explicit } = overrides;
  const requireProxy = explicit.requireProxy ?? env.WORKFLOW_REQUIRE_PROXY === "true";
  if (explicit.proxy || explicit.proxyPool) return { ...explicit, requireProxy };
  if (env.WORKFLOW_PROXY_POOL && !proxyServer) {
    let raw: unknown;
    try { raw = JSON.parse(env.WORKFLOW_PROXY_POOL); }
    catch { throw new Error("WORKFLOW_PROXY_POOL deve ser um array JSON de gateways"); }
    if (!Array.isArray(raw) || !raw.length) throw new Error("WORKFLOW_PROXY_POOL não pode ser vazia");
    const proxyPool: ProxyOptions[] = raw.map(item => {
      if (typeof item !== "string") throw new Error("Cada gateway da pool deve ser uma URL");
      return proxyFromEnvironment({
        WORKFLOW_PROXY_SERVER: item,
        WORKFLOW_PROXY_USERNAME: env.WORKFLOW_PROXY_USERNAME,
        WORKFLOW_PROXY_PASSWORD: env.WORKFLOW_PROXY_PASSWORD,
      })!;
    });
    return { ...explicit, proxyPool, requireProxy };
  }
  return { ...explicit, proxy: proxyFromEnvironment(env, proxyServer), requireProxy };
}
