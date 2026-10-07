# Publish and distribute this plugin

Distribute this plugin through its GitHub repository or a local directory / `.tgz` package. **No npm publication is required.** This document is a release checklist, not a claim about the repository's current commit/push state or completed tests. Do not package the installed Desktop application or use a real user profile as a release workspace.

## 1. Review source, attribution, and bundle metadata

- Review **every staged file** with `git status --short`, `git diff --cached --stat`, `git diff --cached --check`, and `git diff --cached`, including generated bundles. Search for credentials, private paths, OAuth grants, cookies, environment files, local reports, and profile backups; [.gitignore](<.gitignore>) is not a security review.
- Preserve the [MIT license](<LICENSE>) and [upstream attribution](<NOTICE.md>). This remains a community compatibility adaptation, not an official OpenAI, DeepSeek, DSH, or upstream release.
- Check [package.json](<package.json>): plugin version `0.2.1`, `dsh.bundle.patch: "./cordis.bundle.json"`, the host entry, and the `./client` export. The plugin version is not the DSH version. Ensure [cordis.bundle.json](<cordis.bundle.json>) is included and loads **only `dsh-openai-oauth`**, not a main application, copied profile, private path, or another service. Keep the manual [setup script](<scripts/setup.mjs>) as a fallback.
- Include the current `lib/` build output. A GitHub URL pointing to an older commit without this metadata and bundle is **not** a valid source for the recommended plugin-page installation.

## 2. Check tests and the distributable package

With Node.js 22.19+, run:

```sh
npm run check
npm pack --dry-run
```

Review the **complete dry-run file list**, not just the command's exit status. Confirm that it includes [package.json](<package.json>), [cordis.bundle.json](<cordis.bundle.json>), the required `lib/` output (host, client, and helpers), the fallback setup script, documentation, [LICENSE](<LICENSE>), and [NOTICE.md](<NOTICE.md>). Confirm it excludes user state, `.dsh` profiles/backups, `fast-mode.json`, `runtime-verification-*.json`, tokens, cookies, environment files, Desktop executables/installers, and copied upstream `node_modules`.

If distributing a `.tgz`, create it with `npm pack` from the reviewed checkout and inspect the **actual archive contents** against the dry-run list before sharing it. Do not assume the npm file allowlist also filters GitHub source archives: review tracked files for GitHub distribution separately. Do not put generated release archives or user state into the source repository. `npm pack` creates a local archive; it does not publish to the npm registry.

The test suite uses mocks and isolated fixtures; it does **not** establish live ChatGPT authorization, Fast eligibility, speed, or billing. A passing build, unit test, or pack check is not evidence that the complete plugin-page lifecycle works in Desktop. Before claiming that lifecycle is verified, use a **disposable, isolated profile** to check installation, enable/restart, single loading of the plugin, removal/reinstallation, and migration of marked and unmarked legacy entries. Keep the real Desktop profile and credentials untouched; do not perform billable requests as part of a package check. Report which checks actually ran and which remain unverified, and confirm the relevant CI Windows/Linux jobs before labeling a release tested. Keep these checks separate from any end-to-end Desktop GUI or provider test.

Compatibility remains limited to **Windows / DeepSeek Harness Desktop 0.2.0-rc.2** as the existing test target. Other DSH versions and operating systems need their own verification, especially the undocumented Fast adapter hook. Fast remains experimental; see [security guidance](<SECURITY.md>).

## 3. Publish only an approved, bundle-containing revision

Review the intended Git remote, author identity, staged content, and final diff before any commit or push. Git author identity is public; never place credentials or PATs in remote URLs. Commit, push, or create a release only with explicit maintainer approval. For this repository, the installation URL is **https://github.com/HuYongJi/dsh-openai-oauth**; make sure the revision resolved by that URL includes the new bundle before advertising it for plugin-page installation. If maintaining a fork, use its actual reviewed URL instead.

A GitHub Release may attach the reviewed `.tgz` from a tested commit. Include only plugin files, never the main program, user state, or profile backups. Publish release notes that distinguish verified checks from pending validation and retain the MIT/upstream notices and DSH 0.2.0-rc.2 compatibility warning.

## 4. Include installation, migration, and upgrade instructions

- **Recommended:** in the original Desktop, open **Settings → Plugins → Add plugin** and enter **https://github.com/HuYongJi/dsh-openai-oauth** (a revision containing the bundle), an **absolute local directory**, or an **absolute path to a `.tgz`**. Follow the UI to enable/restart the **original Desktop**; do not start a replacement server. No npm publication is needed.
- **Manual fallback only:** the setup script and plugin-page installation must **never be used together**. For migration, fully quit Desktop first, run `node scripts/setup.mjs uninstall --dry-run`, then `node scripts/setup.mjs uninstall`. For non-default profiles, explicitly pass the same `--patch "PATH/TO/cordis.patch.yml"` to both. The script removes only its recognized marked block. Back up and manually remove only a verified unmarked legacy entry; never overwrite unrelated settings with an old whole-profile backup. Reopen Desktop and install through the plugin page afterward.
- **State is preserved:** uninstall/migration does not erase ChatGPT credentials, model configuration, or the Fast preference. **Users who enabled Fast before may still have it enabled afterward**; have them check the card. Uninstalling is not signing out.
- **Upgrade for now:** uninstall through **Settings → Plugins**, then install the updated source/package there again and follow enable/restart prompts. **Do not promise automatic updates.** Manual fallback users must keep using the matching script removal/update path, not add a second plugin-page entry.

中文要点：推荐在 **设置 → 插件 → 添加插件** 输入上述 GitHub URL（必须是含 bundle 的新提交）、本地绝对目录或 `.tgz` 绝对路径，按界面启用/重启原 Desktop，无需 npm 发布。旧手动安装先完全退出 Desktop，预览并卸载标记块；非默认 profile 显式指定 `--patch`，未标记旧 entry 备份后定点处理，再重开插件页安装。两种方式不可并用；升级暂按插件页卸载后重装，不承诺自动更新。凭据、模型配置与 Fast 偏好保留，旧 Fast 开启者迁移后仍可能开启。发布前检查实际包内容，禁止打包用户状态或主程序，不把未完成的隔离验证写成通过。
