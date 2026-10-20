# AG-UI 通用表单接入与验证记录

实施分支：`codex/agui-a2ui-implementation-20261020`。本记录覆盖通用表单的前端实现，不代表完整 A2UI、本地 M1 或云端已验收。

## 本批实现

- 提交链路使用 `JsonValue`，不把 false、0、空字符串、数组和 null 强制转换为对象。
- 以 Runtime 保存的 `request_schema` 校验答案；A2UI 展示消息不能替换该 Schema。
- 新通用表单覆盖基础标量、enum、嵌套对象、nullable，以及数组、引用、组合 Schema 的 JSON 输入降级。JSON 草稿非法时阻止提交先前的有效旧值。
- 表单控件按交互身份/revision 隔离；终态不可再次操作。Teams 既有对象表单及其冻结合同继续使用原组件。
- AG-UI 请求保留 `responseSchema` 和原始答案；发出恢复请求不再提前把交互标为完成。同一公开等待仍存在时允许修改；到达下一次等待才结束前一项；结果不明继续等待确认。
- AG-UI 单项提交不会给其他并行等待项伪造答案。全局运行终态在恢复确认之后处理，避免先把待确认卡片错误过期。
- 根 null 按正式 AG-UI 1.0 限制在发出请求前拒绝，应走 Interaction/v1；对象内部 null 保留。没有使用私有包装或 sentinel 绕过协议。[官方 Schema](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/schema.mdx)

## 验证范围

前后端使用字节一致的 16 组 JSON Schema 样本，涵盖 draft 4/6/7/2019/2020、本地引用、组合、日期、嵌套和 JSON 基础值。

样本 SHA256：`80340123e1c4131de570e8017c4fea8f5752b36e1276ee74138a2346a52a5b78`。

本批已执行：

- TypeScript 检查和全项目 ESLint 通过。
- Vitest 当前源码 1031 passed；Node 测试 128 passed。
- SDK shared Schema 样本 16 passed；原生图、AG-UI 与 null 持久化另有实际执行记录。
- `build:all` 的 KSADK、Hosted、Demo 和库构建通过；未发布 npm 包。
- 真实 Chrome 表单控件专项 2 passed：混合嵌套值、错误 JSON 草稿、标量根答案。页面没有拦截 Runtime API，也没有实际启动 Agent，因此只属于控件回归，不计作真实 Agent E2E。

原始日志保存在当前任务的 `implementation-20261020/` 证据目录。单测中的 fetch/SSE fixture 用于 UI 回归，不能代替真实后端验收。

## 尚未完成

- SDK 本地公共控制入口、直接 AG-UI 的统一持久化恢复和故障对账仍在实现；阶段 1、2 尚未共同签收。
- 当前仍是原有 A2UI renderer；官方 renderer、目录资产、增量生命周期属于阶段 3。
- 真实 FastAPI + LangGraph + SQLite + 产品页面的独立 E2E、真实模型、候选 wheel 与 tarball 尚未交付。
- Server、Gateway、Hosted 部署、双实例和预发尚未验收。
