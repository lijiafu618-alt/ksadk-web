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
