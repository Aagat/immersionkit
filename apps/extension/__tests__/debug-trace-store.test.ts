import { describe, expect, it } from "vitest";

import {
  createDebugTraceStore,
  createWordDecisionTrace
} from "../src/content/debug-trace-store";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("debug trace store", () => {
  it("caps token decisions and redacts export URL details", async () => {
    await withFixtureDom(
      "article-basic.html",
      {
        url: "https://news.example.test/story?api_key=secret#private"
      },
      () => {
        const store = createDebugTraceStore();
        store.beginRun({
          reason: "test-run"
        });

        for (let index = 0; index < 2005; index += 1) {
          store.recordTokenDecision(
            createWordDecisionTrace({
              nodeId: "ikn-test",
              sourceToken: `word-${index}`,
              normalizedSourceToken: `word-${index}`,
              sentenceHash: null,
              start: index,
              end: index + 4,
              finalAction: "skipped-no-render-unit",
              explanation: "No render unit."
            })
          );
        }

        const snapshot = store.readSnapshot();
        expect(snapshot.page.url).toBe("https://news.example.test/story");
        expect(Object.keys(snapshot.tokensByTokenId)).toHaveLength(2000);
        expect(snapshot.dropped.tokens).toBe(5);

        const exported = store.exportTrace();
        expect(exported.extensionBuildProfile).toBe("diagnostic");
        expect(exported.trace.page.url).not.toContain("secret");
        expect(exported.redactions).toContain(
          "provider API keys are not captured"
        );
      }
    );
  });
});
