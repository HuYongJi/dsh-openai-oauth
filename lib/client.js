// Generated DSH 0.2 plugin. See LICENSE and README.md.
window.__ModuleLoader__.load({
  id: "dsh-openai-oauth",
  factory: (require) => {
// Compatibility adaptation of AdonisSheldon/dsh-openai-oauth, upstream ba296605.
// Retains the browser/device-code UI workflow; uses DSH 0.2's native Host bridge.
const API = 'api/openai-oauth/';
const BOOLS = ['available', 'loggedIn', 'credentialWritable', 'inFlight', 'namespacePresent', 'settingsWritable', 'routeConfigured', 'apiKeyOverride', 'fastAvailable', 'fastMode'];

function trustedAuthorizationUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'auth.openai.com' && !url.username && !url.password && (!url.port || url.port === '443') ? url.href : undefined;
  } catch { return undefined; }
}
function statusView(value) {
  if (!value || BOOLS.some(key => typeof value[key] !== 'boolean')) throw new Error('REQUEST_FAILED');
  return Object.fromEntries(BOOLS.map(key => [key, value[key]]));
}
function errorCode(error) {
  return /^[A-Z_]{2,40}$/.test(String(error?.message ?? '')) ? error.message : 'REQUEST_FAILED';
}

/** Shared state for the settings page and Models footer, without polling or secrets. */
function createController(fetcher = globalThis.fetch.bind(globalThis)) {
  let state = { status: undefined, loading: true, busy: false, signingIn: false, notice: undefined, prompt: undefined, message: undefined, error: undefined };
  const listeners = new Set();
  let disposed = false;
  let active;
  let refreshAbort;
  let refreshGeneration = 0;
  const invalidateRefresh = () => { ++refreshGeneration; refreshAbort?.abort(); refreshAbort = undefined; };
  const update = patch => {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const request = async (action, body = {}, signal) => {
    const response = await fetcher(API + action, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('AUTH_REQUIRED');
      let result;
      try { result = await response.json(); } catch {}
      throw new Error(typeof result?.error === 'string' && /^[A-Z_]{2,40}$/.test(result.error) ? result.error : 'REQUEST_FAILED');
    }
    return response;
  };
  const rpc = async (action, body, signal) => {
    const result = await (await request(action, body, signal)).json();
    if (result.ok !== true) throw new Error('REQUEST_FAILED');
    return result;
  };
  async function refresh() {
    const generation = ++refreshGeneration;
    refreshAbort?.abort();
    const abort = new AbortController();
    refreshAbort = abort;
    try {
      const result = await rpc('status', {}, abort.signal);
      if (generation === refreshGeneration && !abort.signal.aborted) update({ status: statusView(result.status), loading: false,
        error: ['AUTH_REQUIRED', 'REQUEST_FAILED', 'STREAM_INTERRUPTED'].includes(state.error) ? undefined : state.error });
    } catch (error) {
      if (!abort.signal.aborted && generation === refreshGeneration) update({ loading: false, error: errorCode(error) });
    } finally { if (refreshAbort === abort) refreshAbort = undefined; }
  }
  async function start(mode) {
    if (disposed || active || state.busy || state.status?.inFlight) return;
    invalidateRefresh();
    const attempt = { abort: new AbortController(), id: undefined };
    active = attempt;
    update({ busy: true, signingIn: true, prompt: undefined, notice: undefined, message: 'waiting', error: undefined });
    let completed = false;
    let reader;
    try {
      const response = await request('start', { mode }, attempt.abort.signal);
      reader = response.body?.getReader();
      if (!reader) throw new Error('STREAM_INTERRUPTED');
      const decoder = new TextDecoder();
      let buffer = '';
      const handle = frame => {
        if (active !== attempt || attempt.abort.signal.aborted) return;
        if (frame.type === 'started' && typeof frame.attemptId === 'string') attempt.id = frame.attemptId;
        else if (frame.type === 'notice') {
          const url = trustedAuthorizationUrl(frame.url);
          const code = typeof frame.code === 'string' && frame.code.length <= 128 ? frame.code : undefined;
          if (url || code) update({ notice: { url, code } });
        } else if (frame.type === 'prompt' && typeof frame.promptId === 'string') {
          if (frame.kind !== 'text' && frame.kind !== 'select') throw new Error('UNSUPPORTED_PROMPT');
          update({ prompt: { id: frame.promptId, kind: frame.kind,
            options: frame.kind === 'select' && Array.isArray(frame.options) ? frame.options.filter(option => typeof option.id === 'string' && typeof option.label === 'string') : [] } });
        } else if (frame.type === 'withdrawn' && state.prompt?.id === frame.promptId) update({ prompt: undefined });
        else if (frame.type === 'completed') {
          completed = true;
          invalidateRefresh();
          update({ prompt: undefined, notice: undefined,
            ...(frame.status ? { status: statusView(frame.status) } : {}),
            message: frame.outcome === 'authorized' ? (frame.routeError ? 'savedNotEnabled' : 'signedIn') : frame.outcome === 'cancelled' ? 'cancelled' : undefined,
            error: frame.routeError || frame.error || (frame.outcome === 'failed' ? 'LOGIN_FAILED' : undefined) });
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) { buffer += decoder.decode(); break; }
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 131072) throw new Error('REQUEST_FAILED');
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line));
        }
      }
      if (buffer.trim()) handle(JSON.parse(buffer));
      if (!completed && !attempt.abort.signal.aborted) throw new Error('STREAM_INTERRUPTED');
    } catch (error) {
      if (active === attempt && !attempt.abort.signal.aborted) update({ error: errorCode(error), message: undefined });
    } finally {
      if (!completed) attempt.abort.abort();
      try { reader?.releaseLock(); } catch {}
      if (active === attempt) {
        active = undefined;
        update({ busy: false, signingIn: false, prompt: undefined, notice: undefined });
        if (!disposed && listeners.size) await refresh();
      }
    }
  }
  function cancel() {
    const attempt = active;
    if (!attempt) return;
    attempt.abort.abort();
    update({ prompt: undefined, notice: undefined, message: 'cancelled', error: undefined });
    if (attempt.id) void rpc('cancel', { attemptId: attempt.id }).catch(() => {});
  }
  async function reply(value) {
    const attempt = active;
    const prompt = state.prompt;
    if (!attempt?.id || !prompt) return;
    try {
      await rpc('reply', { attemptId: attempt.id, promptId: prompt.id, value }, attempt.abort.signal);
      if (active === attempt && state.prompt?.id === prompt.id) update({ prompt: undefined, error: undefined });
    } catch (error) {
      if (!attempt.abort.signal.aborted && active === attempt && state.prompt?.id === prompt.id) update({ error: errorCode(error) });
    }
  }
  async function mutate(action, body = {}) {
    if (active || state.busy || state.status?.inFlight || disposed) return;
    invalidateRefresh();
    update({ busy: true, error: undefined, message: undefined });
    try {
      const result = await rpc(action, body);
      invalidateRefresh();
      update({ status: statusView(result.status), message: action === 'logout' ? 'signedOut' : action === 'fast' ? (result.status.fastMode ? 'fastOn' : 'fastOff') : 'enabled' });
    } catch (error) { update({ error: errorCode(error) }); }
    finally { update({ busy: false }); if (!disposed && listeners.size) await refresh(); }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        queueMicrotask(() => { if (!disposed && !listeners.size) cancel(); });
      };
    },
    refresh, start, cancel, reply,
    logout: () => mutate('logout'), enable: () => mutate('enable'), setFast: enabled => mutate('fast', { enabled }),
    dispose() { disposed = true; active?.abort.abort(); refreshAbort?.abort(); listeners.clear(); },
  };
}

