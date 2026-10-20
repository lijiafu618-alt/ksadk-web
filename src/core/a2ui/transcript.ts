import type { Message } from '../../components/chat/types.js';
import { mergeA2uiMessages } from './history.js';

type Activity = NonNullable<Message['aguiActivity']>;

/** Merge passive copies from AG-UI, canonical replay and legacy message history. */
export function coalesceA2uiActivities(messages: Message[]): Message[] {
  if (!messages.some(message => message.aguiActivity || message.aguiActivities?.length)) return messages;
  const owners = new Map<string, Activity>();
  let duplicate = false;
  const result = messages.map(message => {
    const take = (activity: Activity): Activity | undefined => {
      const prior = owners.get(activity.surfaceId);
      if (prior) {
        duplicate = true;
        prior.messages = mergeA2uiMessages(prior.messages, activity.messages);
        prior.interactionId = activity.interactionId || prior.interactionId;
        prior.batchIds = [...new Set([...(prior.batchIds || []), ...(activity.batchIds || [])])];
        return undefined;
      }
      const copy = { ...activity };
      owners.set(activity.surfaceId, copy);
      return copy;
    };
    return {
      ...message,
      ...(message.aguiActivity ? { aguiActivity: take(message.aguiActivity) } : {}),
      ...(message.aguiActivities ? { aguiActivities: message.aguiActivities.flatMap(activity => {
        const kept = take(activity);
        return kept ? [kept] : [];
      }) } : {}),
    };
  });
  return duplicate ? result.filter(message => message.role !== 'a2ui' || message.aguiActivity
    || message.aguiActivities?.length || message.content) : messages;
}
