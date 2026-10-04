/** Public API: import this module without loading the CLI or test-site. */
export { openSession } from "./core/browser.js";
export type { Session } from "./core/browser.js";
export { runWorkflow } from "./core/runner.js";
export type { RunOptions } from "./core/runner.js";
export { defineWorkflow, WorkflowRegistry } from "./core/registry.js";
export * from "./core/steps.js";
export { fakePerson } from "./core/data.js";
export { browserOptionsFromEnvironment } from "./core/config.js";
export { proxyFromEnvironment } from "./core/proxy.js";
export { createSessionIdentity } from "./core/session.js";
export type { SessionIdentity } from "./core/session.js";
export * from "./core/types.js";
