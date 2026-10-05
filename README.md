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
- **可选 Fast 模式**：默认关闭，仅影响后续新发起的 Codex 请求，不修改默认模型，也不改变已开始的请求。

### 快速安装

1. 将本仓库下载或克隆到固定、可写的目录，准备 **Node.js 22.19.0 或更新版本**，然后**完全退出 Harness Desktop**。仓库已包含构建产物，无需 `npm install`。
2. 在仓库目录执行：
   ```sh
   node scripts/setup.mjs install --dry-run
   node scripts/setup.mjs install
   ```
3. 重启原有 Harness，刷新页面，进入 **设置 → OpenAI OAuth** 完成登录，再从模型选择器中选择账号支持的 Codex 模型。**每台电脑都需要单独授权，请勿复制登录凭据。**

安装器要求已有的 Desktop profile 配置，只更新插件自身的标记配置块，并在原配置旁创建备份。详细安装、升级、卸载与兼容性说明见[完整中文文档](<README.zh-CN.md>)。

**兼容性与额度提醒：**这是社区兼容插件，非 OpenAI、DeepSeek、DeepSeek Harness 或上游作者官方发布。目前仅在 **Windows / DeepSeek Harness Desktop 0.2.0-rc.2** 测试，其他版本和系统未经验证。“已登录”表示本地已保存 OAuth 授权，不保证所有模型或 Fast 权限可用。Fast 依赖内部兼容接口；据 [OpenAI Fast 文档](https://learn.chatgpt.com/docs/agent-configuration/speed.md)，受支持的 GPT-6 模型按标准模式 **2.5 倍消耗订阅额度**，本项目未独立验证实际速度或计费。不要将 Token、API Key 或个人配置提交到仓库。

---

## English

**Community compatibility plugin — not affiliated with OpenAI, DeepSeek, DeepSeek Harness, or the upstream author.** Tested with **Windows / DeepSeek Harness Desktop 0.2.0-rc.2**. Other versions and operating systems are **not verified**. This plugin adds a ChatGPT sign-in card to Settings and Models, uses Harness's **native** OAuth and credential storage, and optionally adds a per-user Fast switch for new `openai-codex` calls. It does **not** replace the model adapter, change the default model, accept passwords, create a new unauthenticated server, or ship credentials.

### Quick start

1. Download/extract this repository to a permanent directory you can write. **Do not place credentials or your profile patch inside it.** Install [Node.js 22.19+](https://nodejs.org/) if `node --version` does not report a compatible version. No `npm install` is required: `lib/` contains checked-in build output.
2. **Fully quit Harness Desktop.** In a terminal in this repository, run:
   ```sh
   node scripts/setup.mjs install --dry-run
   node scripts/setup.mjs install
   ```
   The installer edits only its own marked entry in the existing `~/.dsh/profiles/desktop/cordis.patch.yml`, automatically makes a timestamped backup **next to that file**, and writes a `file:///…/lib/index.js` URL calculated from your actual installation path. It refuses incomplete markers, conflicting plugin IDs, missing build output, or a missing patch file. Use `--patch "PATH/TO/cordis.patch.yml"` for a nonstandard profile. If the patch file does not exist, configure/launch a DSH desktop profile first; the script does not invent one.
3. Restart the **existing** Harness Desktop app and refresh its page. Open **Settings → OpenAI OAuth** (also in the Models page footer). Sign in with ChatGPT via the native browser flow or device code. **Each computer must be authorized separately**; do not copy OAuth credentials. If asked, click **Enable Codex models**. Choose an available `openai-codex` model in the regular model picker.
4. Fast is **off by default**. When signed in, with a configured `openai-codex` route and no API-key override, read the allowance warning (also available by hovering over the Fast button) and click **Turn on Fast**. Confirm the card reports Fast on. Click **Turn off Fast** to restore Standard. The switch affects only **new** native Codex calls and is not a reasoning-effort or model-selection control.

**Fast warning:** OpenAI says Fast uses **2.5× the Standard subscription allowance** for supported GPT-6 models ([OpenAI speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed.md)). Availability depends on your account/rollout. This project has not independently tested real request speed, eligibility, or billing.

### Sign-in status and controls

The card shows a **Login status** badge: **Checking…**, **Not signed in**, **Signing in…**, **Signed in**, or **Unknown**. A failed initial status check is shown as Unknown, not as signed out. Signed in means Harness has a saved local OAuth authorization; it does not prove that every request, model, or Fast entitlement will be accepted.

The primary button changes from **Sign in with ChatGPT** to a disabled **Signing in…** during authorization, then to an outline **Sign in again with ChatGPT** once signed in. Signing out restores the initial button. The compact card keeps essential authorization controls and error messages; Fast has a short On/Off indicator, with allowance details in the button's hover text.

### Compatibility limitation

The OAuth UI relies on Harness 0.2 native `authorization`, `credentials`, `settings`, `connection` and pi-ai services. Fast additionally wraps an **internal**, undocumented `PiAiAdapter.current().models.streamSimple` boundary to send pi-ai's `serviceTier: 'fast'` option only for `openai-codex` (pi-ai maps this to `service_tier: 'fast'`). The structural check is **not a strict version check** and cannot prove wire compatibility after an upgrade. If the adapter shape differs, Fast is disabled; if the shape stays the same but its meaning changes, further testing is needed. **Re-test Fast after every DSH update; never assume this works on other versions.** Login may still work when Fast is unavailable. Existing model/default-model configuration is never overwritten.

### Build, test, upgrade, remove

```sh
npm run check                         # Node only, no downloaded dependencies
node scripts/setup.mjs install        # from the new clone: updates only its managed block
node scripts/setup.mjs uninstall      # removes only its managed block
```

Run setup with Harness closed, then restart the app. The script never deletes stored ChatGPT credentials, the Codex model route, or the user-owned Fast preference. To sign out first, use the plugin's logout button. If you installed an older local adaptation with a **different** `openai-oauth-ui` block, the installer intentionally refuses to overwrite it: back up the patch, remove **only that old block** manually, then run install. Do **not** restore an old complete profile backup over later user changes.

Run `npm run build` after changing `src/`; commit the generated `lib/` together with source. Builds of client plugins do not automatically update a running Desktop app: restart Harness after updating Host code. Advanced users may temporarily add `config: { verifyOnLoad: true }` under the managed plugin entry to write a sanitized connectivity report in `~/.dsh/openai-oauth/`, **not** in the Git clone; this performs no actual OpenAI request. A later setup run regenerates its managed block and removes that manual option.

### Privacy and security

- Native Harness stores and refreshes OAuth grants; the browser UI receives **only Boolean status**, never token payloads. Network endpoints use Harness's authenticated Connection transport and Origin checks.
- The Fast preference is only `{ "version": 1, "enabled": boolean }` in `~/.dsh/openai-oauth/fast-mode.json`; no authorization secret is written there. This preference is shared by this user's Harness profiles. Don't copy it to another computer unless you explicitly want that setting; each new computer starts Standard.
- Never commit local `fast-mode.json`, `runtime-verification-*.json`, `.dsh` profiles/backups, access tokens, cookies, or environment files. The `.gitignore` is a safeguard, **not** a substitute for reviewing `git status` and `git diff --cached` before publishing.
- The MIT license is preserved with [upstream attribution](NOTICE.md). No DSH executable or upstream `node_modules` is copied into this repository.
