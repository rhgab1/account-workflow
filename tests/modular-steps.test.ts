import { describe, expect, it, vi } from "vitest";
import { when, waitForManualInput } from "../src/core/steps.js";
import type { WorkflowContext } from "../src/core/types.js";

describe("site independent steps", () => {
  it("does not execute a disabled branch and keeps optional semantics", async () => {
    const run = vi.fn();
    const step = when(() => false, { name: "optional operation", optional: true, run });
    expect(step.optional).toBe(true);
    await step.run({} as WorkflowContext);
    expect(run).not.toHaveBeenCalled();
    await when(async () => true, { name: "operation", run }).run({} as WorkflowContext);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("waits for user input using the caller selector and timeout without persisting tokens", async () => {
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    const state = {};
    await waitForManualInput("#my-verification", 5000).run({
      page: { waitForFunction }, log, state,
    } as unknown as WorkflowContext);
    expect(waitForFunction).toHaveBeenCalledWith(expect.any(Function), "#my-verification", { timeout: 5000 });
    expect(state).toEqual({});
    expect(log).toHaveBeenCalledTimes(1);
  });
});
