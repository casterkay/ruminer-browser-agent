export type RecordedActionStep = {
  type: string;
  selector?: string;
  url?: string;
  value?: string;
  key?: string;
  note?: string;
};

export type RecordedActionFlowLike = {
  id: string;
  name: string;
  description?: string;
  meta?: { createdAt?: string; updatedAt?: string; domain?: string } | undefined;
  nodes?: Array<{ id: string; type: string; config?: unknown; disabled?: boolean }> | undefined;
};

export type RecordedActionSequence = {
  /** Flow ID (record-replay v2). */
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  originUrl?: string;
  domain?: string;
  stepCount: number;
  steps: RecordedActionStep[];
  /** A compact, human readable, single-line summary for UI. */
  summary: string;
  /** Non-fatal warnings (e.g. stop barrier incomplete). */
  warning?: string;
};

function safeUrlHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

function getNodeConfig(node: { config?: unknown }): Record<string, unknown> {
  const cfg = node && typeof node === 'object' ? (node.config as any) : null;
  return cfg && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {};
}

function readSelector(cfg: Record<string, unknown>): string | undefined {
  const t = cfg['target'];
  if (t && typeof t === 'object') {
    const sel = (t as any).selector;
    if (typeof sel === 'string' && sel.trim()) return sel.trim();
  }
  const sel = cfg['selector'];
  if (typeof sel === 'string' && sel.trim()) return sel.trim();
  return undefined;
}

function readString(cfg: Record<string, unknown>, key: string): string | undefined {
  const v = cfg[key];
  if (typeof v === 'string' && v.trim()) return v;
  return undefined;
}

function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function stepLabel(step: RecordedActionStep): string {
  const t = String(step.type || '').toLowerCase();
  if (t === 'navigate') return step.url ? `Navigate: ${truncate(step.url, 120)}` : 'Navigate';
  if (t === 'click') return step.selector ? `Click: ${truncate(step.selector, 120)}` : 'Click';
  if (t === 'dblclick')
    return step.selector ? `Double-click: ${truncate(step.selector, 120)}` : 'Double-click';
  if (t === 'fill') {
    const sel = step.selector ? truncate(step.selector, 80) : '(target)';
    const val = step.value ? truncate(step.value, 48) : '';
    return val ? `Fill: ${sel} = ${val}` : `Fill: ${sel}`;
  }
  if (t === 'key' || t === 'keyboard') return step.key ? `Key: ${step.key}` : 'Key';
  if (t === 'scroll') return step.selector ? `Scroll: ${truncate(step.selector, 120)}` : 'Scroll';
  if (t === 'wait') return step.note ? `Wait: ${truncate(step.note, 120)}` : 'Wait';
  return step.selector
    ? `${step.type}: ${truncate(step.selector, 120)}`
    : String(step.type || 'Step');
}

function summarizeSteps(steps: RecordedActionStep[]): string {
  const parts = steps.slice(0, 5).map((s) => {
    const t = String(s.type || '').toLowerCase();
    if (t === 'navigate' && s.url) return 'Navigate';
    if ((t === 'click' || t === 'dblclick') && s.selector) return 'Click';
    if (t === 'fill' && s.selector) return 'Fill';
    if (t === 'scroll') return 'Scroll';
    if (t === 'wait') return 'Wait';
    return String(s.type || 'Step');
  });
  const suffix = steps.length > 5 ? ` +${steps.length - 5}` : '';
  return parts.length ? `${parts.join(' → ')}${suffix}` : '';
}

export function buildRecordedActionSequenceFromFlow(
  flow: RecordedActionFlowLike,
  opts?: { warning?: string },
): RecordedActionSequence {
  const nowIso = new Date().toISOString();
  const createdAt = flow.meta?.createdAt || nowIso;
  const updatedAt = flow.meta?.updatedAt || nowIso;
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];

  const steps: RecordedActionStep[] = nodes.map((n) => {
    const cfg = getNodeConfig(n);
    const selector = readSelector(cfg);
    const url = readString(cfg, 'url');
    const value = readString(cfg, 'value');
    const key = readString(cfg, 'key') || readString(cfg, 'keys');
    const note =
      readString(cfg, 'text') ||
      readString(cfg, 'label') ||
      readString(cfg, 'condition') ||
      readString(cfg, 'reason');
    return {
      type: String(n.type || ''),
      selector,
      url,
      value,
      key,
      note,
    };
  });

  const originUrl = steps.find((s) => String(s.type || '').toLowerCase() === 'navigate')?.url;
  const domain = safeUrlHost(originUrl) || flow.meta?.domain || undefined;
  const summary = summarizeSteps(steps) || truncate(steps.map(stepLabel).join(' | '), 140);

  return {
    id: flow.id,
    name: flow.name || flow.id,
    description: flow.description,
    createdAt,
    updatedAt,
    originUrl,
    domain,
    stepCount: steps.length,
    steps,
    summary,
    warning: opts?.warning,
  };
}
