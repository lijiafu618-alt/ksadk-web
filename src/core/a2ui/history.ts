type Operation = Record<string, unknown>;

/** Legacy full snapshots and new immutable operation batches share one history. */
export function mergeA2uiMessages(previous: Operation[], incoming: Operation[]): Operation[] {
  const left = previous.map(message => JSON.stringify(message));
  const right = incoming.map(message => JSON.stringify(message));
  if (left.every((message, index) => right[index] === message)) return incoming;
  if (right.every((message, index) => left[index] === message)) return previous;
  return [...previous, ...incoming];
}

export function mergeA2uiActivity<T extends { surfaceId: string; messages: Operation[]; batchIds?: string[] }>(
  previous: T | undefined,
  incoming: T,
  batchId?: string,
): T {
  if (batchId && previous?.batchIds?.includes(batchId)) return previous;
  return {
    ...incoming,
    messages: previous ? mergeA2uiMessages(previous.messages, incoming.messages) : incoming.messages,
    ...(batchId ? { batchIds: [...(previous?.batchIds || []), batchId] } : {}),
  };
}
