import { useEffect, useMemo, useState } from "react";
import { DIAGNOSTICS_ENABLED } from "../build-profile";
import {
  DEBUG_INSPECTOR_COMMAND_MESSAGE_TYPE,
  isDebugInspectorEventMessage,
  type DebugInspectorCommand
} from "../shared/debug-overlay";
import type {
  DebugSelectionSnapshot,
  DebugTimelineEvent,
  DebugTraceExport,
  DebugTraceSnapshot
} from "../content/debug-trace-store";

type InspectorTab = "pipeline" | "selection" | "decisions" | "data" | "export";
type DecisionFilter =
  | "all"
  | "injected"
  | "skipped"
  | "context-suppressed"
  | "curriculum-skipped"
  | "sampling-skipped"
  | "phrase-rejected"
  | "sentence-candidates";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "pipeline", label: "./pipeline" },
  { id: "selection", label: "./selection" },
  { id: "decisions", label: "./decisions" },
  { id: "data", label: "./data" },
  { id: "export", label: "./export" }
];

const FILTERS: { id: DecisionFilter; label: string }[] = [
  { id: "all", label: "all" },
  { id: "injected", label: "injected" },
  { id: "skipped", label: "skipped" },
  { id: "context-suppressed", label: "context" },
  { id: "curriculum-skipped", label: "curriculum" },
  { id: "sampling-skipped", label: "sampling" },
  { id: "phrase-rejected", label: "phrase rejected" },
  { id: "sentence-candidates", label: "sentences" }
];

