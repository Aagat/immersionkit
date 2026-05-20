import { describe, expect, it } from "vitest";

import { createDebugInspectorController } from "../src/content/debug-inspector-controller";
import {
  createDebugTraceStore,
  createWordDecisionTrace
} from "../src/content/debug-trace-store";
import { createRuntimeState } from "../src/content/state";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("debug inspector controller", () => {
  it("selects injected tokens only while inspect mode is active", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const runtimeState = createRuntimeState();
      runtimeState.debugTrace = createDebugTraceStore();
      runtimeState.debugTrace.beginRun({ reason: "controller-test" });
      runtimeState.debugTrace.recordTokenDecision(
        createWordDecisionTrace({
          tokenId: "ikn-test-t0",
          nodeId: "ikn-test",
          sourceToken: "city",
          normalizedSourceToken: "city",
          targetToken: "ciudad",
          sentenceHash: null,
          start: 0,
          end: 4,
          finalAction: "injected",
          contextDecision: {
            evaluated: true,
            decision: "inject"
          },
          explanation: "Token rendered."
        })
      );

      const token = document.createElement("span");
      token.textContent = "ciudad";
      token.setAttribute("data-ik-token-id", "ikn-test-t0");
      token.setAttribute("data-ik-node-id", "ikn-test");
      token.setAttribute("data-ik-source-token", "city");
      token.setAttribute("data-ik-target-token", "ciudad");
      token.setAttribute("data-ik-source-lemma", "city");
      token.setAttribute("data-ik-lexeme-id", "lex:city");
      token.setAttribute("data-ik-render-unit-id", "ru-city");
      token.setAttribute("data-ik-status", "new");
      token.setAttribute("data-ik-pos", "noun");
      token.setAttribute("data-ik-word-kind", "discovery");
      document.body.append(token);

      const controller = createDebugInspectorController(runtimeState);
      expect(controller.trySelectTarget(token, "click")).toBe(false);

      controller.setInspectMode(true);
      expect(controller.trySelectTarget(token, "click")).toBe(true);
      expect(token.getAttribute("data-ik-debug-selected")).toBe("true");
      expect(runtimeState.debugTrace.readSnapshot().selected?.type).toBe("word");

      controller.setInspectMode(false);
      expect(token.hasAttribute("data-ik-debug-selected")).toBe(false);
    });
  });
});
