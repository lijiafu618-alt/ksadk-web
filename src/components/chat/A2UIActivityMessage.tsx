import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { injectBasicCatalogStyles } from '@a2ui/web_core/v0_9/basic_catalog';
import { legacyQuestionSummary } from '../../core/run/a2ui.js';
import { A2uiSurfaces } from '../../core/a2ui/surfaces.js';
import type { A2UIClientEventMessage } from '../../core/a2ui/catalog.js';
import { LegacyA2UISurface, legacyCatalogId } from './LegacyA2UISurface';
import type { Interaction } from '../../core/interaction/types.js';

// The official React host extends HTMLElement at module evaluation. Load it
// only after mounting a real surface so library consumers retain SSR support.
const OfficialRenderer = lazy(() => import('./OfficialA2uiRenderer'));

class SurfaceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert">卡片渲染失败，请使用输入表单。</div> : this.props.children;
  }
}

function OfficialSurface({ surfaceId, messages, onAction, disabled }: Props) {
  const action = useRef(onAction);
  const controller = useRef<A2uiSurfaces | null>(null);
  const [surface, setSurface] = useState<ReturnType<A2uiSurfaces['get']>>();
  const [error, setError] = useState('');

  useEffect(() => { action.current = onAction; }, [onAction]);
  useEffect(() => {
    const model = new A2uiSurfaces(message => action.current?.(message));
    controller.current = model;
    injectBasicCatalogStyles();
    return () => { model.dispose(); controller.current = null; };
  }, []);
  useEffect(() => {
    const model = controller.current;
    if (!model) return;
    model.enabled = !disabled && Boolean(onAction);
    try {
      model.apply(messages);
      setSurface(model.get(surfaceId));
      setError('');
    } catch (cause) {
      model.enabled = false;
      setError(cause instanceof Error ? cause.message : '卡片校验失败。');
    }
  }, [messages, surfaceId, disabled, onAction]);

  if (error) return <div role="alert" data-testid="a2ui-error">{error}</div>;
  if (!surface) return null;
  return (
    <fieldset disabled={disabled || !onAction} inert={disabled || !onAction} className="min-w-0 border-0 p-0">
      <SurfaceErrorBoundary key={surfaceId}>
        <Suspense fallback={<div>正在加载界面</div>}>
          <OfficialRenderer surface={surface} />
        </Suspense>
      </SurfaceErrorBoundary>
    </fieldset>
  );
}

type Props = {
  surfaceId: string;
  messages: Array<Record<string, unknown>>;
  onAction?: (message: A2UIClientEventMessage) => void;
  disabled?: boolean;
  boundInteraction?: Interaction;
};

export function A2UIActivityMessage(props: Props) {
  // The composer owns the active input. Timeline history becomes read-only
  // after consumption, rather than mounting a second interactive copy.
  if (props.boundInteraction && ['pending', 'resolving', 'failed'].includes(props.boundInteraction.status)) return null;
  const questions = props.surfaceId.startsWith('input-') ? legacyQuestionSummary(props.messages) : null;
  if (questions) {
    return (
      <details className="mx-auto mb-3 w-full max-w-3xl px-6 text-sm text-muted-foreground" data-testid="legacy-question-history">
        <summary className="cursor-pointer">历史提问 · {questions.length} 个问题</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {questions.map((question, index) => <li key={index}>{question}</li>)}
        </ul>
      </details>
    );
  }
  const created = props.messages.flatMap(message => {
    const create = message.createSurface as { surfaceId?: string; catalogId?: string } | undefined;
    return create?.surfaceId === props.surfaceId ? [create] : [];
  }).at(-1);
  if (created?.catalogId === legacyCatalogId) {
    const model = new A2uiSurfaces(() => {});
    try { model.apply(props.messages); } catch {
      return <div role="alert">旧版卡片未通过兼容目录校验。</div>;
    } finally { model.dispose(); }
    return <LegacyA2UISurface {...props} disabled={Boolean(props.disabled || !props.onAction)} onAction={props.onAction || (() => {})} />;
  }
  return (
    <div className="mb-3 w-full overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900" data-testid="a2ui-surface">
      <OfficialSurface {...props} />
    </div>
  );
}
