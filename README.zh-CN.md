# DeepSeek Harness：ChatGPT 登录与可选 Codex Fast

[仓库首页](<README.md>) · [English](<README.md#english>) · [发布到 GitHub](<PUBLISHING.md>) · [许可证](<LICENSE>) · [来源与致谢](<NOTICE.md>)

**社区兼容插件，非 OpenAI、DeepSeek、DeepSeek Harness 或原作者官方发布。** 现有兼容性测试范围仅为 **Windows / DeepSeek Harness Desktop 0.2.0-rc.2**；其他系统和版本**未经验证**；本次安装适配的验证范围见下方测试说明。此插件复用 Harness 原生 OAuth、凭据保存和 `openai-codex` 模型适配器，在设置页与模型页显示 ChatGPT 登录入口，以及可选的 Fast 开关。不收集账号密码、不提供额外无鉴权服务器、不改默认模型。

## 功能概览

- **ChatGPT 原生授权**：支持浏览器登录和设备码登录，无需输入 API Key 或安装 Codex CLI。模型与额度由账号权益决定。
- **统一登录入口**：在设置页和模型页提供同一套登录操作，共享授权状态；不替换原有模型选择器。
- **明确的状态反馈**：显示登录状态标识，并根据登录进度改变按钮文案与样式，避免重复发起登录。
- **简洁界面**：去除常驻介绍和重复说明，保留操作按钮、状态标识、必要的错误提示与授权输入。
- **可选 Fast 开关**：无已有偏好时默认关闭，仅对后续新发起的 `openai-codex` 请求生效，不改动默认模型或其他提供商的配置；迁移保留已有偏好。

## 登录状态与按钮

卡片标题右侧显示“**登录状态 · 当前状态**”，同时使用圆点辅助区分：

| 状态 | 含义 |
| --- | --- |
| 检查中… | 首次读取 Harness 的授权状态，尚未得出登录结论。 |
| 未登录 | 当前状态表明尚未保存 ChatGPT OAuth 授权。 |
| 登录中… | 当前页面或其他页面正在执行登录流程。 |
| 已登录 | Harness 已保存本地 ChatGPT OAuth 授权，显示绿色状态圆点。 |
| 状态未知 | 尚未取得有效的状态数据，例如首次状态查询失败；不会误显示为未登录。 |

“已登录”**不是在线有效性或模型权限保证**，也不代表账号一定支持 Fast；具体可用模型、额度及请求结果仍由服务端和账号权益决定。

- 未登录时，强调按钮显示“**登录 ChatGPT**”。
- 当前页面登录过程中，按钮显示“**正在登录…**”并禁用，防止重复点击。
- 登录后，按钮变为描边样式的“**重新登录 ChatGPT**”；退出登录后自动恢复。
- Fast 区域以简短的“**已开启 / 已关闭**”显示当前偏好。额度说明移到开关按钮的悬停提示中，开启前请阅读下方的额度提醒。

## 安装（推荐插件页）

1. 在**原有 Harness Desktop** 打开 **设置 → 插件 → 添加插件**，输入 GitHub URL：**https://github.com/HuYongJi/dsh-openai-oauth**。
2. URL 对应的提交**必须包含新版 bundle**：[package.json](<package.json>) 内有 `dsh.bundle.patch: "./cordis.bundle.json"`，同时带有 [cordis.bundle.json](<cordis.bundle.json>) 和 `lib/` 构建产物。旧提交不能按此方式安装；若 URL 仍解析到旧提交，请改用含 bundle 的本地副本或包。静态 bundle 只加载 `dsh-openai-oauth`，包仍保留 client 导出。
3. 也可输入**本地仓库绝对目录**（例如 `D:\Plugins\dsh-openai-oauth`），或本地 **`.tgz` 包的绝对路径**（例如 `D:\Packages\dsh-openai-oauth-0.2.1.tgz`）。目录或包同样必须包含上述元数据和构建产物。无需 `npm install`，也**无需发布到 npm**；打包检查见[发布指南](<PUBLISHING.md>)。
4. 安装后按界面提示**启用插件、重启原有 Desktop** 并刷新页面；不要另起服务器。进入 **设置 → OpenAI OAuth**（模型页底部也有入口），通过浏览器或设备码登录 ChatGPT。**每台电脑都要单独授权**，不要复制原机器的 Token。必要时点击“启用 Codex 模型”，然后从普通模型选择器选用账号支持的模型。
5. Fast 对**没有已有偏好的用户默认关闭**。成功登录并配置原生 `openai-codex` 路由且没有 API 凭据覆盖项时，阅读额度提醒或悬停查看按钮提示后，再决定是否点击“开启 Fast”。点击“关闭 Fast”恢复标准模式。只影响**后续新请求**，不等于推理强度或切换模型。**已有 Fast 偏好会保留，原来开启者迁移或重装后仍可能开启。**

**插件页安装与手动脚本是互斥的两种方式，不能并用或重复加载。** 脚本仅为备用；旧手动安装请先按下方步骤迁移，不要直接叠加安装。

### 从旧手动安装迁移

1. **完全退出 Harness Desktop**，包括托盘和后台实例，避免配置写入冲突。在仓库目录先预览，再卸载脚本管理的加载块：
   ```sh
   node scripts/setup.mjs uninstall --dry-run
   node scripts/setup.mjs uninstall
   ```
   默认操作 `~/.dsh/profiles/desktop/cordis.patch.yml`。非默认 profile **必须在两条命令中显式传入同一个 `--patch` 路径**：
   ```sh
   node scripts/setup.mjs uninstall --patch "实际配置文件路径" --dry-run
   node scripts/setup.mjs uninstall --patch "实际配置文件路径"
   ```
2. 脚本只移除**可识别的自身标记块**，实际修改前在原配置旁备份。**未标记的旧 entry 不会自动清理**；遇到未标记/冲突的 `openai-oauth-ui` entry 或损坏标记时，请停止操作，先备份配置，再人工确认并**定点移除旧插件加载项**，不要删除其他配置或用旧的完整备份覆盖后续修改。
3. 确认旧加载项已移除后，重开**原有 Desktop**，进入 **设置 → 插件 → 添加插件**，按推荐方式安装。不要再执行脚本的 `install`。

卸载和迁移**保留 ChatGPT 凭据、模型配置及 Fast 偏好**，并不等于退出登录或重置设置。**原来 Fast 开启者迁移后仍可能开启**，发起新请求前请查看卡片；若要退出账号，请在卸载前使用插件的退出登录按钮。

### 手动脚本（仅备用）

仅在不使用插件页安装时采用。将仓库下载到**固定且可写**的目录，不要放入凭据或桌面 profile；准备 [Node.js 22.19+](https://nodejs.org/)。**完全退出 Desktop** 后运行：

```sh
node scripts/setup.mjs install --dry-run
node scripts/setup.mjs install
```

脚本只增改**现有** desktop profile 中带标记的自身配置块，自动将插件路径转为 `file:///…/lib/index.js`，并在原配置旁创建带时间戳的备份。非默认 profile 在两条命令中显式增加 `--patch "实际配置文件路径"`。缺少 profile、构建产物、标记损坏或 ID 冲突时会拒绝修改；脚本不会创建完整 profile。完成后重启原有 Desktop。若从插件页方式切回脚本，必须先在插件页卸载，不能保留两份加载项。

**额度提醒：**据 [OpenAI Fast 文档](https://learn.chatgpt.com/docs/agent-configuration/speed.md)，受支持的 GPT-6 模型约按标准模式 **2.5 倍消耗订阅额度**。是否开放由账号决定；本项目没有替用户实际测速或核对额度。

### 版本边界

登录入口要求 Harness 0.2 的原生授权、凭据、Connection、设置及 pi-ai 服务。Fast **额外依赖未公开的内部结构** `PiAiAdapter.current().models.streamSimple`：仅向 `openai-codex` 请求传 pi-ai 的 `serviceTier: 'fast'`，后者会写入 `service_tier: 'fast'`。这里的结构探测**不是严格版本识别，也不能保证升级后请求线路一定正确**；结构变动时禁用开关，但内部语义变化仍需重新验证。每次升级 DSH 都应重新检查。即使 Fast 不可用，原生登录仍可能正常工作。

## 更新、卸载、测试

- **插件页安装：**升级暂按 **设置 → 插件中卸载，再安装更新后的 GitHub 提交、本地目录或 `.tgz`** 操作，并按界面提示启用、重启；**不承诺自动更新**。移除此方式安装的插件，也应使用插件页，不要用手动脚本代替。
- **手动备用方式：**完全退出 Desktop，在更新后的仓库依次运行 `node scripts/setup.mjs install --dry-run` 和 `node scripts/setup.mjs install`，只更新自身标记块；卸载则依次运行 `node scripts/setup.mjs uninstall --dry-run` 和 `node scripts/setup.mjs uninstall`。非默认 profile 每条命令都显式指定 `--patch`，完成后重启原有 Desktop。
- 两种方式卸载都不是清除凭据、模型配置或 Fast 偏好的操作；重装后要检查已有 Fast 状态，不能假定恢复为关闭。

```sh
npm run check                         # 无须下载依赖的测试与构建
npm pack --dry-run                    # 检查可分发包的文件清单
```

插件 **0.2.1** 已通过 **52 项回归测试**。另使用原生 **DSH 0.2.0-rc.2 插件管理器**，在隔离 profile 中分别验证了**本地绝对目录和 `.tgz`** 的安装（初始停用）→启用→解析 Host/client 并注册一组接口→停用→卸载；无关配置、合成凭据与 Fast 偏好保持不变。验证使用模拟 Connection，没有重新安装正在运行的 Desktop，也未测试真实 OAuth/Fast 请求或 GitHub 远程下载。**GitHub 安装需先发布含 bundle 的新提交**；其他验证要求见[发布指南](<PUBLISHING.md>)。修改 `src/` 后运行 `npm run build`，发布时带上相应 `lib/` 构建产物；文件变更或构建本身不会自动更新运行中的 Desktop Host，更新后需重启原应用。

## 隐私与公开发布检查

- OAuth 授权和刷新由 Harness 原生服务处理；界面只收到布尔状态，不会读取或显示 Token。API 复用 Harness 的会话鉴权和同源检查。
- Fast 偏好仅是 `~/.dsh/openai-oauth/fast-mode.json` 中的布尔值；不含 Token，且为此用户的 Harness 各 profile 共用。新电脑**不要复制旧偏好**，以免意外开启 Fast。
- **不要提交或打包** `fast-mode.json`、验证报告、桌面配置/备份、Cookie、Token 或环境文件；发布前检查 `git status`、`git diff --cached` 及包文件清单。[.gitignore](<.gitignore>) 不能代替人工确认。
- [LICENSE](<LICENSE>) 保留上游 MIT 许可及[来源说明](<NOTICE.md>)。本仓库不包含主程序安装包或第三方 `node_modules`。
