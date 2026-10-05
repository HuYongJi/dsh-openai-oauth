import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Optional installation smoke test. Auth cookies stay in memory and are never logged. */
export async function verifyInstalledGui(ctx, signal = new AbortController().signal) {
  const base = `http://127.0.0.1:${ctx.webServer.port}/`;
  const result = { timestamp: new Date().toISOString(), url: base, passed: false };
  try {
    signal.throwIfAborted();
    let row = ctx.clientModules.graph().entries.find(item => item.id === 'dsh-openai-oauth');
    if (!row) {
      await new Promise((resolve, reject) => {
        let unwatch = () => {};
        let timeout;
        const cleanup = () => { clearTimeout(timeout); unwatch(); signal.removeEventListener('abort', aborted); };
        const aborted = () => { cleanup(); reject(new Error('CANCELLED')); };
        unwatch = ctx.clientModules.onGraphChanged(() => {
          row = ctx.clientModules.graph().entries.find(item => item.id === 'dsh-openai-oauth');
          if (row) { cleanup(); resolve(); }
        });
        signal.addEventListener('abort', aborted, { once: true });
        timeout = setTimeout(() => { cleanup(); reject(new Error('GRAPH_NOT_READY')); }, 15000);
        if (signal.aborted) aborted();
      });
    }
    result.clientRegistered = !!row;
    const deadline = () => AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const exchange = await fetch(ctx.connection.authenticatedUrl(base), { redirect: 'manual', signal: deadline() });
    result.nativeAuthenticationExchange = exchange.status === 303;
    const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('AUTH_EXCHANGE_FAILED');
    const htmlResponse = await fetch(base, { headers: { cookie }, redirect: 'error', signal: deadline() });
    result.guiHttpStatus = htmlResponse.status;
    const html = await htmlResponse.text();
    result.guiBootIncludesPlugin = html.includes('dsh-openai-oauth');
    const bundleUrl = new URL(row.url, base);
    if (bundleUrl.origin !== new URL(base).origin || bundleUrl.username || bundleUrl.password) throw new Error('CROSS_ORIGIN_BUNDLE');
    const bundle = await fetch(bundleUrl, { headers: { cookie }, redirect: 'error', signal: deadline() });
    result.bundleHttpStatus = bundle.status;
    const source = await bundle.text();
    result.bundleContainsLoginUi = source.includes('dsh-openai-oauth') && source.includes('登录 ChatGPT') && source.includes('settings.models.footer');
    const api = base + 'api/openai-oauth/status';
    const body = { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' }, redirect: 'error' };
    const status = await fetch(api, { ...body, headers: { ...body.headers, cookie }, signal: deadline() });
    result.authenticatedApiHttpStatus = status.status;
    const snapshot = await status.json();
    const bools = ['available', 'loggedIn', 'credentialWritable', 'inFlight', 'namespacePresent', 'settingsWritable', 'routeConfigured', 'apiKeyOverride', 'fastAvailable', 'fastMode'];
    if (snapshot.ok === true && bools.every(key => typeof snapshot.status?.[key] === 'boolean')) {
      result.status = Object.fromEntries(bools.map(key => [key, snapshot.status[key]]));
    }
    result.unauthenticatedApiHttpStatus = (await fetch(api, { ...body, signal: deadline() })).status;
    result.crossOriginApiHttpStatus = (await fetch(api, { ...body, headers: { ...body.headers, cookie, origin: 'https://example.invalid', 'sec-fetch-site': 'cross-site' }, signal: deadline() })).status;
    result.passed = result.clientRegistered && result.nativeAuthenticationExchange && result.guiHttpStatus === 200
      && result.guiBootIncludesPlugin && result.bundleHttpStatus === 200 && result.bundleContainsLoginUi
      && result.authenticatedApiHttpStatus === 200 && result.status?.available === true && typeof result.status?.fastAvailable === 'boolean'
      && result.unauthenticatedApiHttpStatus === 401 && result.crossOriginApiHttpStatus === 403;
  } catch { if (signal.aborted) return; result.error = 'INSTALLATION_VERIFICATION_FAILED'; }
  if (signal.aborted) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stateDir = join(homedir(), '.dsh', 'openai-oauth');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await writeFile(join(stateDir, `runtime-verification-${stamp}.json`), JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}
