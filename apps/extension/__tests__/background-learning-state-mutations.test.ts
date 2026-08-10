import { describe, expect, it } from "vitest";

import {
  runLearningStateMutation,
  waitForLearningStateMutations
} from "../src/background/learning-state-mutations";

describe("background learning-state mutation queue", () => {
  it("continues after a rejected mutation and unblocks subsequent reads", async () => {
    const order: string[] = [];

    await expect(
      runLearningStateMutation(async () => {
        order.push("failed");
        throw new Error("expected mutation failure");
      })
    ).rejects.toThrow("expected mutation failure");

    await expect(
      runLearningStateMutation(async () => {
        order.push("recovered");
        return "stored";
      })
    ).resolves.toBe("stored");
    await expect(waitForLearningStateMutations()).resolves.toBeUndefined();
    expect(order).toEqual(["failed", "recovered"]);
  });
});
