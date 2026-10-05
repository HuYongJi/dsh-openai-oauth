// Compatibility shim tested with DSH 0.2.0-rc.2; not an upstream public API.
// Structural checks are NOT a version guarantee. It never replaces OAuth or model adapters.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const ROUTE = 'openai-codex';
// User-owned state stays outside the cloned Git repository and installed binaries.
const FILE = join(homedir(), '.dsh', 'openai-oauth', 'fast-mode.json');

export function createFastMode(ctx, options = {}) {
  const path = options.path ?? FILE;
  let enabled = false;
  let available = false;
  let disposed = false;
  let owner;
  let nativeCurrent;
  const snapshots = new Map();
  let queue = Promise.resolve();
  const ready = (async () => {
    try {
      const stored = JSON.parse(await readFile(path, 'utf8'));
      enabled = stored?.version === 1 && stored.enabled === true;
    } catch (error) {
      if (error?.code !== 'ENOENT') enabled = false;
    }
  })();

  function install(adapter) {
    if (disposed || !adapter || adapter.constructor?.name !== 'PiAiAdapter' || typeof adapter.current !== 'function') return false;
    if (owner === adapter) {
      try {
        const snapshot = adapter.current();
        if (snapshot?.profiles?.has(ROUTE) && snapshots.has(snapshot.models)) return true;
      } catch {}
      uninstall();
      return false;
    }
    if (owner) uninstall();
    const original = adapter.current;
    const hook = function (...args) {
      const snapshot = original.apply(this, args);
      if (snapshot?.models && !snapshots.has(snapshot.models)) {
        const models = snapshot.models;
        const stream = models.streamSimple;
        if (typeof stream !== 'function' || !Object.isExtensible(models)) return snapshot;
        const decorated = function (model, context, request) {
          const fast = !disposed && enabled && model?.provider === ROUTE;
          return stream.call(this, model, context, fast ? { ...request, serviceTier: 'fast' } : request);
        };
        try {
          models.streamSimple = decorated;
          if (models.streamSimple !== decorated) return snapshot;
        } catch { return snapshot; }
        snapshots.set(models, stream);
      }
      return snapshot;
    };
    try {
      adapter.current = hook;
      if (adapter.current !== hook) return false;
      const snapshot = adapter.current();
      if (!snapshot?.profiles?.has(ROUTE) || !snapshots.has(snapshot.models)) {
        try { adapter.current = original; } finally { uninstall(); }
        return false;
      }
    } catch {
      try { adapter.current = original; } finally { uninstall(); }
      return false;
    }
    owner = adapter;
    nativeCurrent = original;
    available = true;
    return true;
  }
  function uninstall() {
    if (owner && owner.current !== nativeCurrent) {
      try { owner.current = nativeCurrent; } catch {}
    }
    owner = undefined;
    nativeCurrent = undefined;
    available = false;
    for (const [models, stream] of snapshots) {
      try { models.streamSimple = stream; } catch {}
    }
    snapshots.clear();
  }
  function probe() {
    if (disposed) return false;
    const registration = ctx.llm?.adapters?.get(ROUTE);
    if (!registration || registration.adapter?.constructor?.name !== 'PiAiAdapter') {
      uninstall(); return false;
    }
    return install(registration.adapter);
  }
  async function status() {
    await ready;
    probe();
    return { fastAvailable: available, fastMode: enabled && available };
  }
  async function set(value) {
    if (typeof value !== 'boolean') throw Object.assign(new Error('INVALID_FAST_MODE'), { code: 'BAD_REQUEST' });
    await ready;
    if (disposed || !probe()) throw Object.assign(new Error('FAST_UNAVAILABLE'), { code: 'FAST_UNAVAILABLE' });
    return queue = queue.catch(() => {}).then(async () => {
      if (disposed || !probe()) throw Object.assign(new Error('FAST_UNAVAILABLE'), { code: 'FAST_UNAVAILABLE' });
      const temp = path + '.' + randomUUID() + '.tmp';
      try {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(temp, JSON.stringify({ version: 1, enabled: value }) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        if (disposed) throw Object.assign(new Error('DISPOSED'), { code: 'DISPOSED' });
        await rename(temp, path);
        enabled = value;
      } finally {
        await rm(temp, { force: true }).catch(() => {});
      }
      return status();
    });
  }
  return {
    ready,
    status,
    set,
    probe,
    async dispose() { disposed = true; await queue.catch(() => {}); uninstall(); },
  };
}
