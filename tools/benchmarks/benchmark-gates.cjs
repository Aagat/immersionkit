const EPSILON = 1e-9;

const TASK_02_THRESHOLDS = {
  prototypeMustSkipPrecision: 1,
  prototypeMustInjectCoverage: 13 / 14,
  productionQualityDecisionAccuracy: 1,
  productionQualityWrongSenseRenderedCount: 0,
  productionQualityMissedExpectedInjectCount: 0,
  productionQualityWrongTargetCount: 0
};

const TASK_03_THRESHOLDS = {
  "shared-annotated": {
    precision: 18 / 19,
    recall: 18 / 19
  },
  "compromise-three": {
    precision: 0.95,
    recall: 1
  },
  "wink-nlp": {
    precision: 0.95,
    recall: 1
  }
};

const TASK_04_THRESHOLDS = {
  phraseAwareMinimumSavedRatio: 0.34
};

const TASK_05_THRESHOLDS = {
  beginner_a2: {
    ndcgAt5: 0.9787548397292644,
    pairwiseAccuracy: 0.967741935483871,
    spearmanRho: 0.940357423386484,
    precisionAt5: 1
  },
  intermediate_b1: {
    ndcgAt5: 0.46072285643397193,
    pairwiseAccuracy: 0.6507936507936508,
    spearmanRho: 0.34352771533573245,
    precisionAt5: 0.6
  }
};

function validateTask02Payload(payload) {
  const checks = [];
  const summary = payload?.result?.summary;
  const status = payload?.status;

  checks.push({
    id: "task-02-browser-status-pass",
    passed: status === "pass",
    message: `Browser validation status should be pass; got ${String(status)}.`
  });

  checks.push({
    id: "task-02-snapshot-checks-pass",
    passed: payload?.result?.checks?.pass === true,
    message: "Task 02 annotated browser snapshot checks must pass."
  });

  checks.push(
    atLeastCheck({
      id: "task-02-prototype-must-skip-precision",
      actual: summary?.prototype?.mustSkipPrecision,
      minimum: TASK_02_THRESHOLDS.prototypeMustSkipPrecision,
      message:
        "Task 02 prototype must-skip precision must remain 100% on the current annotated corpus."
    })
  );

  checks.push(
    atLeastCheck({
      id: "task-02-prototype-must-inject-coverage",
      actual: summary?.prototype?.mustInjectCoverage,
      minimum: TASK_02_THRESHOLDS.prototypeMustInjectCoverage,
      message:
        "Task 02 prototype must-inject coverage must stay at or above the current 92.9% rounded target unless an approval is documented."
    })
  );

  checks.push(
    atLeastCheck({
      id: "task-02-production-quality-decision-accuracy",
      actual: payload?.result?.productionQuality?.decisionAccuracy,
      minimum: TASK_02_THRESHOLDS.productionQualityDecisionAccuracy,
      message:
        "Task 02 production quality decisions must stay exact on the refactor-aligned corpus."
    })
  );

  const productionQuality = payload?.result?.productionQuality;
  checks.push(
    atMostCheck({
      id: "task-02-production-quality-wrong-sense-rendered",
      actual: productionQuality?.wrongSenseRenderedCaseIds?.length,
      maximum: TASK_02_THRESHOLDS.productionQualityWrongSenseRenderedCount,
      message:
        "Task 02 production quality rendering must not render known wrong-sense replacements."
    })
  );

  checks.push(
    atMostCheck({
      id: "task-02-production-quality-missed-expected-inject",
      actual: productionQuality?.missedExpectedInjectCaseIds?.length,
      maximum: TASK_02_THRESHOLDS.productionQualityMissedExpectedInjectCount,
      message:
        "Task 02 production quality rendering must keep safe positive injections renderable."
    })
  );

  checks.push(
    atMostCheck({
      id: "task-02-production-quality-wrong-target",
      actual: productionQuality?.wrongTargetCaseIds?.length,
      maximum: TASK_02_THRESHOLDS.productionQualityWrongTargetCount,
      message:
        "Task 02 production quality rendering must keep expected target senses aligned."
    })
  );

  return summarizeChecks(checks);
}

function validateTask03Payload(payload) {
  const checks = [];
  const implementations = Array.isArray(payload?.implementations)
    ? payload.implementations
    : [];
  const byId = new Map(
    implementations.map((implementation) => [
      implementation.implementationId,
      implementation
    ])
  );

  for (const assertion of payload?.assertions ?? []) {
    checks.push({
      id: `task-03-browser-assertion-${slugify(assertion.name)}`,
      passed: assertion.passed === true,
      message: assertion.details ?? assertion.name
    });
  }

  for (const [implementationId, thresholds] of Object.entries(TASK_03_THRESHOLDS)) {
    const implementation = byId.get(implementationId);
    checks.push({
      id: `task-03-${implementationId}-present`,
      passed: Boolean(implementation),
      message: `Task 03 implementation ${implementationId} must be present.`
    });

    checks.push(
      atLeastCheck({
        id: `task-03-${implementationId}-precision`,
        actual: implementation?.overall?.precision,
        minimum: thresholds.precision,
        message: `Task 03 ${implementationId} phrase precision must not regress below the current target.`
      })
    );

    checks.push(
      atLeastCheck({
        id: `task-03-${implementationId}-recall`,
        actual: implementation?.overall?.recall,
        minimum: thresholds.recall,
        message: `Task 03 ${implementationId} phrase recall must not regress below the current target.`
      })
    );
  }

  return summarizeChecks(checks);
}

