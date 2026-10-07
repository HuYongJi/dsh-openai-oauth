# ChatGPT OAuth + optional Codex Fast for DeepSeek Harness

**DeepSeek Harness 的 ChatGPT 登录与可选 Codex Fast 插件**

[中文介绍](#中文介绍) · [完整中文文档](<README.zh-CN.md>) · [English](#english) · [发布指南](<PUBLISHING.md>) · [MIT 许可证](<LICENSE>) · [来源与致谢](<NOTICE.md>)

## 中文介绍

这个插件为 DeepSeek Harness 的**设置页和模型页**增加 ChatGPT 登录入口，复用 Harness 原生 OAuth 授权和凭据管理，让你通过自己的 ChatGPT 账号使用账号支持的 `openai-codex` 模型。无需填写 API Key，也无需安装 Codex CLI；模型可用性与额度取决于账号权益。

### 主要功能

- **两种登录方式**：支持浏览器授权和设备码登录，授权过程由 Harness 原生服务处理。
- **清晰的登录状态**：标题右侧显示“检查中 / 未登录 / 登录中 / 已登录 / 状态未知”，并用状态圆点辅助区分。
- **按钮随状态变化**：未登录时显示“登录 ChatGPT”，登录中禁止重复点击，登录后变为描边样式的“重新登录 ChatGPT”；退出后恢复。
- **精简操作界面**：保留按钮、状态和必要的错误或授权提示，不再常驻展示大段说明；Fast 额度说明可在开关按钮的悬停提示中查看。
- **可选 Fast 模式**：无已有偏好时默认关闭，仅影响后续新发起的 Codex 请求，不修改默认模型，也不改变已开始的请求；迁移保留已有偏好。

### 快速安装（推荐插件页）

1. 在原有 Harness Desktop 打开 **设置 → 插件 → 添加插件**，输入 GitHub URL：**https://github.com/HuYongJi/dsh-openai-oauth**。该 URL 对应的提交**必须已包含新版 bundle**：[package.json](<package.json>) 中的 `dsh.bundle.patch: "./cordis.bundle.json"`、[cordis.bundle.json](<cordis.bundle.json>) 和 `lib/` 构建产物；旧提交不支持此安装方式。
2. 也可以在添加插件时输入**本地仓库的绝对目录**，或本地 **`.tgz` 包的绝对路径**，内容同样必须包含上述文件。仓库已带构建产物，无需 `npm install`，也**无需发布到 npm**。
3. 安装后按界面提示启用插件、重启**原有 Desktop** 并刷新页面；不要另起一个服务器。进入 **设置 → OpenAI OAuth** 登录，再从模型选择器选择账号支持的 Codex 模型。**每台电脑都需要单独授权，请勿复制登录凭据。**

**插件页安装与手动脚本只能二选一，不能同时加载。** 旧手动安装必须先完全退出 Desktop，按[迁移步骤](<README.zh-CN.md#从旧手动安装迁移>)移除旧加载项，再重开插件页安装。脚本仅作备用；升级暂按插件页**卸载后重新安装**，不承诺自动更新。卸载和迁移保留凭据、模型配置及 Fast 偏好，**原来已开启 Fast 的用户迁移后仍可能开启**。

**兼容性与额度提醒：**这是社区兼容插件，非 OpenAI、DeepSeek、DeepSeek Harness 或上游作者官方发布。现有兼容性测试范围仅为 **Windows / DeepSeek Harness Desktop 0.2.0-rc.2**，其他版本和系统未经验证；本次安装适配的验证范围见下方测试说明。“已登录”表示本地已保存 OAuth 授权，不保证所有模型或 Fast 权限可用。Fast 依赖内部兼容接口；据 [OpenAI Fast 文档](https://learn.chatgpt.com/docs/agent-configuration/speed.md)，受支持的 GPT-6 模型按标准模式 **2.5 倍消耗订阅额度**，本项目未独立验证实际速度或计费。不要将 Token、API Key 或个人配置提交到仓库。

---

## English

**Community compatibility plugin — not affiliated with OpenAI, DeepSeek, DeepSeek Harness, or the upstream author.** Existing compatibility testing is limited to **Windows / DeepSeek Harness Desktop 0.2.0-rc.2**. Other versions and operating systems are **not verified**. The installation checks and their limits are described below. This plugin adds a ChatGPT sign-in card to Settings and Models, uses Harness's **native** OAuth and credential storage, and optionally adds a per-user Fast switch for new `openai-codex` calls. It does **not** replace the model adapter, change the default model, accept passwords, create a new unauthenticated server, or ship credentials.

### Quick start — plugin page recommended

1. In the **existing Harness Desktop app**, open **Settings → Plugins → Add plugin** and enter **https://github.com/HuYongJi/dsh-openai-oauth**. The selected repository revision **must include the new bundle**: [package.json](<package.json>) with `dsh.bundle.patch: "./cordis.bundle.json"`, [cordis.bundle.json](<cordis.bundle.json>), and the built `lib/` files. An older commit without the bundle is not a plugin-page install source.
2. Alternatively, enter an **absolute local repository directory** or an **absolute path to a local `.tgz` package** containing those files. The static bundle loads only `dsh-openai-oauth`; the package retains its client export. **No npm publication is required**, and checked-in build output means no `npm install` is needed.
3. Follow the UI prompts to enable the plugin and restart the **original Desktop app**, then refresh its page; do not start a second server. Open **Settings → OpenAI OAuth** (also in the Models page footer). Sign in with ChatGPT via the native browser flow or device code. **Each computer must be authorized separately**; do not copy OAuth credentials. If asked, click **Enable Codex models**. Choose an available `openai-codex` model in the regular model picker.
4. Fast is **off for users without a saved preference**. When signed in, with a configured `openai-codex` route and no API-key override, read the allowance warning (also available by hovering over the Fast button) before clicking **Turn on Fast**. Click **Turn off Fast** to restore Standard. The switch affects only **new** native Codex calls and is not a reasoning-effort or model-selection control. **A previously enabled Fast preference is preserved and may still be on after migration or reinstallation.**

**Use either the plugin page or the manual script, never both.** Remove any old manual entry before installing through the plugin page; see [migration](#migrate-an-old-manual-install). Manual installation is a fallback only.

**Fast warning:** OpenAI says Fast uses **2.5× the Standard subscription allowance** for supported GPT-6 models ([OpenAI speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed.md)). Availability depends on your account/rollout. This project has not independently tested real request speed, eligibility, or billing.

### Sign-in status and controls

The card shows a **Login status** badge: **Checking…**, **Not signed in**, **Signing in…**, **Signed in**, or **Unknown**. A failed initial status check is shown as Unknown, not as signed out. Signed in means Harness has a saved local OAuth authorization; it does not prove that every request, model, or Fast entitlement will be accepted.

The primary button changes from **Sign in with ChatGPT** to a disabled **Signing in…** during authorization, then to an outline **Sign in again with ChatGPT** once signed in. Signing out restores the initial button. The compact card keeps essential authorization controls and error messages; Fast has a short On/Off indicator, with allowance details in the button's hover text.

### Compatibility limitation

The OAuth UI relies on Harness 0.2 native `authorization`, `credentials`, `settings`, `connection` and pi-ai services. Fast additionally wraps an **internal**, undocumented `PiAiAdapter.current().models.streamSimple` boundary to send pi-ai's `serviceTier: 'fast'` option only for `openai-codex` (pi-ai maps this to `service_tier: 'fast'`). The structural check is **not a strict version check** and cannot prove wire compatibility after an upgrade. If the adapter shape differs, Fast is disabled; if the shape stays the same but its meaning changes, further testing is needed. **Re-test Fast after every DSH update; never assume this works on other versions.** Login may still work when Fast is unavailable. Existing model/default-model configuration is never overwritten.

### Migrate an old manual install

1. **Fully quit Harness Desktop**, including any tray/background instance, before changing the profile. From this repository, preview and remove the script-managed entry:
   ```sh
   node scripts/setup.mjs uninstall --dry-run
   node scripts/setup.mjs uninstall
   ```
   Both commands default to `~/.dsh/profiles/desktop/cordis.patch.yml`. For a non-default profile, **explicitly pass the same `--patch` path to both commands**:
   ```sh
   node scripts/setup.mjs uninstall --patch "PATH/TO/cordis.patch.yml" --dry-run
   node scripts/setup.mjs uninstall --patch "PATH/TO/cordis.patch.yml"
   ```
2. The script removes **only its recognized marked block**, backing up the patch alongside the original before a change. It does not remove unmarked legacy entries. If it reports an unmarked/conflicting `openai-oauth-ui` entry or damaged markers, stop: **back up the profile and manually remove only the verified old plugin entry**. Do not delete unrelated entries or restore a whole outdated profile over later changes.
3. Reopen the **original Desktop**, then install through **Settings → Plugins → Add plugin** as above. Do not run the script's `install` command as well.

Removal and migration preserve stored ChatGPT credentials, model configuration, and the user-owned Fast preference. **Fast may remain enabled for users who enabled it previously**; check the card before a new request. If you want to revoke the local login, use the plugin's logout control before removal; uninstalling is not signing out.

### Manual installation — fallback only

Use this only when not using the plugin-page installation. Download/extract the repository to a permanent writable directory, keep credentials and profile patches outside it, and use [Node.js 22.19+](https://nodejs.org/). With Desktop **fully closed**, run:

```sh
node scripts/setup.mjs install --dry-run
node scripts/setup.mjs install
```

The installer edits only its own marked entry in an **existing** desktop profile patch, makes a timestamped backup next to it, and writes a `file:///…/lib/index.js` URL calculated from the repository location. For non-default profiles, explicitly add `--patch "PATH/TO/cordis.patch.yml"` to both commands. It refuses incomplete markers, conflicting IDs, missing build output, or a missing patch file; it does not create a profile. Restart the original Desktop afterward. If switching back from a plugin-page installation, uninstall it there first; never load both entries.

### Upgrade, remove, build, test

- **Plugin-page installation:** for now, upgrade by **uninstalling in Settings → Plugins, then installing the updated GitHub revision, local directory, or `.tgz` there again**. Follow the UI's enable/restart prompts. **Automatic updates are not promised.** Use the same plugin page to remove this installation, not the manual script.
- **Manual fallback:** with Desktop closed, use `node scripts/setup.mjs install --dry-run` and `node scripts/setup.mjs install` from the updated clone to update only its managed block. Use `node scripts/setup.mjs uninstall --dry-run` and `node scripts/setup.mjs uninstall` to remove it. Explicitly include `--patch` for a non-default profile, then restart Desktop.
- Neither removal path is a credential, model-configuration, or Fast-preference reset. Existing Fast settings can survive reinstallation; inspect them instead of assuming Standard mode.

```sh
npm run check                         # Node only, no downloaded dependencies
npm pack --dry-run                    # inspect the distributable file list
```

For plugin **0.2.1**, all **52 regression tests** passed. The native DSH **0.2.0-rc.2 plugin manager** also accepted both an absolute local directory and a packed `.tgz` in disposable profiles: install disabled → enable → resolve Host/client and register one set of routes → disable → uninstall. Unrelated synthetic profile entries, credentials, and Fast preferences stayed unchanged. These checks used a mocked Connection, not the running Desktop GUI; remote GitHub download and live OAuth/Fast requests were **not** tested. GitHub installation requires publishing the bundle-containing revision first.

Run `npm run build` after changing `src/`; include the generated `lib/` with the source. A build alone does not update the running Desktop Host code; restart the app after updating it. See the [publishing checklist](<PUBLISHING.md>) for package review and separate isolated verification. Advanced manual-install users may temporarily add `config: { verifyOnLoad: true }` under the managed plugin entry to write a sanitized connectivity report in `~/.dsh/openai-oauth/`, **not** in the Git clone; this performs no actual OpenAI request. A later setup run regenerates its managed block and removes that manual option.

### Privacy and security

- Native Harness stores and refreshes OAuth grants; the browser UI receives **only Boolean status**, never token payloads. Network endpoints use Harness's authenticated Connection transport and Origin checks.
- The Fast preference is only `{ "version": 1, "enabled": boolean }` in `~/.dsh/openai-oauth/fast-mode.json`; no authorization secret is written there. This preference is shared by this user's Harness profiles. Don't copy it to another computer unless you explicitly want that setting; Standard is the default only when no enabled preference is already saved.
- Never commit or package local `fast-mode.json`, `runtime-verification-*.json`, `.dsh` profiles/backups, access tokens, cookies, or environment files. The [.gitignore](<.gitignore>) is a safeguard, **not** a substitute for reviewing `git status`, `git diff --cached`, and the distributable file list before publishing.
- The [MIT license](<LICENSE>) is preserved with [upstream attribution](<NOTICE.md>). No DSH executable or upstream `node_modules` is copied into this repository.
