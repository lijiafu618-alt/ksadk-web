import type { Message } from './types.js';

const labels: Record<string, string> = {
  pending: '待执行', ready: '排队中', running: '执行中', waiting_approval: '等待审批',
  waiting_input: '等待补充输入', completed: '已完成', failed: '失败', cancelled: '已取消',
  indeterminate: '结果未确认', skipped: '已跳过',
};

export function OrchestrationStatusView({ graph }: { graph: NonNullable<Message['orchestration']> }) {
  const latest = graph.nodes.reduce<(typeof graph.nodes)[number] | undefined>((last, node) =>
    !last || (node.checkpointRevision ?? 0) > (last.checkpointRevision ?? 0) ? node : last, undefined);
  const kinds: Record<string, string> = { local: '本地', remote: '远程', parallel: '并行', conditional: '条件', join: '汇合' };
  return <section aria-label="编排运行状态" className="my-3 rounded border border-slate-200 p-3 dark:border-slate-700">
    <h3 className="mb-3 text-sm font-medium">编排运行状态</h3>
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500" aria-label="运行预算">
      {latest?.initialCallsUsed !== undefined && latest.maxInitialCalls !== undefined && <span>
        初始调用剩余：{Math.max(0, latest.maxInitialCalls - latest.initialCallsUsed)} / {latest.maxInitialCalls}
      </span>}
      {latest?.maxConcurrency !== undefined && <span>并发上限：{latest.maxConcurrency}</span>}
      {latest?.deadlineAt !== undefined && <span>截止时间：<time dateTime={new Date(latest.deadlineAt * 1000).toISOString()}>
        {new Date(latest.deadlineAt * 1000).toLocaleString()}
      </time>（含等待与停机）</span>}
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {graph.nodes.map(node => <article key={node.nodeId} data-node-id={node.nodeId} id={`graph-node-${graph.runId}-${graph.graphDigest}-${node.nodeId}`}
        className="rounded border border-slate-200 p-2 text-sm dark:border-slate-700">
        <div className="flex justify-between gap-2"><strong>{node.nodeId}</strong><span>{labels[node.state]}</span></div>
        {node.nodeKind && <span className="text-xs text-slate-500">{kinds[node.nodeKind]}</span>}
        {node.groupPath.length > 0 && <p className="text-xs text-slate-500">分组：{node.groupPath.join(' → ')}</p>}
        {node.branchId && <p>分支：{node.branchId}</p>}
        {node.failurePolicy && <p>{node.failurePolicy === 'fail_fast' ? '失败时停止其他分支' : '收集全部分支结果'}</p>}
        {node.selectedBranchId && <p>选中分支：{node.selectedBranchId}</p>}
        {node.joinCompleted !== undefined && node.joinTotal !== undefined && <p>汇合进度：{node.joinCompleted} / {node.joinTotal}</p>}
        {node.joinNodeId && <p><a href={`#graph-node-${graph.runId}-${graph.graphDigest}-${node.joinNodeId}`}>汇合到：{node.joinNodeId}</a></p>}
        {node.nextNodeId && <p><a href={`#graph-node-${graph.runId}-${graph.graphDigest}-${node.nextNodeId}`}>后继：{node.nextNodeId}</a></p>}
        {!!node.handledFailuresOf?.length && <p>已处理失败：{node.handledFailuresOf.join('、')}</p>}
        {node.reasonCode && <p className="text-xs text-slate-500">{node.reasonCode}</p>}
        {node.scopeId && <a className="text-blue-600 underline" href={`#a2a-scope-${node.scopeId}`}>查看远程调用</a>}
      </article>)}
    </div>
  </section>;
}
