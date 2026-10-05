# Publish this repository on GitHub

This folder is a **separate clean repository**, not the live Desktop plugin. No commit or push is performed automatically.

1. Review **every staged file**: `git status --short`, `git diff --cached --stat`, `git diff --cached --check`, and `git diff --cached` (especially generated bundles). Confirm no credentials, local reports, `.dsh` profile/backup, or private paths are present. Search the repository yourself before making it public.
2. Run `npm run check` with Node.js 22.19+ and confirm CI's Windows and Linux jobs pass after your push. The current suite mocks OAuth and Fast transport options; it does **not** sign in or make billable provider calls.
3. Create a **public, empty** GitHub repository under your own account. Do not request GitHub to initialize it with a README/license/gitignore: this folder already has them. Choose its name and check that the [upstream MIT attribution](NOTICE.md) is acceptable.
4. Only when you have approved the files and chosen the remote, run (replace the placeholder URL):
   ```sh
   git commit -m "Prepare portable DSH OAuth and Fast plugin"
   git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
   git push -u origin main
   ```
   Git records your author identity in the commit, which is publicly visible. Configure the identity you intend to publish before committing. Never paste credentials or PATs into the remote URL.
5. Optional: create a GitHub Release from a tested commit and clearly label Fast as **experimental / DSH 0.2.0-rc.2 tested only**. Include upgrade instructions: quit Harness, replace the cloned directory or run install from the new clone, restart Harness, verify OAuth and Fast availability. Do not include user state or private profile backups in the release archive.

中文提示：此目录只做了本地 Git 初始化与明确文件暂存，**没有提交或推送**。先检查暂存内容和 Git 作者邮箱；创建空的公开仓库、替换远程地址后才执行以上提交/推送。不要上传本机 `~/.dsh`、OAuth Token 或备份文件。
