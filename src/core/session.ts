import { randomInt, randomUUID } from "node:crypto";
import type { BrowserOptions, ProxyOptions } from "./types.js";

/** Uma identidade por abertura; não muda durante os steps. */
export interface SessionIdentity {
  sessionId: string;
  fingerprintSeed: number;
  proxy?: ProxyOptions;
}

/** Não modifica a configuração recebida nem guarda identidades globalmente. */
export function createSessionIdentity(opts: BrowserOptions = {}): SessionIdentity {
  if (opts.proxy && opts.proxyPool) throw new Error("Use proxy ou proxyPool, não ambos");
  if (opts.proxyPool && !opts.proxyPool.length) throw new Error("proxyPool não pode ser vazia");
  const sessionId = randomUUID().replaceAll("-", "");
  const selected = opts.proxyPool ? opts.proxyPool[randomInt(opts.proxyPool.length)] : opts.proxy;
  if (opts.requireProxy && !selected) throw new Error("Proxy obrigatório: configure um gateway ou uma pool");
  const proxy = selected ? {
    ...selected,
    ...(selected.username !== undefined ? { username: selected.username.replaceAll("{session}", sessionId) } : {}),
  } : undefined;
  return { sessionId, fingerprintSeed: randomInt(10000, 100000), proxy };
}
