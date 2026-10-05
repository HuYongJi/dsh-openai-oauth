import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientPlugin, createController, trustedAuthorizationUrl } from '../src/client.js';
const status = { available: true, loggedIn: false, credentialWritable: true, inFlight: false, namespacePresent: true, settingsWritable: true, routeConfigured: false, apiKeyOverride: false, fastAvailable: false, fastMode: false };
function jsonStatus(overrides = {}) { return Response.json({ ok: true, status: { ...status, ...overrides } }); }
function streamFrames(frames) {
  return new Response(new ReadableStream({ start(controller) {
    // Deliberately split every UTF-8 payload, including inside a multibyte sequence.
    const data = new TextEncoder().encode(frames.map(frame => JSON.stringify(frame)).join('\n') + '\n');
    controller.enqueue(data.slice(0, 9)); controller.enqueue(data.slice(9, 21)); controller.enqueue(data.slice(21)); controller.close();
  } }), { headers: { 'content-type': 'application/x-ndjson' } });
}

test('authorization links require exact OpenAI HTTPS origin and standard port', () => {
  assert.equal(trustedAuthorizationUrl('https://auth.openai.com/oauth/authorize?state=abc'), 'https://auth.openai.com/oauth/authorize?state=abc');
  for (const url of ['https://evil.test/', 'https://auth.openai.com.evil.test/', 'http://auth.openai.com/', 'https://user:pass@auth.openai.com/', 'https://auth.openai.com:8443/', 'javascript:alert(1)', undefined]) assert.equal(trustedAuthorizationUrl(url), undefined);
});
test('client uses document-relative authenticated JSON requests, not raw root routes', async () => {
  const calls = [];
  const controller = createController(async (url, options) => { calls.push({ url, options }); return jsonStatus(); });
  await controller.refresh();
  assert.equal(calls[0].url, 'api/openai-oauth/status');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.body, '{}');
  assert.equal(controller.getSnapshot().loading, false);
  controller.dispose();
});
test('success clears transient codes/URLs/prompts and preserves partial route failure', async () => {
  let sawPrompt = false;
  const controller = createController(async url => url.endsWith('/start') ? streamFrames([
    { type: 'started', attemptId: 'mine' },
    { type: 'notice', url: 'https://auth.openai.com/oauth/authorize', code: 'DEVICE-CODE' },
    { type: 'prompt', promptId: 'prompt1', kind: 'text' },
    { type: 'completed', outcome: 'authorized', routeError: 'CONFLICT', status: { ...status, loggedIn: true } },
  ]) : jsonStatus({ loggedIn: true }));
  const stop = controller.subscribe(() => { if (controller.getSnapshot().prompt) sawPrompt = true; });
  await controller.start('browser');
  const snapshot = controller.getSnapshot();
  assert.equal(sawPrompt, true);
  assert.equal(snapshot.message, 'savedNotEnabled');
  assert.equal(snapshot.error, 'CONFLICT');
  assert.equal(snapshot.status.loggedIn, true);
  assert.equal(snapshot.prompt, undefined);
  assert.equal(snapshot.notice, undefined);
  assert.equal(snapshot.busy, false);
  stop(); controller.dispose();
});
test('network/authentication failures do not echo server secrets', async () => {
  for (const code of [401, 500]) {
    const controller = createController(async () => new Response('access_token=SECRET', { status: code }));
    await controller.refresh();
    assert.equal(controller.getSnapshot().error, code === 401 ? 'AUTH_REQUIRED' : 'REQUEST_FAILED');
    assert.ok(!JSON.stringify(controller.getSnapshot()).includes('SECRET'));
    controller.dispose();
  }
});
test('double-click creates one stream; cancel aborts only the owned stream', async () => {
  const calls = [];
  const controller = createController(async (url, options) => {
    calls.push(url);
    if (url.endsWith('/start')) return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'started', attemptId: 'mine' }) + '\n'));
      options.signal.addEventListener('abort', () => stream.error(new DOMException('aborted', 'AbortError')), { once: true });
    } }));
    return jsonStatus();
  });
  const stop = controller.subscribe(() => {});
  const first = controller.start('browser');
  await controller.start('browser');
  await new Promise(resolve => setImmediate(resolve));
  controller.cancel();
  await first;
  assert.equal(calls.filter(url => url.endsWith('/start')).length, 1);
  assert.equal(controller.getSnapshot().message, 'cancelled');
  assert.equal(controller.getSnapshot().busy, false);
  stop(); controller.dispose();
});
test('other-view subscriptions prevent an unrelated component from cancelling login', async () => {
  let streamAborted = false;
  const controller = createController(async (url, options) => {
    if (!url.endsWith('/start')) return jsonStatus();
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('{"type":"started","attemptId":"mine"}\n'));
      options.signal.addEventListener('abort', () => { streamAborted = true; stream.error(new DOMException('aborted', 'AbortError')); });
    } }));
  });
  const one = controller.subscribe(() => {});
  const two = controller.subscribe(() => {});
  const running = controller.start('browser');
  await new Promise(resolve => setImmediate(resolve));
  one(); await Promise.resolve();
  assert.equal(streamAborted, false);
  two(); await running;
  assert.equal(streamAborted, true);
  controller.dispose();
});
test('late status responses cannot overwrite fresher status', async () => {
  const requests = [];
  const controller = createController((url, options) => new Promise(resolve => requests.push({ resolve, options })));
  const first = controller.refresh();
  const second = controller.refresh();
  requests[1].resolve(jsonStatus({ loggedIn: true })); await second;
  requests[0].resolve(jsonStatus({ loggedIn: false })); await first;
  assert.equal(controller.getSnapshot().status.loggedIn, true);
  controller.dispose();
});
test('enable and logout use separate operations, not a new login', async () => {
  const calls = [];
  const controller = createController(async url => {
    calls.push(url);
    return jsonStatus({ loggedIn: !url.endsWith('/logout'), routeConfigured: true });
  });
  await controller.refresh(); await controller.enable(); await controller.logout();
  assert.deepEqual(calls, ['api/openai-oauth/status', 'api/openai-oauth/enable', 'api/openai-oauth/logout']);
  assert.equal(controller.getSnapshot().message, 'signedOut');
  controller.dispose();
});
test('plugin registers native settings section and Models footer without replacing model editor', () => {
  const registered = [];
  const cleanup = [];
  const plugin = createClientPlugin(id => {
    if (id === 'react') return {};
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return {};
    throw new Error('Unexpected dependency ' + id);
  });
  const ctx = {
    effect(callback) { const dispose = callback(); if (dispose) cleanup.push(dispose); },
    locale: { register() { return () => {}; }, bind() { return key => key; } },
    slots: { inject(name, callback) { return callback(); }, register(options, component) { registered.push({ options, component }); return () => {}; } },
    remote: { $on() { return () => {}; } },
    on() {},
  };
  plugin.apply(ctx);
  assert.deepEqual(plugin.inject, ['slots', 'locale', 'remote']);
  assert.deepEqual(registered.map(item => item.options.name), ['settings.section', 'settings.models.footer']);
  assert.equal(registered[0].options.id, 'openai-oauth');
  assert.equal(registered[0].options.inject().controller, registered[1].options.inject().controller);
  cleanup.forEach(dispose => dispose());
});
test('logout invalidates an older pending status response', async () => {
  let resolveOld;
  let reads = 0;
  const controller = createController(async url => {
    if (url.endsWith('/logout')) return jsonStatus({ loggedIn: false });
    if (++reads === 1) return jsonStatus({ loggedIn: true });
    return new Promise(resolve => { resolveOld = resolve; });
  });
  await controller.refresh();
  const old = controller.refresh();
  await controller.logout();
  assert.equal(controller.getSnapshot().status.loggedIn, false);
  resolveOld(jsonStatus({ loggedIn: true }));
  await old;
  assert.equal(controller.getSnapshot().status.loggedIn, false);
  controller.dispose();
});

