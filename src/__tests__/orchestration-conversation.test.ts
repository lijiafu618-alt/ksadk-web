import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RuntimeConversationIngress } from '../core/conversation/runtime-ingress';
import { projectConversationItems } from '../core/conversation/presentation';
import { orchestrationDescriptor } from '../core/conversation/orchestration';
import { reduceConversationItem } from '../core/conversation/reducer';

const events = readFileSync(new URL('./fixtures/a2a_orchestration/status.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(line => JSON.parse(line));
function replay(frames = events) {
  const ingress = new RuntimeConversationIngress('session', undefined, 'agent-block-v1');
  frames.forEach(event => ingress.apply(event));
  return ingress;
}
describe('structured graph status projection', () => {
  it('keeps node completion separate from root completion', () => {
    const projection = projectConversationItems(replay().snapshot());
    expect(projection.terminalStatus).toBeUndefined();
    const graph = projection.timeline.find(entry => entry.item.kind === 'plan')!.item;
    expect(graph.payload.nodeId).toBe('a');
    expect(graph.payload.state).toBe('completed');
    expect(graph.payloadSchemaRef).toBe('conversation.item.orchestration/v1');
  });
  it('live, persisted and prefix plus cursor replay agree', () => {
    const ingress = replay(events.slice(0, 3));
    events.slice(3).forEach(event => ingress.apply(event));
    expect(ingress.snapshot()).toEqual(replay().snapshot());
    events.forEach(event => ingress.apply(event));
    expect(ingress.snapshot()).toEqual(replay().snapshot());
  });
  it('ignores stale revisions and rejects changing node identity', () => {
    const state = replay().snapshot();
    const node = state.items.find(item => item.kind === 'plan')!;
    expect(reduceConversationItem(state, { ...node, sourceEventIds: ['late'],
      payload: { ...node.payload, state: 'running', stateRevision: 2 } })).toEqual(state);
    expect(() => reduceConversationItem(state, { ...node, sourceEventIds: ['foreign'],
      payload: { ...node.payload, nodeId: 'different', stateRevision: 5 } })).toThrow('identity');
  });
  it('rejects raw operands and credentials on a known descriptor', () => {
    const descriptor = replay().snapshot().items.find(item => item.kind === 'plan')!.payload;
    expect(() => orchestrationDescriptor({ ...descriptor, operands: { secret: 'fixture' } })).toThrow();
    expect(orchestrationDescriptor({ schema: 'future/schema' })).toBeNull();
  });
});