function validateTask04Payload(payload) {
  const checks = [];
  const policyById = new Map(
    (payload?.policies ?? []).map((policy) => [policy.policyId, policy])
  );
  const injected = policyById.get("injected-token-length-dedupe");
  const phraseAware = policyById.get("phrase-aware-shortlist");
  const metadata = payload?.metadata;

  checks.push({
    id: "task-04-provenance-generated-at-present",
    passed: typeof metadata?.generatedAt === "string" && metadata.generatedAt.length > 0,
    message: "Task 04 artifact should include metadata.generatedAt."
  });

  checks.push({
    id: "task-04-provenance-browser-context-present",
    passed:
      typeof metadata?.browserContext?.userAgent === "string" &&
      metadata.browserContext.userAgent.length > 0,
    message: "Task 04 artifact should include browser user-agent provenance."
  });

  for (const assertion of payload?.assertions ?? []) {
    checks.push({
      id: `task-04-browser-assertion-${assertion.id}`,
      passed: assertion.passed === true,
      message: assertion.message
    });
  }

  checks.push(
    atLeastCheck({
      id: "task-04-phrase-aware-call-savings",
      actual: phraseAware?.estimatedAnalysisCallsSavedRatio,
      minimum: TASK_04_THRESHOLDS.phraseAwareMinimumSavedRatio,
      message:
        "Task 04 phrase-aware shortlist should preserve at least the current 34% analysis-call savings."
    })
  );

  checks.push({
    id: "task-04-phrase-aware-reduces-false-negatives",
    passed:
      typeof phraseAware?.falseNegativeCount === "number" &&
      typeof injected?.falseNegativeCount === "number" &&
      phraseAware.falseNegativeCount < injected.falseNegativeCount,
    message:
      "Task 04 phrase-aware shortlist should reduce false negatives relative to injected-token length+dedupe."
  });

  return summarizeChecks(checks);
}

function validateTask05Results(results) {
  const checks = [];
  const byProfile = new Map((results ?? []).map((result) => [result.profileId, result]));

  for (const [profileId, thresholds] of Object.entries(TASK_05_THRESHOLDS)) {
    const result = byProfile.get(profileId);
    checks.push({
      id: `task-05-${profileId}-present`,
      passed: Boolean(result),
      message: `Task 05 profile ${profileId} must be present.`
    });

    for (const [metric, minimum] of Object.entries(thresholds)) {
      checks.push(
        atLeastCheck({
          id: `task-05-${profileId}-prototype-${metric}`,
          actual: result?.prototypeMetrics?.[metric],
          minimum,
          message: `Task 05 ${profileId} prototype ${metric} must not regress against the default preset target.`
        })
      );
    }
  }

  return summarizeChecks(checks);
}

function atLeastCheck({ id, actual, minimum, message }) {
  const numericActual = typeof actual === "number" ? actual : Number.NaN;
  const passed = Number.isFinite(numericActual) && numericActual + EPSILON >= minimum;

  return {
    id,
    passed,
    actual: Number.isFinite(numericActual) ? numericActual : null,
    minimum,
    message: `${message} Actual ${formatMetric(numericActual)}, minimum ${formatMetric(minimum)}.`
  };
}

function atMostCheck({ id, actual, maximum, message }) {
  const numericActual = typeof actual === "number" ? actual : Number.NaN;
  const passed = Number.isFinite(numericActual) && numericActual <= maximum + EPSILON;

  return {
    id,
    passed,
    actual: Number.isFinite(numericActual) ? numericActual : null,
    maximum,
    message: `${message} Actual ${formatMetric(numericActual)}, maximum ${formatMetric(maximum)}.`
  };
}

function summarizeChecks(checks) {
  const failures = checks
    .filter((check) => !check.passed)
    .map((check) => `${check.id}: ${check.message}`);

  return {
    pass: failures.length === 0,
    checks,
    failures
  };
}

function formatMetric(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(6);
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = {
  TASK_02_THRESHOLDS,
  TASK_03_THRESHOLDS,
  TASK_04_THRESHOLDS,
  TASK_05_THRESHOLDS,
  validateTask02Payload,
  validateTask03Payload,
  validateTask04Payload,
  validateTask05Results
};