export function DebugPanelApp() {
  const [snapshot, setSnapshot] = useState<DebugTraceSnapshot | null>(null);
  const [selection, setSelection] = useState<DebugSelectionSnapshot | null>(null);
  const [inspectMode, setInspectMode] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>("pipeline");
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [collapsed, setCollapsed] = useState(false);
  const [exportPayload, setExportPayload] = useState<DebugTraceExport | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !isDebugInspectorEventMessage(event.data)) {
        return;
      }

      const inspectorEvent = event.data.event;
      switch (inspectorEvent.type) {
        case "snapshot":
          setSnapshot(inspectorEvent.snapshot);
          setSelection(inspectorEvent.snapshot.selected ?? null);
          break;
        case "selection":
          setSelection(inspectorEvent.selection);
          if (inspectorEvent.selection) {
            setCollapsed(false);
            setActiveTab("selection");
            setStatusMessage(null);
            postCommand({ type: "collapse", collapsed: false });
          }
          break;
        case "inspect-mode":
          setInspectMode(inspectorEvent.enabled);
          break;
        case "export":
          setExportPayload(inspectorEvent.payload);
          setActiveTab("export");
          setStatusMessage(`export ready: ${inspectorEvent.fileName}`);
          break;
        case "error":
          setStatusMessage(
            inspectorEvent.detail
              ? `${inspectorEvent.reason}: ${inspectorEvent.detail}`
              : inspectorEvent.reason
          );
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    postCommand({ type: "request-snapshot" });
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const decisions = useMemo(() => collectDecisionRows(snapshot, filter), [snapshot, filter]);

  if (!DIAGNOSTICS_ENABLED) {
    return (
      <div className="ik-debug-root ik-debug-terminal">
        <div className="ik-debug-unavailable">
          <span className="ik-debug-prompt">$ ik.debug</span>
          <h1>Diagnostics are disabled in this build.</h1>
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="ik-debug-root ik-debug-terminal ik-debug-root--collapsed">
        <button
          type="button"
          aria-label={
            inspectMode
              ? "Expand debug inspector. Inspect mode is on."
              : "Expand debug inspector."
          }
          className="ik-debug-rail-button"
          onClick={() => {
            setCollapsed(false);
            postCommand({ type: "collapse", collapsed: false });
          }}
        >
          <span className="ik-debug-rail-dot" aria-hidden="true" />
          <span>IK</span>
          <span className="ik-debug-rail-state">
            {inspectMode ? "ON" : "DBG"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="ik-debug-root ik-debug-terminal">
      <Header
        snapshot={snapshot}
        inspectMode={inspectMode}
        statusMessage={statusMessage}
        onToggleInspect={() => {
          const nextInspectMode = !inspectMode;
          postCommand({ type: "set-inspect-mode", enabled: nextInspectMode });
          if (nextInspectMode) {
            setCollapsed(true);
            setStatusMessage("inspect armed: click a highlighted mark on the page");
            postCommand({ type: "collapse", collapsed: true });
          } else {
            setStatusMessage(null);
          }
        }}
        onRefresh={() => {
          postCommand({ type: "refresh-page" });
        }}
        onExport={() => {
          postCommand({ type: "export-trace" });
        }}
        onCollapse={() => {
          setCollapsed(true);
          postCommand({ type: "collapse", collapsed: true });
        }}
        onClose={() => {
          postCommand({ type: "close" });
        }}
      />

      <nav className="ik-debug-tabs" aria-label="Debug inspector tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? "is-active" : ""}
            onClick={() => {
              setActiveTab(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="ik-debug-main">
        {activeTab === "pipeline" ? <PipelineTab snapshot={snapshot} /> : null}
        {activeTab === "selection" ? (
          <SelectionTab selection={selection} snapshot={snapshot} />
        ) : null}
        {activeTab === "decisions" ? (
          <DecisionsTab
            filter={filter}
            decisions={decisions}
            onFilterChange={setFilter}
          />
        ) : null}
        {activeTab === "data" ? (
          <DataTab snapshot={snapshot} selection={selection} />
        ) : null}
        {activeTab === "export" ? (
          <ExportTab
            snapshot={snapshot}
            selection={selection}
            exportPayload={exportPayload}
            onRequestExport={() => {
              postCommand({ type: "export-trace" });
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

function Header({
  snapshot,
  inspectMode,
  statusMessage,
  onToggleInspect,
  onRefresh,
  onExport,
  onCollapse,
  onClose
}: {
  snapshot: DebugTraceSnapshot | null;
  inspectMode: boolean;
  statusMessage: string | null;
  onToggleInspect: () => void;
  onRefresh: () => void;
  onExport: () => void;
  onCollapse: () => void;
  onClose: () => void;
}) {
  const pageHost = snapshot?.page.hostname ?? "waiting";
  return (
    <header className="ik-debug-header">
      <div className="ik-debug-title-block">
        <span className="ik-debug-prompt">IK_DEBUG_INSPECTOR</span>
        <div className="ik-debug-runline">
          run={snapshot?.runId ?? "pending"} page={pageHost} profile=diagnostic{" "}
          INSPECT:{inspectMode ? "ON" : "OFF"}
        </div>
        {statusMessage ? <div className="ik-debug-status">{statusMessage}</div> : null}
      </div>
      <div className="ik-debug-actions">
        <button type="button" data-active={inspectMode} onClick={onToggleInspect}>
          Inspect
        </button>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" onClick={onExport}>
          Export
        </button>
        <button type="button" onClick={onCollapse}>
          Collapse
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </header>
  );
}

function PipelineTab({ snapshot }: { snapshot: DebugTraceSnapshot | null }) {
  if (!snapshot) {
    return <EmptyState prompt="$ ik.trace --last-run" text="Waiting for trace data." />;
  }

  const tokenCount = Object.keys(snapshot.tokensByTokenId).length;
  const phraseCount = Object.keys(snapshot.phrasesByTokenId).length;
  const sentenceCount = Object.keys(snapshot.sentencesByHash).length;

  return (
    <section className="ik-debug-grid">
      <div className="ik-debug-panel ik-debug-log-panel">
        <PanelTitle prompt="$ ik.trace --last-run" />
        <div className="ik-debug-log">
          {snapshot.events.map((event) => (
            <LogRow key={event.id} event={event} />
          ))}
        </div>
      </div>
      <aside className="ik-debug-panel">
        <PanelTitle prompt="$ ik.run --summary" />
        <dl className="ik-debug-kv">
          <div>
            <dt>status</dt>
            <dd>{snapshot.status}</dd>
          </div>
          <div>
            <dt>url</dt>
            <dd>{snapshot.page.url}</dd>
          </div>
          <div>
            <dt>nodes</dt>
            <dd>{snapshot.nodes.length}</dd>
          </div>
          <div>
            <dt>tokens</dt>
            <dd>{tokenCount}</dd>
          </div>
          <div>
            <dt>phrases</dt>
            <dd>{phraseCount}</dd>
          </div>
          <div>
            <dt>sentences</dt>
            <dd>{sentenceCount}</dd>
          </div>
          <div>
            <dt>dropped</dt>
            <dd>{Object.values(snapshot.dropped).reduce((sum, value) => sum + value, 0)}</dd>
          </div>
        </dl>
        {snapshot.context ? (
          <pre className="ik-debug-json">{JSON.stringify(snapshot.context, null, 2)}</pre>
        ) : null}
      </aside>
    </section>
  );
}

function SelectionTab({
  selection,
  snapshot
}: {
  selection: DebugSelectionSnapshot | null;
  snapshot: DebugTraceSnapshot | null;
}) {
  if (!selection) {
    return (
      <EmptyState
        prompt="$ ik.select"
        text="Turn Inspect on, then click an injected word, phrase, or sentence note."
      />
    );
  }

  return (
    <section className="ik-debug-grid">
      <div className="ik-debug-panel">
        <PanelTitle prompt="$ ik.selection --explain" />
        <SelectionSummary selection={selection} />
        <DecisionStack selection={selection} />
      </div>
      <aside className="ik-debug-panel">
        <PanelTitle prompt="$ ik.selection --dom" />
        <pre className="ik-debug-json">{JSON.stringify(selection.dom, null, 2)}</pre>
        {selection.sentence ? (
          <>
            <PanelTitle prompt="$ ik.sentence --selected" />
            <pre className="ik-debug-json">
              {JSON.stringify(selection.sentence, null, 2)}
            </pre>
          </>
        ) : snapshot ? (
          <p className="ik-debug-muted">No sentence trace is linked to this selection.</p>
        ) : null}
      </aside>
    </section>
  );
}

function SelectionSummary({ selection }: { selection: DebugSelectionSnapshot }) {
  if (selection.type === "sentence-note") {
    return (
      <div className="ik-debug-selection-card">
        <span className="ik-debug-chip">sentence-note</span>
        <h2>{selection.sentenceHash}</h2>
        <p>{selection.sentence?.sourcePreview ?? "No sentence trace recorded."}</p>
      </div>
    );
  }

  const source =
    selection.type === "word"
      ? selection.trace.sourceToken
      : selection.trace.sourceText ?? selection.trace.phraseId;
  const target =
    selection.type === "word"
      ? selection.trace.targetToken
      : selection.trace.targetText ?? "no target";
  return (
    <div className="ik-debug-selection-card">
      <span className="ik-debug-chip">{selection.type}</span>
      <h2>
        {source} -&gt; {target}
      </h2>
      <p>{selection.trace.explanation}</p>
    </div>
  );
}

function DecisionStack({ selection }: { selection: DebugSelectionSnapshot }) {
  if (selection.type === "sentence-note") {
    return (
      <pre className="ik-debug-json">
        {JSON.stringify(selection.sentence ?? { sentence: "missing" }, null, 2)}
      </pre>
    );
  }

  if (selection.type === "phrase") {
    const trace = selection.trace;
    return (
      <ol className="ik-debug-stack">
        <StackItem label="render_policy" ok={trace.gates.renderPolicyOk} detail={trace.match.renderPolicy ?? "inline"} />
        <StackItem label="learning_item" ok={trace.gates.activeLearningItem} detail={trace.learningItem.itemId ?? "missing"} />
        <StackItem label="target" ok={trace.gates.usableTarget} detail={trace.targetText ?? "blank"} />
        <StackItem label="span" ok={trace.gates.spanResolved} detail={formatOffset(trace.offset)} />
        <StackItem label="curriculum" ok={trace.gates.curriculumEligible !== false} detail={trace.rejectedReason ?? "eligible"} />
        <StackItem label="overlap" ok={trace.gates.overlapSelected !== false} detail={trace.finalAction} />
      </ol>
    );
  }

  const trace = selection.trace;
  return (
    <ol className="ik-debug-stack">
      <StackItem label="render_unit" ok={trace.renderUnit.found} detail={trace.renderUnit.renderUnitId ?? "missing"} />
      <StackItem label="vocab" ok={!trace.vocab?.ignored} detail={trace.vocab?.status ?? "unknown"} />
      <StackItem label="due_review" ok detail={trace.learningItem?.due ? "due" : "not due"} />
      <StackItem label="curriculum" ok={trace.curriculum.eligible !== false} detail={trace.curriculum.skipReason ?? trace.curriculum.activationReason ?? "eligible"} />
      <StackItem label="sampling" ok={trace.sampling.passed !== false} detail={trace.sampling.evaluated ? `${formatNumber(trace.sampling.value)} <= ${formatNumber(trace.sampling.effectiveRate)}` : "not evaluated"} />
      <StackItem label="context" ok={trace.contextDecision.decision !== "skip"} detail={trace.contextDecision.rationale ?? trace.contextDecision.decision} />
      <StackItem label="dom" ok={trace.finalAction === "injected"} detail={trace.finalAction} />
    </ol>
  );
}

function StackItem({
  label,
  ok,
  detail
}: {
  label: string;
  ok: boolean;
  detail: string | null | undefined;
}) {
  return (
    <li>
      <span className="ik-debug-stack-label">{label}</span>
      <span className={ok ? "ik-debug-pass" : "ik-debug-skip"}>
        {ok ? "pass" : "skip"}
      </span>
      <span>{detail ?? "none"}</span>
    </li>
  );
}

function DecisionsTab({
  filter,
  decisions,
  onFilterChange
}: {
  filter: DecisionFilter;
  decisions: DecisionRow[];
  onFilterChange: (filter: DecisionFilter) => void;
}) {
  return (
    <section className="ik-debug-panel ik-debug-decisions">
      <PanelTitle prompt="$ ik.decisions --page" />
      <div className="ik-debug-filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === filter ? "is-active" : ""}
            onClick={() => {
              onFilterChange(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ik-debug-table" role="table">
        <div className="ik-debug-table-row ik-debug-table-head" role="row">
          <span>type</span>
          <span>source</span>
          <span>target</span>
          <span>action</span>
          <span>reason</span>
          <span>ref</span>
        </div>
        {decisions.map((row) => (
          <div className="ik-debug-table-row" role="row" key={row.id}>
            <span>{row.type}</span>
            <span>{row.source}</span>
            <span>{row.target}</span>
            <span>{row.action}</span>
            <span>{row.reason}</span>
            <span>{row.ref}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataTab({
  snapshot,
  selection
}: {
  snapshot: DebugTraceSnapshot | null;
  selection: DebugSelectionSnapshot | null;
}) {
  return (
    <section className="ik-debug-grid">
      <div className="ik-debug-panel">
        <PanelTitle prompt="$ ik.data --context" />
        <pre className="ik-debug-json">
          {JSON.stringify(snapshot?.context ?? { context: "pending" }, null, 2)}
        </pre>
      </div>
      <aside className="ik-debug-panel">
        <PanelTitle prompt="$ ik.data --selected" />
        <pre className="ik-debug-json">
          {JSON.stringify(selection ?? { selection: "none" }, null, 2)}
        </pre>
      </aside>
    </section>
  );
}

function ExportTab({
  snapshot,
  selection,
  exportPayload,
  onRequestExport
}: {
  snapshot: DebugTraceSnapshot | null;
  selection: DebugSelectionSnapshot | null;
  exportPayload: DebugTraceExport | null;
  onRequestExport: () => void;
}) {
  const fullPayload = exportPayload ?? (snapshot ? createLocalExport(snapshot) : null);
  return (
    <section className="ik-debug-panel ik-debug-export">
      <PanelTitle prompt="$ ik.export" />
      <div className="ik-debug-export-actions">
        <button type="button" onClick={onRequestExport}>
          Prepare export
        </button>
        <button
          type="button"
          disabled={!selection}
          onClick={() => {
            void copyJson(selection);
          }}
        >
          Copy selected JSON
        </button>
        <button
          type="button"
          disabled={!fullPayload}
          onClick={() => {
            void copyJson(fullPayload);
          }}
        >
          Copy trace JSON
        </button>
        <button
          type="button"
          disabled={!fullPayload}
          onClick={() => {
            if (fullPayload) {
              downloadJson(`immersionkit-debug-${fullPayload.trace.runId}.json`, fullPayload);
            }
          }}
        >
          Download trace JSON
        </button>
      </div>
      <pre className="ik-debug-json">
        {JSON.stringify(fullPayload ?? { export: "pending" }, null, 2)}
      </pre>
    </section>
  );
}

function EmptyState({ prompt, text }: { prompt: string; text: string }) {
  return (
    <section className="ik-debug-panel ik-debug-empty">
      <PanelTitle prompt={prompt} />
      <p>{text}</p>
    </section>
  );
}

function PanelTitle({ prompt }: { prompt: string }) {
  return <h2 className="ik-debug-panel-title">{prompt}</h2>;
}

function LogRow({ event }: { event: DebugTimelineEvent }) {
  return (
    <div className={`ik-debug-log-row is-${event.level}`}>
      <span>{formatOffsetMs(event.offsetMs)}</span>
      <span>[{event.phase}]</span>
      <span>{event.title}</span>
      <span>{event.level}</span>
      <span>{event.detail ?? ""}</span>
    </div>
  );
}

type DecisionRow = {
  id: string;
  type: string;
  source: string;
  target: string;
  action: string;
  reason: string;
  ref: string;
};

function collectDecisionRows(
  snapshot: DebugTraceSnapshot | null,
  filter: DecisionFilter
): DecisionRow[] {
  if (!snapshot) {
    return [];
  }

  const rows: DecisionRow[] = [
    ...Object.entries(snapshot.tokensByTokenId).map(([id, trace]) => ({
      id,
      type: "word",
      source: trace.sourceToken,
      target: trace.targetToken ?? "",
      action: trace.finalAction,
      reason: trace.explanation,
      ref: trace.tokenId ?? trace.renderUnit.renderUnitId ?? trace.nodeId
    })),
    ...Object.entries(snapshot.phrasesByTokenId).map(([id, trace]) => ({
      id,
      type: "phrase",
      source: trace.sourceText ?? trace.phraseId,
      target: trace.targetText ?? "",
      action: trace.finalAction,
      reason: trace.rejectedReason ?? trace.explanation,
      ref: trace.tokenId ?? trace.phraseId
    })),
    ...Object.entries(snapshot.sentencesByHash).map(([id, trace]) => ({
      id,
      type: "sentence",
      source: trace.sourcePreview,
      target: trace.translation?.rendered ? "rendered" : "",
      action: trace.queued ? "queued" : "candidate",
      reason: trace.ranking?.primaryReason ?? trace.reason,
      ref: trace.sentenceHash
    }))
  ];

  return rows.filter((row) => {
    switch (filter) {
      case "injected":
        return row.action === "injected";
      case "skipped":
        return row.action.startsWith("skipped") || row.action === "rejected";
      case "context-suppressed":
        return row.action === "skipped-context";
      case "curriculum-skipped":
        return row.action === "skipped-curriculum" || row.reason.includes("curriculum");
      case "sampling-skipped":
        return row.action === "skipped-sampling";
      case "phrase-rejected":
        return row.type === "phrase" && row.action === "rejected";
      case "sentence-candidates":
        return row.type === "sentence";
      case "all":
      default:
        return true;
    }
  });
}

function postCommand(command: DebugInspectorCommand): void {
  window.parent.postMessage(
    {
      type: DEBUG_INSPECTOR_COMMAND_MESSAGE_TYPE,
      command
    },
    "*"
  );
}

function formatOffsetMs(value: number): string {
  return `${(value / 1000).toFixed(3).padStart(6, "0")}`;
}

function formatNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3)
    : "n/a";
}

function formatOffset(offset: { start: number; end: number } | null | undefined): string {
  return offset ? `${offset.start}:${offset.end}` : "unresolved";
}

function createLocalExport(snapshot: DebugTraceSnapshot): DebugTraceExport {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    extensionBuildProfile: "diagnostic",
    trace: snapshot,
    redactions: [
      "provider API keys are not captured",
      "page URL query parameters and fragments are removed",
      "page text is represented as bounded previews"
    ]
  };
}

async function copyJson(value: unknown): Promise<void> {
  if (!value || !navigator.clipboard?.writeText) {
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
