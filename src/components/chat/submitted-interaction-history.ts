import type { Interaction } from '../../core/interaction/types.js';
import { submittedResponse } from '../../core/interaction/response-snapshot.js';
import type { Message } from './types.js';

export type MissingSubmittedInputHistory = {
  interaction: Interaction;
  anchor: boolean;
  surfaceIds: string[];
};

function presentationSurfaces(interaction: Interaction): string[] {
  const active = new Set<string>();
  for (const message of interaction.presentation?.a2ui?.messages || []) {
    const create = message.createSurface as { surfaceId?: string } | undefined;
    const remove = message.deleteSurface as { surfaceId?: string } | undefined;
    if (remove?.surfaceId) active.delete(remove.surfaceId);
    if (create?.surfaceId) active.add(create.surfaceId);
  }
  return [...active];
}

/** Attach unprojected metadata to its loaded run, independently of virtualization. */
export function missingSubmittedInputHistory(
  messages: readonly Message[], interactions: readonly Interaction[] = [],
): ReadonlyMap<string, MissingSubmittedInputHistory[]> {
  const anchors = new Set<string>();
  const surfaces = new Set<string>();
  const runSurfaces = new Set<string>();
  for (const message of messages) {
    const activities = [...(message.aguiActivities || []), ...(message.aguiActivity ? [message.aguiActivity] : [])];
    for (const activity of activities) {
      if (activity.interactionId) surfaces.add(`${activity.interactionId}\0${activity.surfaceId}`);
      for (const runId of [message.runId, message.invocationId]) {
        if (runId) runSurfaces.add(`${runId}\0${activity.surfaceId}`);
      }
    }
    if (message.agentBlock) continue;
    const tools = Object.values(message.tools || {});
    if (message.blocks?.length) {
      for (const block of message.blocks) {
        if (block.type !== 'tool') continue;
        const extra = block.extra || {};
        const tool = message.tools?.[block.toolName] || tools.find(entry =>
          (extra.approvalRequestId && entry.approvalRequestId === extra.approvalRequestId)
          || (extra.callId && entry.callId === extra.callId));
        const id = extra.approvalRequestId || tool?.approvalRequestId;
        if (typeof id === 'string' && id) anchors.add(id);
        else {
          const callId = String(extra.callId || extra.call_id || '');
          const record = callId && interactions.find(entry => entry.extensions.call_id === callId);
          if (record) anchors.add(record.interactionId);
        }
      }
    } else for (const tool of tools) if (tool.approvalRequestId) anchors.add(tool.approvalRequestId);
  }
  const byMessage = new Map<string, MissingSubmittedInputHistory[]>();
  const seen = new Set<string>();
  for (const interaction of interactions) {
    if (!interaction.runId || !submittedResponse(interaction) || seen.has(interaction.interactionId)) continue;
    seen.add(interaction.interactionId);
    const anchor = !anchors.has(interaction.interactionId);
    const surfaceIds = presentationSurfaces(interaction).filter(id => !surfaces.has(`${interaction.interactionId}\0${id}`)
      && !runSurfaces.has(`${interaction.runId}\0${id}`));
    if (!anchor && !surfaceIds.length) continue;
    const candidates = messages.filter(message => (message.runId === interaction.runId
      || message.invocationId === interaction.runId) && !message.agentBlock
      && message.eventType !== 'optimistic_assistant_placeholder'
      && (message.role === 'model' || message.role === 'user'));
    const withText = candidates.filter(message => message.role === 'model' && message.content.trim());
    const assistants = candidates.filter(message => message.role === 'model');
    const preferred = withText.length ? withText : assistants.length ? assistants : candidates;
    const owner = preferred.reduce<Message | undefined>((latest, message) => {
      if (!latest) return message;
      const seq = message.historyOrder?.seq;
      const lastSeq = latest.historyOrder?.seq;
      if (seq !== undefined && lastSeq !== undefined && seq !== lastSeq) return seq > lastSeq ? message : latest;
      return message.timestamp >= latest.timestamp ? message : latest;
    }, undefined);
    if (!owner) continue;
    byMessage.set(owner.id, [...(byMessage.get(owner.id) || []), { interaction, anchor, surfaceIds }]);
  }
  return byMessage;
}
