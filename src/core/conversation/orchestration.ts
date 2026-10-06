/** Public graph state contains identities and outcomes, never condition operands. */
export type OrchestrationDescriptor = {
  schema: 'a2a.orchestration/v1'; graphDigest: string; nodeId: string;
  groupPath: string[]; state: 'pending' | 'ready' | 'running' | 'waiting_approval'
    | 'waiting_input' | 'completed' | 'failed' | 'cancelled' | 'indeterminate' | 'skipped';
  stateRevision: number; branchId?: string; bindingId?: string; scopeId?: string;
  selectedBranchId?: string; failurePolicy?: 'fail_fast' | 'collect_all';
  reasonCode?: string; handledFailuresOf?: string[];
  nodeKind?: 'local' | 'remote' | 'parallel' | 'conditional' | 'join';
  nextNodeId?: string; joinNodeId?: string; joinCompleted?: number; joinTotal?: number;
  deadlineAt?: number; initialCallsUsed?: number; maxInitialCalls?: number;
  maxConcurrency?: number; checkpointRevision?: number;
};
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const states = new Set(['pending', 'ready', 'running', 'waiting_approval', 'waiting_input',
  'completed', 'failed', 'cancelled', 'indeterminate', 'skipped']);
const keys = new Set(['schema', 'graphDigest', 'nodeId', 'groupPath', 'state', 'stateRevision',
  'branchId', 'bindingId', 'scopeId', 'selectedBranchId', 'failurePolicy', 'reasonCode', 'handledFailuresOf',
  'nodeKind', 'nextNodeId', 'joinNodeId', 'joinCompleted', 'joinTotal', 'deadlineAt',
  'initialCallsUsed', 'maxInitialCalls', 'maxConcurrency', 'checkpointRevision']);
export function orchestrationDescriptor(value: unknown): OrchestrationDescriptor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (d.schema !== 'a2a.orchestration/v1') return null;
  const id = (v: unknown) => typeof v === 'string' && identifier.test(v);
  const integer = (key: string, min: number, max: number) => d[key] === undefined
    || (Number.isSafeInteger(d[key]) && Number(d[key]) >= min && Number(d[key]) <= max);
  if (Object.keys(d).some(key => !keys.has(key))
    || typeof d.graphDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(d.graphDigest)
    || !id(d.nodeId) || !Array.isArray(d.groupPath) || d.groupPath.length > 4 || !d.groupPath.every(id)
    || typeof d.state !== 'string' || !states.has(d.state)
    || !Number.isSafeInteger(d.stateRevision) || Number(d.stateRevision) < 1
    || ['branchId', 'selectedBranchId', 'nextNodeId', 'joinNodeId'].some(key => d[key] !== undefined && !id(d[key]))
    || (d.nodeKind !== undefined && !['local', 'remote', 'parallel', 'conditional', 'join'].includes(String(d.nodeKind)))
    || !integer('joinCompleted', 0, 16) || !integer('joinTotal', 1, 16)
    || !integer('initialCallsUsed', 0, 64) || !integer('maxInitialCalls', 1, 64)
    || !integer('maxConcurrency', 1, 16) || !integer('checkpointRevision', 1, Number.MAX_SAFE_INTEGER)
    || (d.deadlineAt !== undefined && (typeof d.deadlineAt !== 'number' || !Number.isFinite(d.deadlineAt) || d.deadlineAt <= 0 || d.deadlineAt > 253402300799))
    || (d.bindingId !== undefined && (typeof d.bindingId !== 'string' || !/^a2a-binding-[0-9a-f]{32}$/.test(d.bindingId)))
    || (d.scopeId !== undefined && (typeof d.scopeId !== 'string' || !d.scopeId || d.scopeId.length > 256))
    || (d.failurePolicy !== undefined && !['fail_fast', 'collect_all'].includes(String(d.failurePolicy)))
    || (d.reasonCode !== undefined && (typeof d.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(d.reasonCode)))
    || (d.handledFailuresOf !== undefined && (!Array.isArray(d.handledFailuresOf) || d.handledFailuresOf.length > 64 || !d.handledFailuresOf.every(id)))) {
    throw new Error('Invalid A2A orchestration descriptor');
  }
  return d as OrchestrationDescriptor;
}
export const orchestrationTerminal = (d: OrchestrationDescriptor) =>
  ['completed', 'failed', 'cancelled', 'indeterminate', 'skipped'].includes(d.state);
