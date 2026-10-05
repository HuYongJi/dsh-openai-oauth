# DeepSeek Harness：ChatGPT 登录与可选 Codex Fast

[English](README.md) · [发布到 GitHub](PUBLISHING.md) · [许可证](LICENSE) · [来源与致谢](NOTICE.md)

**社区兼容插件，非 OpenAI、DeepSeek、DeepSeek Harness 或原作者官方发布。** 已在 **Windows / DeepSeek Harness Desktop 0.2.0-rc.2** 测试；其他系统和版本**未经验证**。此插件复用 Harness 原生 OAuth、凭据保存和 `openai-codex` 模型适配器，在设置页与模型页显示 ChatGPT 登录入口，以及可选的 Fast 开关。不收集账号密码、不提供额外无鉴权服务器、不改默认模型。

## 安装

1. 下载并解压本仓库到**固定且可写**的目录。不要把登录凭据或桌面 profile 放入仓库。如果 `node --version` 低于 22.19，请安装 [Node.js 22.19+](https://nodejs.org/)；仓库已经包含 `lib/` 构建产物，不需要 `npm install`。
2. **完全退出**正在运行的 Harness 桌面应用，在此仓库目录运行：
   ```sh
   node scripts/setup.mjs install --dry-run
   node scripts/setup.mjs install
   ```
   安装器只在现有 `~/.dsh/profiles/desktop/cordis.patch.yml` 中增改**带标记的自身配置块**，自动将当前插件路径转为 `file:///…/lib/index.js`，并在原配置旁创建带时间戳的备份。非默认位置可传 `--patch "配置文件路径"`。如果该 profile 文件不存在，请先配置 DSH desktop；脚本不会替你创建完整 profile。
3. 重启**原有** Harness 桌面应用，刷新其页面。进入 **设置 → OpenAI OAuth**（模型页底部也有入口），通过浏览器或设备码登录 ChatGPT。**每台电脑都要单独授权**，不要复制原机器的 Token。必要时点击“启用 Codex 模型”，然后从普通模型选择器选用账号支持的模型。
4. Fast **默认关闭**。成功登录并配置原生 `openai-codex` 路由且没有 API 凭据覆盖项时，阅读额度提示后点击“开启 Fast”；确认卡片显示已开启。点击“关闭 Fast”恢复标准模式。只影响**后续新请求**，不等于推理强度或切换模型。

**额度提醒：**据 [OpenAI Fast 文档](https://learn.chatgpt.com/docs/agent-configuration/speed.md)，受支持的 GPT-6 模型约按标准模式 **2.5 倍消耗订阅额度**。是否开放由账号决定；本项目没有替用户实际测速或核对额度。

### 版本边界

登录入口要求 Harness 0.2 的原生授权、凭据、Connection、设置及 pi-ai 服务。Fast **额外依赖未公开的内部结构** `PiAiAdapter.current().models.streamSimple`：仅向 `openai-codex` 请求传 pi-ai 的 `serviceTier: 'fast'`，后者会写入 `service_tier: 'fast'`。这里的结构探测**不是严格版本识别，也不能保证升级后请求线路一定正确**；结构变动时禁用开关，但内部语义变化仍需重新验证。每次升级 DSH 都应重新检查。即使 Fast 不可用，原生登录仍可能正常工作。

## 更新、卸载、测试

```sh
npm run check                         # 无须下载依赖的测试与构建
node scripts/setup.mjs install        # 从新位置运行，仅更新自身配置块
node scripts/setup.mjs uninstall      # 仅删除自身配置块
```

操作前退出 Harness，完成后重新打开。卸载**不删除** ChatGPT 凭据、模型配置或 Fast 偏好；要退出账号请先在插件登录卡片操作。如果旧版本的加载块使用不同标记，但同样使用 `openai-oauth-ui` ID，脚本会拒绝覆盖；先备份配置，**只删除旧插件块**后重试，不要用旧的完整备份覆盖后续设置。修改 `src/` 后运行 `npm run build`，提交相应的 `lib/`；运行中的应用不会仅凭文件修改自动更新 Host 代码。

## 隐私与公开发布检查

- OAuth 授权和刷新由 Harness 原生服务处理；界面只收到布尔状态，不会读取或显示 Token。API 复用 Harness 的会话鉴权和同源检查。
- Fast 偏好仅是 `~/.dsh/openai-oauth/fast-mode.json` 中的布尔值；不含 Token，且为此用户的 Harness 各 profile 共用。新电脑**不要复制旧偏好**，以免意外开启 Fast。
- **不要提交** `fast-mode.json`、验证报告、桌面配置/备份、Cookie、Token 或环境文件；发布前检查 `git status` 和 `git diff --cached`。`.gitignore` 不能代替人工确认。
- `LICENSE` 保留上游 MIT 许可及[来源说明](NOTICE.md)。本仓库不包含主程序安装包或第三方 `node_modules`。