test('Fast control is off by default, gated by sign-in and backend support', () => {
  const entries = [];
  const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const react = { createElement: h, useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useEffect() {}, useSyncExternalStore(_subscribe, snapshot) { return snapshot(); } };
  const plugin = createClientPlugin(id => id === 'react' ? react : { Button: 'Button', Modal: 'Modal', writeClipboard: async () => true });
  plugin.apply({ effect(fn) { fn(); }, locale: { register() {}, bind() { return key => key; } }, slots: { inject(_name, fn) { fn(); }, register(_options, component) { entries.push(component); return () => {}; } }, remote: { $on() { return () => {}; } }, on() {} });
  const toggled = [];
  const render = overrides => {
    const controller = { subscribe() {}, setFast(value) { toggled.push(value); }, getSnapshot() { return { status: { ...status, routeConfigured: true, fastAvailable: true, ...overrides }, loading: false, busy: false, signingIn: false }; } };
    const tree = entries[0]({ controller, t: key => key });
    const flatten = value => value && typeof value === 'object' ? [value, ...(value.children ?? []).flatMap(flatten)] : [];
    return flatten(tree).filter(node => node.type === 'Button');
  };
  assert.equal(render({ loggedIn: false }).some(node => node.children.includes('fastEnable')), false);
  const disabled = render({ loggedIn: true, fastAvailable: false }).find(node => node.children.includes('fastEnable'));
  assert.equal(disabled.props.disabled, true);
  const enabled = render({ loggedIn: true }).find(node => node.children.includes('fastEnable'));
  assert.equal(enabled.props['aria-pressed'], false);
  enabled.props.onClick();
  assert.deepEqual(toggled, [true]);
  const on = render({ loggedIn: true, fastMode: true }).find(node => node.children.includes('fastDisable'));
  assert.equal(on.props['aria-pressed'], true);
  on.props.onClick();
  assert.deepEqual(toggled, [true, false]);
  assert.equal(render({ loggedIn: true, apiKeyOverride: true }).find(node => node.children.includes('fastEnable')).props.disabled, true);
});

test('rendered login controls reflect real OAuth status and avoid password/API-key fields', () => {
  const entries = [];
  const react = {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
    useState(initial) { return [initial, () => {}]; }, useRef(initial) { return { current: initial }; }, useEffect() {},
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot(); },
  };
  const plugin = createClientPlugin(id => id === 'react' ? react : { Button: 'Button', Modal: 'Modal', writeClipboard: async () => true });
  const ctx = { effect(fn) { fn(); }, locale: { register() {}, bind() { return key => key; } }, slots: { inject(name, fn) { fn(); }, register(options, component) { entries.push(component); return () => {}; } }, remote: { $on() { return () => {}; } }, on() {} };
  plugin.apply(ctx);
  const controller = { subscribe() {}, getSnapshot() { return { status, loading: false, busy: false, signingIn: false }; } };
  const tree = entries[0]({ controller, t: key => key });
  function flatten(value) { return value && typeof value === 'object' ? [value, ...(value.children ?? []).flatMap(flatten)] : []; }
  const nodes = flatten(tree);
  const browser = nodes.find(node => node.type === 'Button' && node.children.includes('browser'));
  assert.equal(browser.props.disabled, false);
  assert.ok(!nodes.some(node => node.type === 'input' && node.props.type === 'password'));
  assert.ok(!JSON.stringify(tree).includes('apiKeyEnv'));
});
