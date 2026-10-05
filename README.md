# ChatGPT OAuth + optional Codex Fast for DeepSeek Harness

[简体中文](README.zh-CN.md) · [Publish on GitHub](PUBLISHING.md) · [License](LICENSE) · [Attribution](NOTICE.md)

**Community compatibility plugin — not affiliated with OpenAI, DeepSeek, DeepSeek Harness, or the upstream author.** Tested with **Windows / DeepSeek Harness Desktop 0.2.0-rc.2**. Other versions and operating systems are **not verified**. This plugin adds a ChatGPT sign-in card to Settings and Models, uses Harness's **native** OAuth and credential storage, and optionally adds a per-user Fast switch for new `openai-codex` calls. It does **not** replace the model adapter, change the default model, accept passwords, create a new unauthenticated server, or ship credentials.

## Quick start

1. Download/extract this repository to a permanent directory you can write. **Do not place credentials or your profile patch inside it.** Install [Node.js 22.19+](https://nodejs.org/) if `node --version` does not report a compatible version. No `npm install` is required: `lib/` contains checked-in build output.
2. **Fully quit Harness Desktop.** In a terminal in this repository, run:
   ```sh
   node scripts/setup.mjs install --dry-run
   node scripts/setup.mjs install
   ```
   The installer edits only its own marked entry in the existing `~/.dsh/profiles/desktop/cordis.patch.yml`, automatically makes a timestamped backup **next to that file**, and writes a `file:///…/lib/index.js` URL calculated from your actual installation path. It refuses incomplete markers, conflicting plugin IDs, missing build output, or a missing patch file. Use `--patch "PATH/TO/cordis.patch.yml"` for a nonstandard profile. If the patch file does not exist, configure/launch a DSH desktop profile first; the script does not invent one.
3. Restart the **existing** Harness Desktop app and refresh its page. Open **Settings → OpenAI OAuth** (also in the Models page footer). Sign in with ChatGPT via the native browser flow or device code. **Each computer must be authorized separately**; do not copy OAuth credentials. If asked, click **Enable Codex models**. Choose an available `openai-codex` model in the regular model picker.
4. Fast is **off by default**. When signed in, with a configured `openai-codex` route and no API-key override, read the allowance warning and click **Turn on Fast**. Confirm the card reports Fast on. Click **Turn off Fast** to restore Standard. The switch affects only **new** native Codex calls and is not a reasoning-effort or model-selection control.

**Fast warning:** OpenAI says Fast uses **2.5× the Standard subscription allowance** for supported GPT-6 models ([OpenAI speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed.md)). Availability depends on your account/rollout. This project has not independently tested real request speed, eligibility, or billing.

### Compatibility limitation

The OAuth UI relies on Harness 0.2 native `authorization`, `credentials`, `settings`, `connection` and pi-ai services. Fast additionally wraps an **internal**, undocumented `PiAiAdapter.current().models.streamSimple` boundary to send pi-ai's `serviceTier: 'fast'` option only for `openai-codex` (pi-ai maps this to `service_tier: 'fast'`). The structural check is **not a strict version check** and cannot prove wire compatibility after an upgrade. If the adapter shape differs, Fast is disabled; if the shape stays the same but its meaning changes, further testing is needed. **Re-test Fast after every DSH update; never assume this works on other versions.** Login may still work when Fast is unavailable. Existing model/default-model configuration is never overwritten.

## Build, test, upgrade, remove

```sh
npm run check                         # Node only, no downloaded dependencies
node scripts/setup.mjs install        # from the new clone: updates only its managed block
node scripts/setup.mjs uninstall      # removes only its managed block
```

Run setup with Harness closed, then restart the app. The script never deletes stored ChatGPT credentials, the Codex model route, or the user-owned Fast preference. To sign out first, use the plugin's logout button. If you installed an older local adaptation with a **different** `openai-oauth-ui` block, the installer intentionally refuses to overwrite it: back up the patch, remove **only that old block** manually, then run install. Do **not** restore an old complete profile backup over later user changes.

Run `npm run build` after changing `src/`; commit the generated `lib/` together with source. Builds of client plugins do not automatically update a running Desktop app: restart Harness after updating Host code. Advanced users may temporarily add `config: { verifyOnLoad: true }` under the managed plugin entry to write a sanitized connectivity report in `~/.dsh/openai-oauth/`, **not** in the Git clone; this performs no actual OpenAI request. A later setup run regenerates its managed block and removes that manual option.

## Privacy and security

- Native Harness stores and refreshes OAuth grants; the browser UI receives **only Boolean status**, never token payloads. Network endpoints use Harness's authenticated Connection transport and Origin checks.
- The Fast preference is only `{ "version": 1, "enabled": boolean }` in `~/.dsh/openai-oauth/fast-mode.json`; no authorization secret is written there. This preference is shared by this user's Harness profiles. Don't copy it to another computer unless you explicitly want that setting; each new computer starts Standard.
- Never commit local `fast-mode.json`, `runtime-verification-*.json`, `.dsh` profiles/backups, access tokens, cookies, or environment files. The `.gitignore` is a safeguard, **not** a substitute for reviewing `git status` and `git diff --cached` before publishing.
- The MIT license is preserved with [upstream attribution](NOTICE.md). No DSH executable or upstream `node_modules` is copied into this repository.
