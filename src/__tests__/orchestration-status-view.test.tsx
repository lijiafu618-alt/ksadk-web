import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrchestrationStatusView } from '../components/chat/OrchestrationStatusView';
import { orchestrationDescriptor, type OrchestrationDescriptor } from '../core/conversation/orchestration';

const node: OrchestrationDescriptor = {
  schema: 'a2a.orchestration/v1', graphDigest: `sha256:${'a'.repeat(64)}`,
  nodeId: 'parallel_checks', groupPath: [], state: 'running', stateRevision: 4,
  nodeKind: 'parallel', joinNodeId: 'join_checks', joinCompleted: 1, joinTotal: 2,
  failurePolicy: 'collect_all', initialCallsUsed: 3, maxInitialCalls: 64,
  maxConcurrency: 4, deadlineAt: 1791249000, checkpointRevision: 10,
};

describe('graph runtime status', () => {
  it('shows committed join progress and budget from the latest graph revision', () => {
    const html = renderToStaticMarkup(<OrchestrationStatusView graph={{ runId: 'run', graphDigest: node.graphDigest, nodes: [node, {
      ...node, nodeId: 'remote', nodeKind: 'remote', checkpointRevision: 2, initialCallsUsed: 1,
      joinTotal: undefined, joinCompleted: undefined,
    }] }} />);
    expect(html).toContain('初始调用剩余：61 / 64');
    expect(html).toContain('汇合进度：1 / 2');
    expect(html).toContain('含等待与停机');
  });

  it.each([{ deadlineAt: 1e300 }, { initialCallsUsed: 65 }, { joinTotal: 17 }, { checkpointRevision: 0 }])(
    'rejects invalid public progress %j', patch => {
      expect(() => orchestrationDescriptor({ ...node, ...patch })).toThrow();
    },
  );
});
