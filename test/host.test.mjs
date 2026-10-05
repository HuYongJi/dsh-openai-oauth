import test from 'node:test';
import assert from 'node:assert/strict';
import { API, CREDENTIAL_KEY, apply, createBridge, enableRoute, getStatus } from '../src/host.js';

function fixture(options = {}) {
  let loggedIn = options.loggedIn ?? false;
  let inFlight = false;
  let revision = 'r1';
  const writes = [];
  const deleted = [];
  const value = { providers: { codex: { apiKeyEnv: 'CODEX_API_KEY', models: [{ id: 'existing-model' }], headers: { preserve: 'yes' } }, ...options.providers } };
  const ctx = {
    settings: {
      writable: options.writable ?? true,
      describe(request) {
        assert.deepEqual(request, { redactSecrets: true });
        return options.noNamespace ? [] : [{ ns: 'llm-pi-ai', value: structuredClone(value), revision }];
      },
      async mutate(ns, ops, expectedRevision) {
        assert.equal(ns, 'llm-pi-ai');
        assert.equal(expectedRevision, revision);
        if (options.conflict) throw Object.assign(new Error('contains secret token'), { code: 'SETTINGS_CONFLICT' });
        writes.push({ ns, ops, expectedRevision });
        value.providers['openai-codex'] = ops[0].value;
        revision = 'r2';
      },
    },
    credentials: {
      async describeRecord(key) { assert.equal(key, CREDENTIAL_KEY); return { configured: loggedIn, writable: true, ...(loggedIn ? { kind: options.kind ?? 'grant' } : {}) }; },
      async deleteRecord(key) { assert.equal(key, CREDENTIAL_KEY); loggedIn = false; deleted.push(key); },
      readRecord() { throw new Error('Must not read secret payload'); },
    },
    authorization: {
      describe(key) { assert.equal(key, CREDENTIAL_KEY); return options.noFlow ? undefined : { methods: [{ id: 'oauth' }], inFlight }; },
      async begin(request) {
        assert.equal(request.key, CREDENTIAL_KEY);
        assert.equal(request.method, 'oauth');
        inFlight = true;
        try {
          const method = await request.interaction.prompt({ kind: 'select', options: [{ id: 'browser', label: 'Browser' }, { id: 'device_code', label: 'Device' }] });
          assert.equal(method, options.mode ?? 'browser');
          if (options.run) return await options.run(request, () => { loggedIn = true; });
          if (options.throwSecret) throw new Error('access_token=SECRET refresh_token=SECRET');
          const promptAbort = new AbortController();
          request.interaction.notify({ url: 'https://auth.openai.com/oauth/authorize?state=public-state', message: 'ignored' });
          const manual = request.interaction.prompt({ kind: 'text', signal: promptAbort.signal });
          promptAbort.abort();
          await manual.catch(() => {});
          if (options.cancelled) return { status: 'cancelled' };
          loggedIn = true;
          return { status: 'authorized' };
        } finally { inFlight = false; }
      },
    },
  };
  return { ctx, writes, deleted, value };
}
function request(body = {}, abort = new AbortController()) {
  return new Request('http://dsh.internal' + API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
}
async function frames(response) {
  return (await response.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('status projects only boolean metadata, never reads secrets', async () => {
  const { ctx } = fixture({ loggedIn: true });
  const status = await getStatus(ctx);
  assert.equal(status.loggedIn, true);
  assert.ok(Object.values(status).every(value => typeof value === 'boolean'));
});
test('enable adds only the missing native route; defaults and other providers untouched', async () => {
  const { ctx, writes, value } = fixture({ loggedIn: true });
  const existing = structuredClone(value.providers.codex);
  await enableRoute(ctx);
  assert.deepEqual(writes[0], { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'openai-codex'], value: {} }], expectedRevision: 'r1' });
  assert.deepEqual(value.providers.codex, existing);
});
test('existing Codex configuration and API override are never overwritten', async () => {
  const profile = { apiKeyEnv: 'EXISTING', baseURL: 'https://existing.test', models: [{ id: 'one' }] };
  const { ctx, writes, value } = fixture({ loggedIn: true, providers: { 'openai-codex': profile } });
  await enableRoute(ctx);
  assert.equal(writes.length, 0);
  assert.deepEqual(value.providers['openai-codex'], profile);
  assert.equal((await getStatus(ctx)).apiKeyOverride, true);
});
test('read-only existing route is preserved and requires no write', async () => {
  const { ctx, writes } = fixture({ loggedIn: true, writable: false, providers: { 'openai-codex': {} } });
  await enableRoute(ctx);
  assert.equal(writes.length, 0);
});
test('missing login, namespace, read-only settings and CAS conflict do not write', async () => {
  for (const [options, code] of [[{}, 'NOT_LOGGED_IN'], [{ loggedIn: true, noNamespace: true }, 'NO_NAMESPACE'], [{ loggedIn: true, writable: false }, 'READ_ONLY'], [{ loggedIn: true, conflict: true }, 'CONFLICT']]) {
    const { ctx, writes } = fixture(options);
    await assert.rejects(enableRoute(ctx), error => error.code === code);
    assert.equal(writes.length, 0);
  }
});
test('native authorization success enables the route and streams completion', async () => {
  const { ctx, writes } = fixture();
  const bridge = createBridge(ctx);
  const output = await frames(await bridge.fetch('start', request({ mode: 'browser' })));
  assert.equal(output[0].type, 'started');
  assert.ok(output.some(frame => frame.type === 'notice' && frame.url.startsWith('https://auth.openai.com/')));
  assert.ok(output.some(frame => frame.type === 'withdrawn'));
  const done = output.find(frame => frame.type === 'completed');
  assert.equal(done.outcome, 'authorized');
  assert.equal(done.status.loggedIn, true);
  assert.equal(done.status.routeConfigured, true);
  assert.equal(writes.length, 1);
  bridge.dispose();
});
test('device-code UI choice is relayed to native login', async () => {
  const { ctx } = fixture({ mode: 'device_code' });
  const bridge = createBridge(ctx);
  const output = await frames(await bridge.fetch('start', request({ mode: 'device_code' })));
  assert.equal(output.find(frame => frame.type === 'completed').outcome, 'authorized');
  bridge.dispose();
});
test('successful credential commit + route conflict is a partial success, not a new login', async () => {
  const { ctx, writes } = fixture({ conflict: true });
  const bridge = createBridge(ctx);
  const done = (await frames(await bridge.fetch('start', request({ mode: 'browser' })))).find(frame => frame.type === 'completed');
  assert.equal(done.outcome, 'authorized');
  assert.equal(done.routeError, 'CONFLICT');
  assert.equal(done.status.loggedIn, true);
  assert.equal(done.status.routeConfigured, false);
  assert.equal(writes.length, 0);
  bridge.dispose();
});
test('cancelled or failed login does not create a route and does not expose token errors', async () => {
  for (const options of [{ cancelled: true }, { throwSecret: true }]) {
    const { ctx, writes } = fixture(options);
    const bridge = createBridge(ctx);
    const response = await bridge.fetch('start', request({ mode: 'browser' }));
    const text = await response.text();
    assert.ok(!text.includes('SECRET'));
    assert.equal(writes.length, 0);
    assert.match(text, /cancelled|LOGIN_FAILED/);
    bridge.dispose();
  }
});
test('rejects malformed, huge, wrong-content-type and unexpected fields', async () => {
  const { ctx } = fixture();
  const bridge = createBridge(ctx);
  for (const req of [request({ unsupported: true }), request({ blob: 'x'.repeat(20000) }), new Request('http://dsh.internal' + API, { method: 'POST', body: '{}' }), request({ mode: 'password' })]) {
    const response = await bridge.fetch('start', req);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'BAD_REQUEST');
  }
  bridge.dispose();
});
test('logout removes only the named OAuth record, preserves every provider', async () => {
  const { ctx, writes, deleted, value } = fixture({ loggedIn: true, providers: { 'openai-codex': { models: [{ id: 'keep' }] } } });
  const original = structuredClone(value);
  const bridge = createBridge(ctx);
  const result = await (await bridge.fetch('logout', request())).json();
  assert.equal(result.status.loggedIn, false);
  assert.deepEqual(deleted, [CREDENTIAL_KEY]);
  assert.deepEqual(value, original);
  assert.equal(writes.length, 0);
  bridge.dispose();
});
test('prompt answer is capability-scoped; duplicate start and wrong attempt cancellation fail', async () => {
  let received;
  const { ctx } = fixture({ run: async (req, commit) => {
    received = await req.interaction.prompt({ kind: 'text', signal: req.signal });
    commit(); return { status: 'authorized' };
  } });
  const bridge = createBridge(ctx);
  const response = await bridge.fetch('start', request({ mode: 'browser' }));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const first = JSON.parse(decoder.decode((await reader.read()).value).trim());
  const prompt = JSON.parse(decoder.decode((await reader.read()).value).trim());
  const duplicate = await bridge.fetch('start', request({ mode: 'browser' }));
  assert.equal(duplicate.status, 409);
  const wrong = await bridge.fetch('cancel', request({ attemptId: 'wrong' }));
  assert.equal((await wrong.json()).error, 'PROMPT_GONE');
  const reply = await bridge.fetch('reply', request({ attemptId: first.attemptId, promptId: prompt.promptId, value: 'manual-code' }));
  assert.equal((await reply.json()).ok, true);
  while (!(await reader.read()).done) {}
  assert.equal(received, 'manual-code');
  bridge.dispose();
});
test('HTTP disconnect and plugin disposal withdraw only owned attempts; no route is created', async () => {
  for (const disconnect of [true, false]) {
    const { ctx, writes } = fixture({ run: async req => {
      await new Promise(resolve => req.signal.addEventListener('abort', resolve, { once: true }));
      return { status: 'cancelled' };
    } });
    const bridge = createBridge(ctx);
    const abort = new AbortController();
    const response = await bridge.fetch('start', request({ mode: 'browser' }, abort));
    // Wait until the flow entered its interaction before withdrawing it.
    await new Promise(resolve => setImmediate(resolve));
    if (disconnect) abort.abort(); else bridge.dispose();
    const output = await frames(response);
    assert.equal(output.find(frame => frame.type === 'completed').outcome, 'cancelled');
    assert.equal(writes.length, 0);
    bridge.dispose();
  }
});
test('unsafe authorization URLs, raw notices, and secrets are not serialized', async () => {
  const { ctx } = fixture({ run: async (req, commit) => {
    for (const url of ['https://evil.test/', 'javascript:alert(1)', 'http://auth.openai.com/', 'https://user:pass@auth.openai.com/', 'https://auth.openai.com:8443/']) req.interaction.notify({ url, message: 'SECRET' });
    commit(); return { status: 'authorized' };
  } });
  const bridge = createBridge(ctx);
  const output = await frames(await bridge.fetch('start', request({ mode: 'browser' })));
  assert.ok(output.filter(frame => frame.type === 'notice').every(frame => !frame.url));
  assert.ok(!JSON.stringify(output).includes('SECRET'));
  bridge.dispose();
});
test('logout does not delete a non-OAuth record at the same key', async () => {
  const { ctx, deleted } = fixture({ loggedIn: true, kind: 'api-key' });
  const bridge = createBridge(ctx);
  assert.equal((await (await bridge.fetch('logout', request())).json()).ok, true);
  assert.equal(deleted.length, 0);
  await bridge.dispose();
});
test('disposal after credential commit waits for completion but never enables a new route', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { ctx, writes } = fixture({ run: async (req, commit) => {
    commit(); await wait; return { status: 'authorized' };
  } });
  const bridge = createBridge(ctx);
  const response = await bridge.fetch('start', request({ mode: 'browser' }));
  await new Promise(resolve => setImmediate(resolve));
  const disposed = bridge.dispose();
  release(); await disposed;
  const done = (await frames(response)).find(frame => frame.type === 'completed');
  assert.equal(done.outcome, 'cancelled');
  assert.equal(writes.length, 0);
  assert.equal((await getStatus(ctx)).loggedIn, true);
});
test('route enable checks cancellation after asynchronous status read', async () => {
  const { ctx, writes } = fixture({ loggedIn: true });
  const describe = ctx.credentials.describeRecord;
  const abort = new AbortController();
  ctx.credentials.describeRecord = async key => { const record = await describe(key); abort.abort(); return record; };
  await assert.rejects(enableRoute(ctx, { signal: abort.signal }), error => error.code === 'DISPOSED');
  assert.equal(writes.length, 0);
});

test('Host registers exact routes only on existing Connection; no raw server, adapter or credential store', () => {
  const routes = [];
  const effects = [];
  const ctx = { connection: { fetch: { register(route) { routes.push(route); } } }, on() {}, effect(factory) { effects.push(factory()); } };
  apply(ctx);
  assert.deepEqual(routes.map(route => route.path), ['status', 'start', 'reply', 'cancel', 'enable', 'logout', 'fast'].map(action => API + action));
  assert.ok(routes.every(route => route.requestBody === 'streaming' && route.methods.length === 1 && route.methods[0] === 'POST'));
  effects.forEach(dispose => dispose());
});
