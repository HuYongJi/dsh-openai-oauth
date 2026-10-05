import { randomUUID } from 'node:crypto';
import { createFastMode } from './fast.js';

export const name = 'openai-oauth-ui';
export const inject = ['connection', 'authorization', 'credentials', 'settings', 'llm'];
export const CREDENTIAL_KEY = 'llm-pi-ai/openai-codex';
export const ROUTE = 'openai-codex';
export const API = '/api/openai-oauth/';
const NS = 'llm-pi-ai';
const LIMIT = 16384;
const ERROR_CODES = new Set([
  'BAD_REQUEST', 'NO_FLOW', 'ALREADY_IN_FLIGHT', 'NOT_LOGGED_IN',
  'READ_ONLY', 'NO_NAMESPACE', 'CONFLICT', 'SETTINGS_FAILED', 'FAST_UNAVAILABLE', 'PROMPT_GONE',
  'UNSUPPORTED_PROMPT', 'TIMEOUT', 'LOGIN_FAILED', 'STORAGE_FAILED', 'DISPOSED',
]);

function failure(code) { return Object.assign(new Error(code), { code }); }
function safeCode(error, fallback = 'LOGIN_FAILED') {
  if (ERROR_CODES.has(error?.code)) return error.code;
  if (error?.code === 'UNKNOWN_METHOD') return 'NO_FLOW';
  if (/conflict/i.test(String(error?.code ?? ''))) return 'CONFLICT';
  return fallback;
}
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) {
  return plain(value) && Object.keys(value).every(key => keys.includes(key));
}
function flowOf(ctx) {
  const flow = ctx.authorization.describe(CREDENTIAL_KEY);
  return flow?.methods.some(method => method.id === 'oauth') ? flow : undefined;
}
function namespaceOf(ctx) {
  return ctx.settings.describe({ redactSecrets: true }).find(item => item.ns === NS);
}
function profileOf(namespace) {
  const providers = namespace?.value?.providers;
  return plain(providers) && Object.hasOwn(providers, ROUTE) ? providers[ROUTE] : undefined;
}

/** Only boolean metadata leaves the Host. Never read or return OAuth payloads. */
export async function getStatus(ctx, fast) {
  const credential = await ctx.credentials.describeRecord(CREDENTIAL_KEY);
  const flow = flowOf(ctx);
  const namespace = namespaceOf(ctx);
  const profile = profileOf(namespace);
  return {
    available: flow !== undefined,
    loggedIn: credential.configured === true && credential.kind === 'grant',
    credentialWritable: credential.writable === true,
    inFlight: flow?.inFlight === true,
    namespacePresent: namespace !== undefined,
    settingsWritable: ctx.settings.writable === true,
    routeConfigured: profile !== undefined,
    apiKeyOverride: typeof profile?.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0,
    ...(fast ? await fast.status() : { fastAvailable: false, fastMode: false }),
  };
}

/** CAS-protected, single-path write; preserve existing routes and defaults. */
export async function enableRoute(ctx, options = {}) {
  const check = () => { if (options.signal?.aborted) throw failure('DISPOSED'); };
  check();
  const status = await getStatus(ctx);
  check();
  if (!status.loggedIn) throw failure('NOT_LOGGED_IN');
  if (!status.namespacePresent) throw failure('NO_NAMESPACE');
  if (status.routeConfigured) return { created: false };
  if (!status.settingsWritable) throw failure('READ_ONLY');
  const namespace = namespaceOf(ctx);
  if (namespace === undefined) throw failure('NO_NAMESPACE');
  if (profileOf(namespace) !== undefined) return { created: false };
  try {
    await ctx.settings.mutate(NS, [{ op: 'set', path: ['providers', ROUTE], value: {} }], namespace.revision);
  } catch (error) {
    throw failure(safeCode(error, 'SETTINGS_FAILED'));
  }
  return { created: true };
}

/** Bounded JSON input; Connection owns authentication and the Host/Origin fence. */
async function readBody(request, keys) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw failure('BAD_REQUEST');
  }
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMIT)) throw failure('BAD_REQUEST');
  const reader = request.body?.getReader();
  if (!reader) throw failure('BAD_REQUEST');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMIT) { await reader.cancel(); throw failure('BAD_REQUEST'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('BAD_REQUEST'); }
  if (!exact(body, keys)) throw failure('BAD_REQUEST');
  return body;
}
function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}
function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'auth.openai.com' && !url.username && !url.password && (!url.port || url.port === '443')
      ? url.href : undefined;
  } catch { return undefined; }
}

