import {
  IMMERSIONKIT_IGNORE_SELECTOR,
  IMMERSIONKIT_NODE_SELECTOR,
  MAX_TEXT_NODE_LENGTH
} from "./constants";

const BLOCKED_PAGE_PATH_PATTERN =
  /(login|log-in|signin|sign-in|signup|sign-up|checkout|payment|billing|auth|password|2fa|mfa)/i;

const EXCLUDED_ANCESTOR_SELECTOR = [
  "script",
  "style",
  "noscript",
  "code",
  "pre",
  "kbd",
  "samp",
  "textarea",
  "input",
  "select",
  "option",
  "button",
  "label",
  "svg",
  "math",
  "canvas",
  "video",
  "audio",
  "img",
  "iframe",
  "object",
  "embed",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
  "[role='textbox']",
  "[hidden]",
  "[aria-hidden='true']",
  IMMERSIONKIT_NODE_SELECTOR,
  IMMERSIONKIT_IGNORE_SELECTOR
].join(",");

export type DocumentSkipDecision = {
  shouldSkip: boolean;
  reason: string | null;
};

export function shouldSkipDocument(url: URL, doc: Document): DocumentSkipDecision {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      shouldSkip: true,
      reason: "unsupported-protocol"
    };
  }

  if (!doc.body) {
    return {
      shouldSkip: true,
      reason: "missing-body"
    };
  }

  if (BLOCKED_PAGE_PATH_PATTERN.test(url.pathname)) {
    return {
      shouldSkip: true,
      reason: "sensitive-path"
    };
  }

  return {
    shouldSkip: false,
    reason: null
  };
}

export function collectEligibleTextNodes(root: ParentNode): Text[] {
  const nodes: Text[] = [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node) {
        if (!(node instanceof Text)) {
          return NodeFilter.FILTER_REJECT;
        }

        return isEligibleTextNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      nodes.push(current);
    }

    current = walker.nextNode();
  }

  return nodes;
}

export function isInImmersionNode(node: Node): boolean {
  const parentElement =
    node instanceof Element ? node : node.parentElement;

  if (!parentElement) {
    return false;
  }

  return Boolean(parentElement.closest(IMMERSIONKIT_NODE_SELECTOR));
}

export function nodeToProcessRoot(node: Node): ParentNode | null {
  if (node instanceof Text) {
    return node.parentElement;
  }

  if (node instanceof Element) {
    return node;
  }

  return null;
}

function isEligibleTextNode(node: Text): boolean {
  if (!node.isConnected) {
    return false;
  }

  const text = node.nodeValue ?? "";
  if (!text || text.length > MAX_TEXT_NODE_LENGTH) {
    return false;
  }

  if (!/[a-z]/i.test(text)) {
    return false;
  }

  const parent = node.parentElement;
  if (!parent) {
    return false;
  }

  if (parent.closest(EXCLUDED_ANCESTOR_SELECTOR)) {
    return false;
  }

  const style = window.getComputedStyle(parent);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return true;
}
