import { describe, expect, it } from "vitest";
import { validateFeedbackPayload } from "../src";

describe("feedback validation", () => {
  it("accepts bounded support feedback with fixed diagnostics", () => {
    const feedback = validateFeedbackPayload({
      installId: "ins_123",
      category: "bug",
      message: "The popup did not open after clicking the toolbar icon.",
      contactEmail: "reader@example.test",
      diagnostics: {
        extensionVersion: "0.1.0",
        buildProfile: "preview",
        locale: "en-US",
        timezoneOffsetMinutes: -60,
      },
    });

    expect(feedback.category).toBe("bug");
    expect(feedback.diagnostics.buildProfile).toBe("preview");
  });

  it("rejects feedback diagnostics that include page content or URLs", () => {
    expect(() =>
      validateFeedbackPayload({
        category: "translation",
        description: "This inline replacement looked wrong.",
        diagnostics: {
          extensionVersion: "0.1.0",
          pageText: "private article text",
        },
      }),
    ).toThrow(/not allowed/);
  });

  it("rejects unsupported feedback categories", () => {
    expect(() =>
      validateFeedbackPayload({
        category: "learning_state",
        message: "Unexpected category.",
        diagnostics: {},
      }),
    ).toThrow(/unsupported value/);
  });
});
