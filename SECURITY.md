# Security policy

This is a community compatibility plugin, **not** an official authentication provider. Its existing compatibility/security review target is **Windows / DeepSeek Harness Desktop 0.2.0-rc.2**; other systems and later versions need renewed testing, especially the internal Fast adapter hook. For plugin 0.2.1, native plugin-manager installation/enablement/removal was checked with local directories and tarballs in synthetic profiles, using a mocked Connection. This is not an end-to-end test of the running Desktop GUI, remote GitHub download, live OAuth, or Fast requests. Preserve the [MIT license](<LICENSE>) and [upstream attribution](<NOTICE.md>) when redistributing.

## Reporting

If you find a security issue, use the GitHub repository's **private vulnerability reporting** feature if enabled; maintainers should enable it before public distribution. Please do not post real OAuth credentials, session cookies, private profile files, or token-bearing logs in public issues. Revoke affected grants through the relevant service if needed.

## Installation and migration boundaries

- Install only reviewed plugin code. The recommended route is **Settings → Plugins → Add plugin** in the original Desktop, using **https://github.com/HuYongJi/dsh-openai-oauth**, an **absolute local directory**, or an **absolute path to a local `.tgz`**. The source must be a new revision containing [package.json](<package.json>) with `dsh.bundle.patch: "./cordis.bundle.json"`, [cordis.bundle.json](<cordis.bundle.json>), and the built `lib/` files. The static bundle loads only `dsh-openai-oauth`; it is not a replacement Desktop or profile. GitHub distribution does not require npm publication. Follow the UI to enable/restart the **original Desktop**, not a second server.
- The manual [setup script](<scripts/setup.mjs>) is a **fallback**, not an additional install step. **Never combine it with a plugin-page installation.** Only this script makes the marked-block/adjacent-backup guarantee; plugin-page installation is managed by DSH itself, not by the script.
- Before migrating a manual install, **fully quit Desktop**, then run `node scripts/setup.mjs uninstall --dry-run` followed by `node scripts/setup.mjs uninstall`. For a non-default profile, explicitly add the same `--patch "PATH/TO/cordis.patch.yml"` to both. The script removes **only its recognized marked block**. It does not safely identify/remove arbitrary unmarked legacy entries: back up the profile and manually remove only the verified old plugin entry. Do not delete unrelated settings or restore an obsolete whole-profile backup. Then reopen Desktop and install through the plugin page.
- For a plugin-page upgrade, **uninstall there and reinstall the updated source/package**, then follow enable/restart prompts. **Automatic updates are not promised.** Review updated code and bundle contents before installing; the package source and its maintainer must be trusted.

## Credentials, preferences, and publishing

The plugin uses Harness's native credential storage and authenticated Connection APIs with Origin checks; it does not install a standalone HTTP server. The browser UI receives Boolean authorization status, not token payloads. Each computer needs its own authorization; do not transfer credentials with the plugin.

The Fast preference contains only a Boolean, not a credential, and is shared by this user's Harness profiles. Uninstalling or migrating **preserves ChatGPT credentials, model configuration, and the Fast preference**; it is not a logout or reset. **Previously enabled Fast may still be enabled after migration or reinstallation.** Check the card before making a new request; use the plugin's logout control before removal if you want to sign out, and revoke grants through the provider where necessary.

Before distribution, follow the [publishing checklist](<PUBLISHING.md>), run `npm pack --dry-run`, and inspect the actual package if producing a `.tgz`. Never distribute OAuth grants, tokens, cookies, environment files, Fast preference files, verification reports, `.dsh` profiles/backups, the Desktop executable/installer, or copied upstream `node_modules`. Use disposable isolated fixtures for installation/migration checks, not the real user profile; release packages must contain only plugin material and its notices.