/** Thin native authorization bridge. No second adapter, token store, or OAuth implementation. */
export function createBridge(ctx, options = {}) {
  const timeoutMs = options.timeoutMs ?? 16 * 60 * 1000;
  const fast = options.fast;
  const attempts = new Map();
  let disposed = false;

  function owned(body) {
    const attempt = typeof body.attemptId === 'string' ? attempts.get(body.attemptId) : undefined;
    if (!attempt) throw failure('PROMPT_GONE');
    return attempt;
  }
  function start(request, mode) {
    if (disposed) throw failure('DISPOSED');
    const flow = flowOf(ctx);
    if (!flow) throw failure('NO_FLOW');
    if (flow.inFlight || attempts.size) throw failure('ALREADY_IN_FLIGHT');
    const attemptId = randomUUID();
    const abort = new AbortController();
    const pending = new Map();
    const attempt = { abort, pending, emit: undefined, ended: false };
    attempts.set(attemptId, attempt);
    const withdraw = () => abort.abort();
    request.signal.addEventListener('abort', withdraw, { once: true });
    if (request.signal.aborted) abort.abort();
    let timer;
    const stream = new ReadableStream({
      start(controller) {
        let frames = 0;
        let streamClosed = false;
        const emit = value => {
          if (streamClosed) return;
          if (++frames > 256) { abort.abort(); return; }
          try { controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); }
          catch { streamClosed = true; abort.abort(); }
        };
        attempt.emit = emit;
        const close = () => {
          if (!streamClosed) { streamClosed = true; try { controller.close(); } catch {} }
        };
        emit({ type: 'started', attemptId });
        const prompt = question => {
          if (abort.signal.aborted || question.signal?.aborted) return Promise.reject(failure('PROMPT_GONE'));
          if (question.kind === 'select' && question.options?.some(item => item.id === mode)) return Promise.resolve(mode);
          if (question.kind !== 'text' && question.kind !== 'select') return Promise.reject(failure('UNSUPPORTED_PROMPT'));
          const promptId = randomUUID();
          return new Promise((resolve, reject) => {
            const signals = [abort.signal, question.signal].filter(Boolean);
            const cleanup = () => {
              pending.delete(promptId);
              for (const signal of signals) signal.removeEventListener('abort', gone);
            };
            const gone = () => {
              cleanup();
              emit({ type: 'withdrawn', promptId });
              reject(failure('PROMPT_GONE'));
            };
            pending.set(promptId, {
              kind: question.kind,
              options: question.options?.map(item => item.id),
              resolve(value) { cleanup(); resolve(value); },
              reject: gone,
            });
            for (const signal of signals) signal.addEventListener('abort', gone, { once: true });
            emit({
              type: 'prompt', promptId, kind: question.kind,
              ...(question.kind === 'select' ? {
                options: (question.options ?? []).map(item => ({ id: String(item.id), label: String(item.label) })),
              } : {}),
            });
          });
        };
        timer = setTimeout(() => abort.abort(failure('TIMEOUT')), timeoutMs);
        timer.unref?.();
        attempt.task = (async () => {
          try {
            const result = await ctx.authorization.begin({
              key: CREDENTIAL_KEY, method: 'oauth', signal: abort.signal,
              interaction: {
                prompt,
                notify(notice) {
                  const url = safeUrl(notice.url);
                  emit({ type: 'notice', ...(url ? { url } : {}),
                    ...(typeof notice.code === 'string' && notice.code.length <= 128 ? { code: notice.code } : {}) });
                },
              },
            });
            if (result.status === 'authorized') {
              if (disposed || abort.signal.aborted) { emit({ type: 'completed', outcome: 'cancelled' }); return; }
              let routeError;
              try { await enableRoute(ctx, { signal: abort.signal }); } catch (error) { routeError = safeCode(error, 'SETTINGS_FAILED'); }
              emit({ type: 'completed', outcome: 'authorized', ...(routeError ? { routeError } : {}), status: await getStatus(ctx, fast) });
            } else {
              emit({ type: 'completed', outcome: 'cancelled', ...(abort.signal.reason?.code === 'TIMEOUT' ? { error: 'TIMEOUT' } : {}) });
            }
          } catch (error) {
            emit({ type: 'completed', outcome: abort.signal.aborted ? 'cancelled' : 'failed',
              error: abort.signal.reason?.code === 'TIMEOUT' ? 'TIMEOUT' : safeCode(error) });
          } finally {
            clearTimeout(timer);
            attempt.ended = true;
            abort.abort();
            request.signal.removeEventListener('abort', withdraw);
            attempts.delete(attemptId);
            close();
          }
        })();
      },
      cancel() { abort.abort(); },
    });
    return new Response(stream, { headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-content-type-options': 'nosniff',
    } });
  }

  async function fetch(action, request) {
    try {
      if (disposed) throw failure('DISPOSED');
      const keys = action === 'start' ? ['mode'] : action === 'fast' ? ['enabled'] : action === 'reply'
        ? ['attemptId', 'promptId', 'value'] : action === 'cancel' ? ['attemptId'] : [];
      const body = await readBody(request, keys);
      if (action === 'status') return json({ ok: true, status: await getStatus(ctx, fast) });
      if (action === 'start') {
        if (body.mode !== 'browser' && body.mode !== 'device_code') throw failure('BAD_REQUEST');
        return start(request, body.mode);
      }
      if (action === 'reply') {
        const attempt = owned(body);
        const pending = typeof body.promptId === 'string' ? attempt.pending.get(body.promptId) : undefined;
        if (!pending) throw failure('PROMPT_GONE');
        if (typeof body.value !== 'string' || !body.value.trim() || body.value.length > 8192) throw failure('BAD_REQUEST');
        if (pending.kind === 'select' && !pending.options.includes(body.value)) throw failure('BAD_REQUEST');
        pending.resolve(body.value.trim());
        return json({ ok: true });
      }
      if (action === 'cancel') {
        owned(body).abort.abort();
        return json({ ok: true });
      }
      if (action === 'fast') {
        if (typeof body.enabled !== 'boolean') throw failure('BAD_REQUEST');
        if (!fast) throw failure('FAST_UNAVAILABLE');
        const status = await getStatus(ctx, fast);
        if (!status.loggedIn) throw failure('NOT_LOGGED_IN');
        if (!status.routeConfigured || status.apiKeyOverride || !status.fastAvailable) throw failure('FAST_UNAVAILABLE');
        await fast.set(body.enabled);
        return json({ ok: true, status: await getStatus(ctx, fast) });
      }
      if (action === 'enable') {
        await enableRoute(ctx);
        return json({ ok: true, status: await getStatus(ctx, fast) });
      }
      if (action === 'logout') {
        if (flowOf(ctx)?.inFlight || attempts.size) throw failure('ALREADY_IN_FLIGHT');
        const record = await ctx.credentials.describeRecord(CREDENTIAL_KEY);
        if (disposed || request.signal.aborted) throw failure('DISPOSED');
        if (record.configured && record.kind === 'grant') {
          if (!record.writable) throw failure('READ_ONLY');
          try { await ctx.credentials.deleteRecord(CREDENTIAL_KEY); }
          catch { throw failure('STORAGE_FAILED'); }
        }
        return json({ ok: true, status: await getStatus(ctx, fast) });
      }
      throw failure('BAD_REQUEST');
    } catch (error) {
      const code = safeCode(error);
      return json({ ok: false, error: code }, code === 'ALREADY_IN_FLIGHT' || code === 'CONFLICT' ? 409 : 400);
    }
  }
  return {
    fetch,
    async dispose() {
      disposed = true;
      const running = [...attempts.values()];
      for (const attempt of running) attempt.abort.abort();
      await Promise.allSettled(running.map(attempt => attempt.task));
    },
  };
}

/** Use the existing authenticated /api transport, including Electron browser cookies. */
export function apply(ctx, config = {}) {
  const fast = createFastMode(ctx);
  const bridge = createBridge(ctx, { fast });
  ctx.effect(() => async () => { await bridge.dispose(); await fast.dispose(); }, 'openai-oauth: cancel pending login and restore Fast hook');
  ctx.on('llm/adapters-updated', () => fast.probe());
  for (const action of ['status', 'start', 'reply', 'cancel', 'enable', 'logout', 'fast']) {
    ctx.connection.fetch.register({
      path: API + action, methods: ['POST'], requestBody: 'streaming',
      fetch: request => bridge.fetch(action, request),
    });
  }
  if (config.verifyOnLoad === true) {
    ctx.inject(['webServer', 'clientModules'], verifyCtx => {
      const abort = new AbortController();
      void import('./verify.js').then(module => {
        if (!abort.signal.aborted) return module.verifyInstalledGui(verifyCtx, abort.signal);
      }).catch(() => {
        if (!abort.signal.aborted) verifyCtx.logger.warn('openai-oauth: installation self-check could not write its result');
      });
      return () => abort.abort();
    });
  }
}
