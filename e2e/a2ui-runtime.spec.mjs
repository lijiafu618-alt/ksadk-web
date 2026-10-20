import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..');
const sdk = process.env.KSADK_TEST_SDK_DIR || path.resolve(web, '../ksadk-python');

async function startRuntime(project, kind, logFile, port = 0) {
  const environment = { ...process.env };
  for (const key of ['KSADK_AGENT_KERNEL', 'AGENT_KERNEL_ENABLED', 'KSADK_CHECKPOINT_BACKEND',
    'KSADK_CHECKPOINT_PATH', 'KSADK_CHECKPOINT_DSN', 'KSADK_DEPLOYMENT_MODE',
    'KSADK_LANGGRAPH_LOCAL_AUTO_CHECKPOINT', 'AGENT_INSTANCE_ID', 'AGENT_CONTROL_JWKS_URL']) delete environment[key];
  Object.assign(environment, {
    KSADK_SESSION_BACKEND: 'local', AGENT_KERNEL_AUTHORITY_MODE: 'local',
    KSADK_TEST_A2UI_PROJECT: project, KSADK_TEST_A2UI_WEB: path.join(web, 'dist-ksadk'),
    KSADK_TEST_A2UI_AGENT: kind,
  });
  const log = createWriteStream(logFile);
  const processHandle = spawn(path.join(sdk, '.venv/bin/python'), [
    '-m', 'uvicorn', 'tests.e2e.a2ui_runtime_app:create_app', '--factory', '--host', '127.0.0.1',
    '--port', String(port),
  ], { cwd: sdk, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  processHandle.stdout.pipe(log, { end: false });
  processHandle.stderr.pipe(log, { end: false });
  let output = '';
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Runtime startup timeout; see ${logFile}`)), 20_000);
    processHandle.once('error', reject);
    processHandle.once('exit', code => {
      clearTimeout(timer); reject(new Error(`Runtime exited during startup (${code}); see ${logFile}`));
    });
    processHandle.stderr.on('data', chunk => {
      output = (output + chunk.toString()).slice(-8192);
      const url = output.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (url) { clearTimeout(timer); resolve(url); }
    });
  });
  return {
    url: address,
    async stop() {
      if (processHandle.exitCode !== null) { log.end(); return; }
      const exited = new Promise(resolve => processHandle.once('exit', resolve));
      processHandle.kill('SIGTERM');
      const timer = setTimeout(() => processHandle.kill('SIGKILL'), 5000);
      await exited; clearTimeout(timer); log.end();
    },
  };
}

function executions(project) {
  const file = path.join(project, 'execution.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}

function checkpoints(project) {
  return JSON.parse(execFileSync(path.join(sdk, '.venv/bin/python'), ['-c',
    'import json,sqlite3,sys; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); print(json.dumps(c.execute("SELECT thread_id,checkpoint_ns,checkpoint_id FROM checkpoints ORDER BY checkpoint_id").fetchall()))',
    path.join(project, '.agentengine/ui/checkpoints.sqlite'),
  ], { encoding: 'utf8' }));
}

function verifyOriginalThread(before, after) {
  const threads = [...new Set(before.map(row => row[0]))];
  expect(threads).toHaveLength(1);
  expect([...new Set(after.map(row => row[0]))]).toEqual(threads);
  expect(after.length).toBeGreaterThan(before.length);
  for (const row of before) expect(after).toContainEqual(row);
}

async function openAndAsk(page, url, question) {
  const bootstrap = page.waitForResponse(response => response.url().endsWith('/GetAgentUiBootstrap'));
  await page.goto(url);
  const data = await (await bootstrap).json();
  expect(data.Data.HostedChat.Transports[0].Capabilities.SessionEventReplay).toBe(true);
  await page.getByText('a2ui-e2e', { exact: true }).first().waitFor();
  await page.getByPlaceholder('发送消息…').fill(question);
  await page.getByPlaceholder('发送消息…').press('Enter');
  const form = page.getByTestId('interaction-a2ui-surface');
  await expect(form).toHaveCount(1, { timeout: process.env.KSADK_TEST_A2UI_MODEL_ENV ? 150_000 : 15_000 });
  await expect(form.getByRole('button', { name: 'Submit request', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('sdk-internal-context-must-not-be-chat');
  return form;
}

for (const [kind, question, value] of [
  ['resource', '帮我查一个没说明清楚的资源', 'resource-demo'],
  ['trip', '我想换个城市看看，先把需要的信息问清楚', 'Hangzhou'],
  ['ticket', '需要让支持同事跟进这个事情', 'Investigate timeout'],
]) {
  test(`${kind}: live card, correction, native resume and refresh without duplicates`, async ({ page }, info) => {
    if (process.env.KSADK_TEST_A2UI_MODEL_ENV) test.setTimeout(180_000);
    const project = info.outputPath('project');
    const runtime = await startRuntime(project, kind, info.outputPath('runtime.log'));
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      const form = await openAndAsk(page, runtime.url, question);
      const waitingCheckpoints = checkpoints(project);
      expect(executions(project).filter(row => row.phase === 'initialize')).toHaveLength(1);
      await form.locator('input').fill('x');
      await form.getByRole('button', { name: 'Submit request', exact: true }).click();
      await expect(page.getByTestId('interaction-tray-error')).toBeVisible();
      expect(executions(project).filter(row => row.phase === 'tool')).toHaveLength(0);
      await form.locator('input').fill(value);
      await form.getByRole('button', { name: 'Submit request', exact: true }).dblclick();
      await expect(page.getByText(`Completed: ${value}`, { exact: true })).toHaveCount(1);
      await expect(page.getByTestId('interaction-tray')).toHaveCount(0);
      expect(executions(project).filter(row => row.phase === 'initialize')).toHaveLength(1);
      expect(executions(project).filter(row => row.phase === 'tool')).toHaveLength(1);
      verifyOriginalThread(waitingCheckpoints, checkpoints(project));
      await page.reload();
      await expect(page.getByText(`Completed: ${value}`, { exact: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Submit request', exact: true })).toHaveCount(0);
      expect(executions(project).filter(row => row.phase === 'tool')).toHaveLength(1);
      expect(pageErrors).toEqual([]);
    } finally { await page.close(); await runtime.stop(); }
  });
}

test('pending input survives backend restart and resumes the original checkpoint', async ({ page }, info) => {
  const project = info.outputPath('project');
  let runtime = await startRuntime(project, 'resource', info.outputPath('runtime-first.log'));
  try {
    await openAndAsk(page, runtime.url, '先问清楚资源，再执行查询');
    const waitingCheckpoints = checkpoints(project);
    const port = Number(new URL(runtime.url).port);
    await runtime.stop();
    runtime = await startRuntime(project, 'resource', info.outputPath('runtime-restart.log'), port);
    await page.reload();
    const form = page.getByTestId('interaction-a2ui-surface');
    await expect(form).toHaveCount(1);
    await form.locator('input').fill('after-restart');
    await form.getByRole('button', { name: 'Submit request', exact: true }).click();
    await expect(page.getByText('Completed: after-restart', { exact: true })).toHaveCount(1);
    expect(executions(project).filter(row => row.phase === 'initialize')).toHaveLength(1);
    expect(executions(project).filter(row => row.phase === 'tool')).toHaveLength(1);
    verifyOriginalThread(waitingCheckpoints, checkpoints(project));
  } finally { await page.close(); await runtime.stop(); }
});
