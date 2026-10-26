import { createRoot } from 'react-dom/client';
import { LegacyA2UISurface } from '../../src/components/chat/LegacyA2UISurface.js';
import { A2UIActivityMessage } from '../../src/components/chat/A2UIActivityMessage.js';
import { InteractionA2uiSurface } from '../../src/components/chat/InteractionA2uiSurface.js';
import { InteractionTray } from '../../src/components/chat/InteractionTray.js';
import { a2uiCatalog, a2uiManifest } from '../../src/core/a2ui/catalog.js';
import type { Interaction } from '../../src/core/interaction/types.js';

type Messages = Record<string, unknown>[];
const root = createRoot(document.getElementById('root')!);
const presentation = (messages: Messages) => ({ wireVersion: '0.9.1', catalogDigest: a2uiManifest.catalog_digest, messages });
const record = (messages: Messages, interactionId: string, kind: Interaction['kind']): Interaction => ({
  interactionId, sessionId: 'session', runId: 'run', kind, title: 'Review', message: 'Check the operation',
  requestSchema: {}, presentation: { a2ui: presentation(messages) }, status: 'pending', revision: 1,
  createdAt: '', expiresAt: null, resolvedAt: null, actor: null, outcome: null,
  responseSummary: null, source: 'interaction_v1', extensions: {},
});

const probe = {
  actions: [] as unknown[],
  legacy(messages: Messages, surfaceId = 's') {
    root.render(<LegacyA2UISurface surfaceId={surfaceId} messages={messages} disabled={false}
      onAction={action => { probe.actions.push(action); }} />);
  },
  surfaces(messages: Messages) {
    root.render(<InteractionA2uiSurface a2ui={presentation(messages)} disabled={false}
      onSubmit={value => { probe.actions.push(value); }} onCancel={() => { probe.actions.push('cancel'); }} />);
  },
  approval(messages: Messages) {
    const active = record(messages, 'approval', 'approval');
    root.render(<><A2UIActivityMessage surfaceId="s" messages={messages} boundInteraction={active}
      onAction={action => { probe.actions.push(action); }} />
    <InteractionTray interactions={[active]} activeIndex={0} onSelectIndex={() => {}}
      onRespond={action => { probe.actions.push(action); }} localCatalog={a2uiCatalog} /></>);
  },
  input(messages: Messages, interactionId: string) {
    root.render(<InteractionTray interactions={[record(messages, interactionId, 'structured_input')]}
      activeIndex={0} onSelectIndex={() => {}} onRespond={action => { probe.actions.push(action); }}
      localCatalog={a2uiCatalog} />);
  },
};
declare global { interface Window { rendererProbe: typeof probe } }
window.rendererProbe = probe;
