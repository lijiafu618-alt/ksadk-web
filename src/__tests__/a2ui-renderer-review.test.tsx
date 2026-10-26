import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { A2UIActivityMessage } from '../components/chat/A2UIActivityMessage.js';
import { InteractionA2uiSurface } from '../components/chat/InteractionA2uiSurface.js';
import { a2uiManifest } from '../core/a2ui/catalog.js';
import { interactionFromSessionEvent } from '../core/interaction/adapters/session-events.js';

const create = (surfaceId: string) => ({ version: 'v0.9', createSurface: {
  surfaceId, catalogId: 'a2ui.org/catalogs/basic/v1.0',
} });
const form = (surfaceId: string, label: string) => ({ version: 'v0.9', updateComponents: {
  surfaceId, components: [{ id: 'form', component: 'Form', fields: [{ name: 'value', label, type: 'string' }] }],
} });

describe('A2UI approval and surface lifecycle regressions', () => {
  it.each(['pending', 'resolving', 'failed'] as const)('keeps %s approval details visible but non-actionable in the timeline', status => {
    const messages = [create('approval'), { version: 'v0.9', updateComponents: {
      surfaceId: 'approval', components: [
        { id: 'plan', component: 'Card', title: 'Review operation', body: 'Example operation details' },
        { id: 'decision', component: 'ApprovalBar', summary: 'Review before approving' },
      ],
    } }];
    const requested = interactionFromSessionEvent({ family: 'interaction', session_id: 's',
      event_type: 'interaction.requested', payload: { interaction_id: 'wait', kind: 'approval' } })!;
    const html = renderToStaticMarkup(<A2UIActivityMessage surfaceId="approval" messages={messages}
      boundInteraction={{ ...requested, status }} onAction={() => { throw new Error('Preview cannot submit'); }} />);
    expect(html).toContain('Example operation details');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });

  it('renders the final live surface after deleting an earlier one', () => {
    const html = renderToStaticMarkup(<InteractionA2uiSurface a2ui={{ wireVersion: '0.9.1',
      catalogDigest: a2uiManifest.catalog_digest, messages: [
        create('old'), form('old', 'Deleted field'),
        { version: 'v0.9', deleteSurface: { surfaceId: 'old' } }, create('new'), form('new', 'New field'),
      ],
    }} disabled={false} onSubmit={() => {}} onCancel={() => {}} />);
    expect(html).toContain('New field');
    expect(html).not.toContain('Deleted field');
  });

  it('renders all live surfaces, with one shared cancel control', () => {
    const html = renderToStaticMarkup(<InteractionA2uiSurface a2ui={{ wireVersion: '0.9.1',
      catalogDigest: a2uiManifest.catalog_digest, messages: [
        create('first'), form('first', 'First field'), create('second'), form('second', 'Second field'),
      ],
    }} disabled={false} onSubmit={() => {}} onCancel={() => {}} />);
    expect(html).toContain('First field');
    expect(html).toContain('Second field');
    expect(html.match(/data-testid="interaction-a2ui-cancel"/g)).toHaveLength(1);
  });

  it('does not revive a deleted-only presentation', () => {
    const html = renderToStaticMarkup(<InteractionA2uiSurface a2ui={{ wireVersion: '0.9.1',
      catalogDigest: a2uiManifest.catalog_digest, messages: [
        create('old'), form('old', 'Deleted field'), { version: 'v0.9', deleteSurface: { surfaceId: 'old' } },
      ],
    }} disabled={false} onSubmit={() => {}} onCancel={() => {}} />);
    expect(html).toContain('卡片没有可展示的 surface');
    expect(html).not.toContain('<input');
  });
});