function createClientPlugin(require) {
  const React = require('react');
  const { Button, Modal, writeClipboard } = require('@deepseek-ai/dsh-client-ui-primitives');
  const h = React.createElement;
  const NS = 'settings.openai-oauth';
  const en = {
    nav: 'OpenAI OAuth', title: 'ChatGPT account (Codex)',
    browser: 'Sign in with ChatGPT', browserAgain: 'Sign in again with ChatGPT', signingIn: 'Signing in…', device: 'Use device code',
    loginStatus: 'Login status',
    loginStates: { checking: 'Checking…', signedOut: 'Not signed in', signingIn: 'Signing in…', signedIn: 'Signed in', unknown: 'Unknown' },
    unavailable: 'The native OpenAI Codex authorization flow is unavailable. Check that the pi-ai plugin is enabled.',
    readOnly: 'The credential store is read-only; sign-in and sign-out are unavailable.',
    open: 'Open OpenAI authorization page', copyLink: 'Copy authorization link', copyCode: 'Copy device code', copied: 'Copied', copyFailed: 'Copy failed; use the displayed link or code.',
    code: 'Device code', manual: 'If the browser callback does not arrive, paste the authorization code or complete redirect URL below.',
    input: 'Authorization code or redirect URL', submit: 'Submit', choose: 'Choose sign-in method',
    cancel: 'Cancel sign-in', refresh: 'Refresh status', logout: 'Sign out', logoutTitle: 'Sign out of ChatGPT?',
    logoutDescription: 'Delete only the local ChatGPT authorization. Model configuration, other credentials and the default model are preserved. This does not revoke access at OpenAI. Running Codex requests may be affected.',
    close: 'Cancel', enable: 'Enable Codex models',
    fastTitle: 'Fast mode', fastOff: 'Off',
    fastOn: 'On', fastEnable: 'Turn on Fast', fastDisable: 'Turn off Fast',
    fastWarning: 'Fast may respond faster but uses 2.5× the Standard subscription allowance for supported GPT-6 models. Availability depends on your ChatGPT account and OpenAI rollout. Existing requests keep their original setting.',
    fastUnavailable: 'Fast is unavailable with this Harness adapter. No requests will be marked Fast.',
    fastOverride: 'Remove the existing API credential override before using subscription Fast mode; no credential was changed.',
    savedNotEnabled: 'Authorization was saved, but the model route could not be enabled. Fix the configuration issue, then click “Enable Codex models”; do not sign in again.',
    override: 'This existing Codex profile has an API credential override. It takes priority over OAuth; review it in Models if you intend to use the ChatGPT account. Nothing was removed automatically.',
    external: 'Another sign-in attempt is running. Finish or cancel it in the page that started it.',
    errors: {
      AUTH_REQUIRED: 'The Harness browser session is not authorized. Refresh this existing application window.',
      BAD_REQUEST: 'The request or authorization input is invalid.', NO_FLOW: 'Native OpenAI authorization is unavailable.',
      ALREADY_IN_FLIGHT: 'Another sign-in is already running.', NOT_LOGGED_IN: 'Sign in before enabling Codex models.',
      READ_ONLY: 'Model settings are read-only.', NO_NAMESPACE: 'The pi-ai settings namespace is unavailable.',
      CONFLICT: 'Model settings changed in another window. Refresh status and retry enabling the route.',
      SETTINGS_FAILED: 'Unable to enable the model route; the saved authorization is preserved.',
      FAST_UNAVAILABLE: 'Fast mode is unavailable for this Codex route. Standard mode remains active.',
      PROMPT_GONE: 'This authorization prompt has expired.', UNSUPPORTED_PROMPT: 'The native authorization flow requested an unsupported prompt.',
      TIMEOUT: 'Sign-in timed out. Try again.', LOGIN_FAILED: 'OpenAI authorization failed. Retry or use device code; check your account access and network.',
      STORAGE_FAILED: 'Unable to change the local credential record.', DISPOSED: 'The plugin was unloaded. Refresh the application.',
      STREAM_INTERRUPTED: 'The authorization connection was interrupted. Refresh status before trying again.', REQUEST_FAILED: 'The request failed. Check the application connection and try again.',
    },
  };
  const zh = {
    nav: 'OpenAI OAuth', title: 'ChatGPT 账号（Codex）',
    browser: '登录 ChatGPT', browserAgain: '重新登录 ChatGPT', signingIn: '正在登录…', device: '使用设备码登录',
    loginStatus: '登录状态',
    loginStates: { checking: '检查中…', signedOut: '未登录', signingIn: '登录中…', signedIn: '已登录', unknown: '状态未知' },
    unavailable: '原生 OpenAI Codex 授权流程不可用，请检查 pi-ai 插件是否启用。',
    readOnly: '凭据存储为只读，暂时无法登录或退出。',
    open: '打开 OpenAI 授权页面', copyLink: '复制授权链接', copyCode: '复制设备码', copied: '已复制', copyFailed: '复制失败，请使用显示的链接或设备码。',
    code: '设备码', manual: '如果浏览器回调没有到达，可在下方粘贴授权码或完整的跳转网址。',
    input: '授权码或跳转网址', submit: '提交', choose: '选择登录方式',
    cancel: '取消登录', refresh: '刷新状态', logout: '退出登录', logoutTitle: '退出 ChatGPT 登录？',
    logoutDescription: '仅删除本地 ChatGPT 授权。模型配置、其他凭据和默认模型均保留；不会在 OpenAI 撤销授权。正在执行的 Codex 请求可能受影响。',
    close: '取消', enable: '启用 Codex 模型',
    fastTitle: 'Fast 模式', fastOff: '已关闭',
    fastOn: '已开启', fastEnable: '开启 Fast', fastDisable: '关闭 Fast',
    fastWarning: '对受支持的 GPT-6 模型，Fast 可能提升响应速度，但会按标准模式的 2.5 倍消耗订阅额度。是否可用取决于 ChatGPT 账号和 OpenAI 开放情况；已开始的请求不受切换影响。',
    fastUnavailable: '当前 Harness 适配器无法使用 Fast；请求不会被标记为 Fast。',
    fastOverride: '使用订阅 Fast 前请先检查现有的 API 凭据覆盖项；插件不会自动改动凭据。',
    savedNotEnabled: '授权已保存，但模型路由未能启用。请解决配置问题后点击“启用 Codex 模型”，无需再次登录。',
    override: '现有 Codex 配置包含 API 凭据覆盖项，它会优先于 OAuth。若要使用 ChatGPT 账号，请在模型设置中检查该项；插件不会自动删除它。',
    external: '另一个页面正在登录，请在发起登录的页面完成或取消。',
    errors: {
      AUTH_REQUIRED: 'Harness 浏览器会话尚未授权，请刷新当前应用窗口。', BAD_REQUEST: '请求或授权输入无效。',
      NO_FLOW: '原生 OpenAI 授权流程不可用。', ALREADY_IN_FLIGHT: '已有其他登录正在进行。', NOT_LOGGED_IN: '请先登录，再启用 Codex 模型。',
      READ_ONLY: '模型设置为只读。', NO_NAMESPACE: 'pi-ai 设置项不可用。', CONFLICT: '其他窗口修改了模型配置，请刷新状态后重试启用。',
      SETTINGS_FAILED: '无法启用模型路由，已保存的授权不会丢失。', FAST_UNAVAILABLE: '此 Codex 路由无法使用 Fast，仍保持标准模式。', PROMPT_GONE: '此授权输入已过期。',
      UNSUPPORTED_PROMPT: '原生授权流程请求了不支持的输入。', TIMEOUT: '登录超时，请重试。',
      LOGIN_FAILED: 'OpenAI 授权失败。请重试或使用设备码登录，并检查网络及账号权益。',
      STORAGE_FAILED: '无法更改本地凭据记录。', DISPOSED: '插件已卸载，请刷新应用。',
      STREAM_INTERRUPTED: '授权连接中断，请先刷新状态，再决定是否重新登录。', REQUEST_FAILED: '请求失败，请检查应用连接后重试。',
    },
  };
  const styles = {
    card: { maxWidth: 720, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-settings-card-fill)', border: '1px solid var(--dsw-alias-settings-card-stroke)', borderRadius: 'var(--dsw-radius-xl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' },
    row: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    badge: { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--dsw-alias-settings-card-stroke)', fontSize: 12, fontWeight: 500, lineHeight: '18px' },
    dot: { width: 6, height: 6, flexShrink: 0, borderRadius: '50%' },
    body: { margin: 0, fontSize: 13, lineHeight: '21px', color: 'var(--dsw-alias-label-secondary)' },
    input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--dsw-alias-settings-card-stroke)', background: 'var(--dsw-alias-settings-card-fill)', color: 'var(--dsw-alias-label-primary)', font: 'inherit' },
  };
  function Prompt({ controller, prompt, t }) {
    const [value, setValue] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const mounted = React.useRef(false);
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const submit = async event => {
      event.preventDefault();
      if (!value.trim() || sending) return;
      setSending(true);
      try { await controller.reply(value); } finally { if (mounted.current) setSending(false); }
    };
    return h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      h('label', { htmlFor: prompt.id, style: styles.body }, t(prompt.kind === 'select' ? 'choose' : 'manual')),
      prompt.kind === 'select'
        ? h('select', { id: prompt.id, value, onChange: event => setValue(event.target.value), style: styles.input },
          h('option', { value: '' }, t('choose')), ...prompt.options.map(option => h('option', { value: option.id, key: option.id }, option.label)))
        : h('input', { id: prompt.id, value, onChange: event => setValue(event.target.value), style: styles.input, placeholder: t('input'), 'aria-label': t('input'), autoComplete: 'off', spellCheck: false }),
      h(Button, { type: 'submit', variant: 'outline', disabled: sending || !value.trim(), style: { alignSelf: 'flex-start' } }, t('submit')));
  }
  function Card({ controller, t }) {
    const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const [confirmLogout, setConfirmLogout] = React.useState(false);
    const [copyMessage, setCopyMessage] = React.useState('');
    const mounted = React.useRef(false);
    React.useEffect(() => {
      mounted.current = true;
      void controller.refresh();
      const focused = () => { void controller.refresh(); };
      globalThis.addEventListener('focus', focused);
      return () => { mounted.current = false; globalThis.removeEventListener('focus', focused); };
    }, [controller]);
    const copyGeneration = React.useRef(0);
    React.useEffect(() => { ++copyGeneration.current; setCopyMessage(''); }, [state.notice?.url, state.notice?.code]);
    const copy = async value => {
      const generation = copyGeneration.current;
      let success = false;
      try { success = await writeClipboard(value); } catch {}
      if (mounted.current && generation === copyGeneration.current) setCopyMessage(t(success ? 'copied' : 'copyFailed'));
    };
    const status = state.status;
    const locked = state.loading || state.busy || status?.inFlight;
    const canLogin = status?.available && status.credentialWritable;
    const url = trustedAuthorizationUrl(state.notice?.url);
    const loginState = state.signingIn || status?.inFlight ? 'signingIn'
      : state.loading ? 'checking' : !status ? 'unknown' : status.loggedIn ? 'signedIn' : 'signedOut';
    const loginColor = loginState === 'signedIn' ? 'var(--dsw-alias-state-success-primary, #22c55e)'
      : loginState === 'signedOut' ? 'var(--dsw-alias-label-tertiary, #8a8a8a)' : 'var(--dsw-alias-state-warning-primary, #f59e0b)';
    return h('section', { style: styles.card, 'data-openai-oauth': 'card', 'aria-label': t('title') },
      h('div', { style: { ...styles.row, justifyContent: 'space-between' } },
        h('h3', { style: { margin: 0, fontSize: 15 } }, t('title')),
        h('span', { style: styles.badge, role: 'status', 'aria-live': 'polite', 'aria-atomic': true,
          'data-openai-oauth': 'login-status', 'data-state': loginState },
          h('span', { 'aria-hidden': true, style: { ...styles.dot, backgroundColor: loginColor } }),
          t('loginStatus') + ' · ' + t('loginStates.' + loginState))),
      status && !status.available && h('p', { style: styles.body }, t('unavailable')),
      status && !status.credentialWritable && h('p', { style: styles.body }, t('readOnly')),
      status?.apiKeyOverride && h('p', { style: styles.body }, t('override')),
      status?.inFlight && !state.busy && h('p', { style: styles.body }, t('external')),
      h('div', { style: styles.row },
        h(Button, { variant: status?.loggedIn ? 'outline' : 'primary', disabled: !!locked || !canLogin, 'aria-busy': state.signingIn,
          onClick: () => { void controller.start('browser'); } }, t(state.signingIn ? 'signingIn' : status?.loggedIn ? 'browserAgain' : 'browser')),
        h(Button, { variant: 'outline', disabled: !!locked || !canLogin, onClick: () => { void controller.start('device_code'); } }, t('device')),
        status?.loggedIn && h(Button, { variant: 'ghost', disabled: !!locked || !status.credentialWritable, onClick: () => setConfirmLogout(true) }, t('logout')),
        status?.loggedIn && !status.routeConfigured && h(Button, { variant: 'outline', disabled: !!locked || !status.settingsWritable || !status.namespacePresent, onClick: () => { void controller.enable(); } }, t('enable')),
        h(Button, { variant: 'ghost', disabled: state.busy, onClick: () => { void controller.refresh(); } }, t('refresh'))),
      status?.loggedIn && status.routeConfigured && h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid var(--dsw-alias-settings-card-stroke)' } },
        h('div', { style: styles.row },
          h('strong', { style: { fontSize: 14 } }, t('fastTitle')),
          h('span', { style: styles.badge, role: 'status', 'aria-live': 'polite', 'aria-atomic': true,
            'aria-label': t('fastTitle'), 'data-openai-oauth': 'fast-status' }, t(status.fastMode ? 'fastOn' : 'fastOff'))),
        status.apiKeyOverride && h('p', { style: styles.body }, t('fastOverride')),
        !status.fastAvailable && h('p', { style: styles.body }, t('fastUnavailable')),
        h(Button, { variant: status.fastMode ? 'ghost' : 'outline',
          disabled: !!locked || !status.fastAvailable || status.apiKeyOverride,
          'aria-pressed': status.fastMode, title: t('fastWarning'), 'aria-description': t('fastWarning'),
          style: { alignSelf: 'flex-start' },
          onClick: () => { void controller.setFast(!status.fastMode); } }, t(status.fastMode ? 'fastDisable' : 'fastEnable'))),
      state.signingIn && h('div', { style: styles.row }, h(Button, { variant: 'outline', onClick: () => controller.cancel() }, t('cancel'))),
      url && h('div', { style: styles.row },
        h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--dsw-alias-label-primary)', wordBreak: 'break-word' } }, t('open')),
        h(Button, { variant: 'ghost', onClick: () => { void copy(url); } }, t('copyLink'))),
      state.notice?.code && h('div', { style: styles.row }, h('span', null, t('code') + ': '), h('code', { style: { fontSize: 20, userSelect: 'all' } }, state.notice.code),
        h(Button, { variant: 'ghost', onClick: () => { void copy(state.notice.code); } }, t('copyCode'))),
      copyMessage && h('p', { role: 'status', style: styles.body }, copyMessage),
      state.prompt && h(Prompt, { key: state.prompt.id, controller, prompt: state.prompt, t }),
      state.message === 'savedNotEnabled' && h('p', { role: 'status', 'aria-live': 'polite', style: styles.body }, t('savedNotEnabled')),
      state.error && h('p', { role: 'alert', style: { ...styles.body, color: 'var(--dsw-alias-state-error-primary)' } }, t('errors.' + (Object.hasOwn(en.errors, state.error) ? state.error : 'REQUEST_FAILED'))),
      h(Modal, { open: confirmLogout, onClose: () => setConfirmLogout(false), title: t('logoutTitle'), closeLabel: t('close'), description: t('logoutDescription'),
        footer: h('div', { style: styles.row }, h(Button, { variant: 'ghost', onClick: () => setConfirmLogout(false) }, t('close')),
          h(Button, { variant: 'primary', 'data-modal-autofocus': '', onClick: () => { setConfirmLogout(false); void controller.logout(); } }, t('logout'))) }));
  }
  return {
    name: 'openai-oauth-ui', inject: ['slots', 'locale', 'remote'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'openai-oauth: locale');
      const t = ctx.locale.bind(NS);
      const controller = createController();
      ctx.effect(() => () => controller.dispose(), 'openai-oauth: controller');
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'openai-oauth', order: 11,
        label: () => t('nav'), locale: NS, inject: () => ({ controller, t }),
      }, Card));
      ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
        name: 'settings.models.footer', id: 'openai-oauth', order: 10,
        locale: NS, inject: () => ({ controller, t }),
      }, Card));
      const refreshIfLoaded = () => { if (controller.getSnapshot().status) void controller.refresh(); };
      ctx.on('connection/reset', refreshIfLoaded);
      ctx.effect(() => {
        const disposers = [
          ctx.remote.$on('credentials/record-updated', refreshIfLoaded),
          ctx.remote.$on('settings/document-updated', refreshIfLoaded),
          ctx.remote.$on('llm/adapters-updated', refreshIfLoaded),
        ];
        return () => { for (const dispose of disposers) dispose(); };
      }, 'openai-oauth: native status invalidations');
    },
  };
}

    return createClientPlugin(require);
  }
});
