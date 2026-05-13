import type { SentenceCandidateMetadata } from "./contracts";

export type RegisteredSentenceAnchor = {
  nodeId: string;
  node: ChildNode;
  sentenceKind: "known" | "unknown";
};

export class SentenceAnchorRegistry {
  private readonly anchorsBySentenceHash = new Map<
    string,
    Map<string, RegisteredSentenceAnchor>
  >();

  registerCandidates(
    candidates: readonly SentenceCandidateMetadata[],
    node: ChildNode
  ) {
    if (candidates.length === 0) {
      return;
    }

    for (const candidate of candidates) {
      let anchors = this.anchorsBySentenceHash.get(candidate.sentenceHash);
      if (!anchors) {
        anchors = new Map();
        this.anchorsBySentenceHash.set(candidate.sentenceHash, anchors);
      }

      anchors.set(candidate.nodeId, {
        nodeId: candidate.nodeId,
        node,
        sentenceKind: candidate.knownRatio >= 1 ? "known" : "unknown"
      });
    }
  }

  collect(sentenceHash: string): RegisteredSentenceAnchor[] {
    const anchors = this.anchorsBySentenceHash.get(sentenceHash);
    if (!anchors) {
      return [];
    }

    const connectedAnchors: RegisteredSentenceAnchor[] = [];
    for (const [nodeId, anchor] of anchors) {
      if (!anchor.node.isConnected) {
        anchors.delete(nodeId);
        continue;
      }

      connectedAnchors.push(anchor);
    }

    if (anchors.size === 0) {
      this.anchorsBySentenceHash.delete(sentenceHash);
    }

    return connectedAnchors;
  }

  clear() {
    this.anchorsBySentenceHash.clear();
  }
}
