# Security policy

This is a community compatibility plugin, **not** an official authentication provider. Its reviewed deployment target is Windows / DeepSeek Harness Desktop 0.2.0-rc.2. Later versions require renewed compatibility and security testing, especially the internal Fast adapter hook.

If you find a security issue, use the GitHub repository's **private vulnerability reporting** feature (enable it in repository settings after publication). Please do not post real OAuth credentials, session cookies, private profile files, or token-bearing logs in public issues. Revoke affected grants through the relevant service if needed.

The plugin uses Harness's native credential storage and authenticated Connection APIs; it does not install a standalone HTTP server. The Fast preference contains only a Boolean, not a credential. Installing and upgrading modifies only the plugin-owned marked profile entry; review the generated patch and backup before running an untrusted fork.
