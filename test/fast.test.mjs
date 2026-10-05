import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFastMode } from '../src/fast.js';
import { createBridge } from '../src/host.js';

function nativeFixture() {
  const calls = [];
  const model = { provider: 'openai-codex', id: 'gpt-6-sol' };
  const other = { provider: 'unrelated', id: 'other' };
  class PiAiAdapter {
    snapshot = {
      profiles: new Map([['openai-codex', {}]]),
      models: { streamSimple(model, context, options) { calls.push({ model, context, options }); return options; } },
    };
    current() { return this.snapshot; }
  }
  const adapter = new PiAiAdapter();
  const ctx = { llm: { adapters: new Map([['openai-codex', { adapter }]]) } };
  return { ctx, calls, model, other, adapter };
}
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-fast-test-'));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return join(dir, 'fast-mode.json');
}

test('Fast starts disabled and native Standard requests remain untouched', async t => {
  const native = nativeFixture();
  const original = native.adapter.current;
  const file = await temporary(t);
  const fast = createFastMode(native.ctx, { path: file });
  assert.deepEqual(await fast.status(), { fastAvailable: true, fastMode: false });
  const input = { sessionId: 'reuse', signal: new AbortController().signal, headers: { preserve: 'yes' } };
  const context = { messages: [{ role: 'user' }] };
  native.adapter.current().models.streamSimple(native.model, context, input);
  assert.equal(native.calls[0].options, input);
  assert.equal(native.calls[0].context, context);
  await fast.dispose();
  assert.equal(native.adapter.current, original);
});
test('enabled Fast only adds serviceTier fast to openai-codex requests without changing options', async t => {
  const native = nativeFixture();
  const fast = createFastMode(native.ctx, { path: await temporary(t) });
  await fast.set(true);
  const options = Object.freeze({ reasoning: 'high', cacheRetention: 'long', headers: Object.freeze({ preserve: 'yes' }), signal: new AbortController().signal });
  native.adapter.current().models.streamSimple(native.model, {}, options);
  native.adapter.current().models.streamSimple(native.other, {}, options);
  assert.equal(native.calls[0].options.serviceTier, 'fast');
  assert.equal(native.calls[0].options.headers, options.headers);
  assert.equal(native.calls[0].options.signal, options.signal);
  assert.equal(Object.hasOwn(options, 'serviceTier'), false);
  assert.equal(native.calls[1].options, options);
  await fast.set(false);
  native.adapter.current().models.streamSimple(native.model, {}, options);
  assert.equal(native.calls[2].options, options);
  await fast.dispose();
});
test('setting persists a boolean preference and a new instance restores it; disposal resets hook', async t => {
  const native = nativeFixture();
  const path = await temporary(t);
  const fast = createFastMode(native.ctx, { path });
  await fast.set(true);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 1, enabled: true });
  await fast.dispose();
  const later = createFastMode(native.ctx, { path });
  assert.deepEqual(await later.status(), { fastAvailable: true, fastMode: true });
  await later.dispose();
});
test('unsupported adapters fail closed; no fake enabled state and no file write', async t => {
  const path = await temporary(t);
  const native = nativeFixture();
  native.ctx.llm.adapters.set('openai-codex', { adapter: { current() { throw new Error('new upstream API'); } } });
  const fast = createFastMode(native.ctx, { path });
  assert.deepEqual(await fast.status(), { fastAvailable: false, fastMode: false });
  await assert.rejects(fast.set(true), error => error.code === 'FAST_UNAVAILABLE');
  await assert.rejects(readFile(path), error => error.code === 'ENOENT');
  await fast.dispose();
});
test('failed probe restores a partially patched snapshot', async t => {
  const native = nativeFixture();
  const original = native.adapter.snapshot.models.streamSimple;
  native.adapter.snapshot.profiles = new Map();
  const fast = createFastMode(native.ctx, { path: await temporary(t) });
  assert.deepEqual(await fast.status(), { fastAvailable: false, fastMode: false });
  assert.equal(native.adapter.snapshot.models.streamSimple, original);
  await fast.dispose();
});
test('new catalog snapshots are patched; route removal and disposal stop applying Fast', async t => {
  const native = nativeFixture();
  const fast = createFastMode(native.ctx, { path: await temporary(t) });
  await fast.set(true);
  const first = native.adapter.snapshot;
  native.adapter.snapshot = {
    profiles: new Map([['openai-codex', {}]]),
    models: { streamSimple(model, context, options) { native.calls.push({ model, context, options }); return options; } },
  };
  assert.equal((await fast.status()).fastAvailable, true);
  native.adapter.current().models.streamSimple(native.model, {}, {});
  assert.equal(native.calls.at(-1).options.serviceTier, 'fast');
  native.adapter.snapshot = { profiles: new Map(), models: { streamSimple() {} } };
  assert.equal((await fast.status()).fastAvailable, false);
  first.models.streamSimple(native.model, {}, {});
  assert.equal(Object.hasOwn(native.calls.at(-1).options, 'serviceTier'), false);
  await fast.dispose();
});
test('Host Fast operation needs a logged-in route, no API override, and validated boolean input', async t => {
  const native = nativeFixture();
  const fast = createFastMode(native.ctx, { path: await temporary(t) });
  let loggedIn = true;
  let override = false;
  const ctx = {
    ...native.ctx,
    settings: { writable: true, describe() { return [{ ns: 'llm-pi-ai', value: { providers: { 'openai-codex': override ? { apiKeyEnv: 'OTHER' } : {} } }, revision: 'r1' }]; } },
    credentials: { async describeRecord() { return { configured: loggedIn, writable: true, kind: 'grant' }; } },
    authorization: { describe() { return { methods: [{ id: 'oauth' }], inFlight: false }; } },
  };
  const bridge = createBridge(ctx, { fast });
  const call = async value => {
    const response = await bridge.fetch('fast', new Request('http://dsh.internal/api/openai-oauth/fast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }));
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await call({ enabled: 'true' })).body.error, 'BAD_REQUEST');
  override = true;
  assert.equal((await call({ enabled: true })).body.error, 'FAST_UNAVAILABLE');
  override = false; loggedIn = false;
  assert.equal((await call({ enabled: true })).body.error, 'NOT_LOGGED_IN');
  loggedIn = true;
  const result = await call({ enabled: true });
  assert.equal(result.body.status.fastMode, true);
  assert.equal(result.body.status.fastAvailable, true);
  await bridge.dispose(); await fast.dispose();
});
