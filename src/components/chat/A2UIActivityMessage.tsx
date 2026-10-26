import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { injectBasicCatalogStyles } from '@a2ui/web_core/v0_9/basic_catalog';
import { canonicalize } from 'json-canonicalize';
import { legacyQuestionSummary } from '../../core/run/a2ui.js';
import { A2uiSurfaces } from '../../core/a2ui/surfaces.js';
import type { A2UIClientEventMessage } from '../../core/a2ui/catalog.js';
import { LegacyA2UISurface, legacyCatalogId } from './LegacyA2UISurface';
import { validatedApprovalA2ui } from '../../core/interaction/a2ui-validate.js';
import type { Interaction } from '../../core/interaction/types.js';
import { interactionInputOutcome } from './approval-status.js';
import { submittedResponse } from '../../core/interaction/response-snapshot.js';
import { projectA2uiHistoryResponse, type A2uiHistoryAnswer } from './a2ui-response-snapshot.js';

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
  historyAnswer?: A2uiHistoryAnswer;
};

function surfaceSnapshot(surfaceId: string, messages: Props['messages']): string | undefined {
  const model = new A2uiSurfaces(() => {});
  try {
    model.apply(structuredClone(messages));
    const surface = model.get(surfaceId);
    if (!surface) return undefined;
    return canonicalize({
      catalogId: surface.defaultCatalog.id,
      rootId: surface.rootId,
      theme: surface.theme,
      metadata: surface.metadata,
      components: [...surface.componentsModel.getAll().entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, component]) => component.componentTree),
      data: surface.dataModel.get('/'),
    });
  } catch {
    // Unknown/incomplete snapshots stay visible; never hide an Agent update.
    return undefined;
  } finally { model.dispose(); }
}

export function A2UIActivityMessage(props: Props) {
  const outcome = interactionInputOutcome(props.boundInteraction);
  const requestMessages = props.boundInteraction?.presentation?.a2ui?.messages;
  const unchangedPresentation = useMemo(() => {
    if ((!outcome && props.boundInteraction?.kind !== 'approval') || !requestMessages) return false;
    const original = surfaceSnapshot(props.surfaceId, requestMessages);
    return original !== undefined && original === surfaceSnapshot(props.surfaceId, props.messages);
  }, [outcome, props.boundInteraction?.kind, requestMessages, props.surfaceId, props.messages]);
  const unchangedInput = Boolean(outcome && unchangedPresentation);
  const history = useMemo(() => {
    const accepted = props.boundInteraction && submittedResponse(props.boundInteraction);
    if (!unchangedInput || !accepted || !props.boundInteraction?.requestSchema) return undefined;
    return projectA2uiHistoryResponse(props.surfaceId, props.messages,
      props.boundInteraction.requestSchema, accepted.value);
  }, [unchangedInput, props.surfaceId, props.messages, props.boundInteraction]);
  // Saved approval details live in the tray or terminal history anchor. Keep
  // old Activity-only previews and later Agent result updates independently.
  if (props.boundInteraction?.kind === 'approval'
    && validatedApprovalA2ui(props.boundInteraction) && unchangedPresentation) return null;
  if (props.boundInteraction && ['pending', 'resolving', 'failed'].includes(props.boundInteraction.status)) {
    return props.boundInteraction.kind === 'approval'
      ? <A2uiSnapshot {...props} disabled onAction={undefined} /> : null;
  }
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
  if (outcome && unchangedInput) {
    const label = outcome === 'submitted' ? '已提交表单'
      : outcome === 'cancelled' ? '已取消表单' : '已过期表单';
    return (
      <details className="mx-auto mb-3 w-full max-w-3xl px-6 text-sm text-muted-foreground" data-testid="a2ui-input-history">
        <summary className="cursor-pointer">
          {label} · {props.boundInteraction?.title || '补充信息'}
        </summary>
        {props.boundInteraction?.message ? <p className="mt-2">{props.boundInteraction.message}</p> : null}
        {props.boundInteraction?.responseSummary ? <p className="mt-1" data-testid="a2ui-input-response-summary">{props.boundInteraction.responseSummary}</p> : null}
        {outcome === 'submitted' && !history ? <p className="mt-2">此历史记录没有可恢复的提交值，以下为原始表单。</p> : null}
        <div className="mt-2" data-testid="a2ui-input-history-snapshot">
          {history && !history.mapped ? <div data-testid="a2ui-input-response-fallback">
            <p>已提交参数（原卡片没有可确定的输入绑定）：</p>
            <pre className="whitespace-pre-wrap">{JSON.stringify(history.answer.summary, null, 2)}</pre>
          </div> : <A2uiSnapshot {...props} messages={history?.messages || props.messages}
            historyAnswer={history?.legacy ? history.answer : undefined} disabled onAction={undefined} />}
        </div>
      </details>
    );
  }
  return <A2uiSnapshot {...props} />;
}

function A2uiSnapshot(props: Props) {
  const created = props.messages.flatMap(message => {
    const create = message.createSurface as { surfaceId?: string; catalogId?: string } | undefined;
    return create?.surfaceId === props.surfaceId ? [create] : [];
  }).at(-1);
  if (created?.catalogId === legacyCatalogId) {
    const model = new A2uiSurfaces(() => {});
    try { model.apply(structuredClone(props.messages)); } catch {
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
