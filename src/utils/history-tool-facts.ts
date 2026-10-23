import type { Message } from '../components/chat/types.js';

type ToolFacts = Pick<NonNullable<Message['tools']>[string], 'args' | 'output' | 'status'>;

/** A partial page is not evidence that a completed tool became pending again. */
export function mergeHistoryToolFacts(previous: ToolFacts, incoming: ToolFacts): ToolFacts {
  const terminal = (status: ToolFacts['status']) => status === 'completed' || status === 'error';
  const output = incoming.output === undefined ? previous.output : incoming.output;
  return {
    args: incoming.args || previous.args,
    ...(output === undefined ? {} : { output }),
    status: terminal(previous.status) && !terminal(incoming.status) ? previous.status : incoming.status,
  };
}

/** Compatibility message pages may repeat the same cumulative call snapshot. */
export function coalesceHistoryToolCalls(messages: Message[]): Message[] {
  const mapped = messages.map(message => ({ ...message,
    tools: message.tools ? { ...message.tools } : undefined,
  }));
  const owners = new Map<string, { message: Message; key: string }>();
  let changed = false;
  for (const message of [...mapped].sort((a, b) => (a.historyOrder?.seq ?? 0) - (b.historyOrder?.seq ?? 0))) {
    // Canonical item identities are owned by the conversation projection.
    if (message.itemId || !message.invocationId) continue;
    for (const [key, tool] of Object.entries(message.tools || {})) {
      if (!tool.callId || tool.approvalRequestId) continue;
      const identity = JSON.stringify([message.invocationId, message.scopeId || '', tool.callId]);
      const previous = owners.get(identity);
      if (!previous) {
        owners.set(identity, { message, key });
        continue;
      }
      const earlier = previous.message.tools![previous.key];
      const merged = { ...earlier, ...tool, ...mergeHistoryToolFacts(earlier, tool) };
      previous.message.tools![previous.key] = merged;
      previous.message.blocks = previous.message.blocks?.map(block => block.type === 'tool'
        && block.extra?.callId === tool.callId
        ? { ...block, args: merged.args, output: merged.output, status: merged.status } : block);
      delete message.tools![key];
      message.blocks = message.blocks?.filter(block => block.type !== 'tool' || block.extra?.callId !== tool.callId);
      changed = true;
    }
  }
  return changed ? mapped : messages;
}
