# EchoProfile

> 🪞 你的 AI 对话，正在成为第二份关于你的档案。  


你与 Codex、Cursor、Claude Code 和其他 AI 工具的聊天记录，是一条关于你如何思考、学习、决策、协作的长期轨迹。

EchoProfile 会从你的 AI 对话历史中生成个人 AI 画像。

✨ 在任何 AI 替你记住你之前，你应该先拥有自己的记忆。

<p align="center">
  <img src="assets/readme/copa-profile-main-en.png" alt="EchoProfile CoPA Profile 主界面截图" width="920" />
</p>

<p align="center"><em>从本地 AI 对话历史生成 CoPA Profile，并在会话、项目、全局范围之间切换。</em></p>

## 它现在已经能做什么？

### 1. 生成你的个人 AI 画像

EchoProfile 可以从不同范围的 AI 对话中生成画像：

- 单个会话：理解一次具体协作中你的表达与判断
- 单个项目：观察一个项目周期里的思考方式
- 全局历史：从长期 AI 使用中提取更稳定的个人模式

画像方法参考了 CoPA（Cognitive Personalization Assessment）论文中的个性化认知因子框架，关注的不只是“你聊了什么”，而是：

- 你如何建立信任
- 你如何锚定问题场景
- 你如何保持思维结构
- 你如何管理认知负荷
- 你如何进行元认知
- 什么样的回应最能与你产生共鸣

> 论文引用：Hang Su, Zequn Liu, Chen Hu, Xuesong Lu, Yingce Xia, Zhen Liu. **CoPA: Benchmarking Personalized Question Answering with Data-Informed Cognitive Factors**. arXiv:2604.14773, 2026. <https://arxiv.org/abs/2604.14773>


### 2. 用 Thought Echoes 看见“你像谁”

抽象的画像很无聊！

你可以把自己的 AI 画像投射到不同人物候选池中：

- 科学家：你的思维方式更接近哪类科学家？
- 企业家 / 投资人：你的决策风格更像哪类行动者？
- MBTI 动漫人格：用更轻量的方式理解自己的表达气质
同时，项目支持导入自制候选池；我们也提供了用于制作候选池的 skill。
Just for fun！

<p align="center">
  <img src="assets/readme/figure-pools-en.png" alt="EchoProfile Figure Pools 候选池页面截图" width="920" />
</p>

<p align="center"><em>Thought Echoes 会把你映射到候选池中，让你寻找到你的回响。</em></p>

## 自定义候选池：用 Skill 生成你自己的参考系

EchoProfile 不希望 Thought Echoes 只能使用内置人物池。

仓库内置了 `skills/figure-pool-generator`，这是一个专门为 EchoProfile 生成候选池的 skill。你可以让 AI 按主题创建新的 Figure Pool，例如：

- 某个时代的科学家
- 中美互联网企业家
- 投资人和创业者
- 文学家、哲学家、艺术家
- 你自己定义的一组角色或人格原型

我们也期待大家贡献自己喜欢的候选池：你热爱的学派、行业、作品、角色群像，都可以成为新的 Thought Echoes 参考系。

这个 skill 会帮助你生成符合 EchoProfile schema 的候选池数据，并在需要时打包成可导入的 zip：

```bash
python3 skills/figure-pool-generator/scripts/validate_figure_pool.py --input src/data/figure-pools/<pool-slug>.json
python3 skills/figure-pool-generator/scripts/pack_figure_pool_zip.py --input src/data/figure-pools/<pool-slug>.json --output zip/<pool-slug>.zip
```

生成后的 zip 会放在项目根目录的 `zip/` 文件夹中，例如：

```text
zip/<pool-slug>.zip
```

在 EchoProfile 的 `Figure Pools / 候选池` 页面中，可以直接上传这个 zip 池。应用会读取其中的 `pool.json` 和 `portraits/` 肖像素材，并把它作为新的 Thought Echoes 参考系。

## 当前可用能力

- CoPA Profile：基于 AI 对话生成用户画像
- Profile Snapshot：保存历史画像快照
- Markdown / JSON 导出
- Thought Echoes：将画像映射到人物候选池
- Figure Pools：导入、管理、切换、编辑候选池
- Session Board：多会话时间线视图
- 会话搜索、浏览和消息渲染
- token、工具调用、错误与工作流分析
- Tauri 桌面应用，本地优先运行

<p align="center">
  <img src="assets/readme/model-settings-en.png" alt="EchoProfile 大模型设置页面截图" width="920" />
</p>

<p align="center"><em>在本地配置 OpenAI-compatible 模型，用于生成 CoPA Profile 和 Thought Echoes。</em></p>

## 接下来

- 画像随时间变化的对比视图
- 更强的长期模式识别
- 知识盲区和重复行为提示
- 更多可分享的人物候选池
- 可导出的本地 AI memory / user profile
- 支持更多 AI 工具和历史来源

## 快速开始

可以从 [GitHub Releases](https://github.com/3kyou1/EchoProfile/releases) 下载打包版本，也可以从源码运行开发版。

### 桌面应用开发模式

```bash
pnpm install
pnpm tauri:dev
```

### WebUI Server 模式

如果你想在浏览器中使用 EchoProfile，可以构建并启动 WebUI Server：

```bash
just serve-build-run
```

如果已经构建过，可以直接启动：

```bash
just serve
```

开发 WebUI Server 时可以使用：

```bash
just serve-dev
```

### Docker WebUI 模式

Docker 运行的是 WebUI Server，不是桌面客户端。首次使用建议先复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env`，至少设置：

```bash
ECHOPROFILE_TOKEN=your-secret-token
```

启动 WebUI 容器：

```bash
docker compose up -d --build
```

启动后访问：

```text
http://127.0.0.1:3727/?token=your-secret-token
```

默认会挂载 `~/.claude`、`~/.codex` 和 `~/.local/share/opencode`。如果远程 Linux 主机路径不同，可以在 `.env` 中设置 `CLAUDE_HOME`、`CODEX_HOME` 或 `OPENCODE_HOME`。

### 仅调试前端界面

```bash
pnpm dev
```

> 注意：单独运行 Vite 主要用于前端界面调试，部分依赖 Tauri / WebUI API 的功能可能不可用。

### 常用开发命令

```bash
pnpm build
pnpm test
pnpm lint
```

### 面向 Skill 的 CLI

`echo-profile` 二进制也提供 JSON-only CLI，方便 skill 和自动化流程调用：

```bash
echo-profile version
echo-profile list providers
echo-profile list sessions --current-project
echo-profile profile collect --scope project --current-project --budget-chars 30000
```

`profile collect` 只会把本地用户消息文本收集为结构化 JSON。它不会调用 LLM，也不会直接生成画像；Codex skill 或其他 agent 可以使用返回的消息作为画像生成输入。


## 适合贡献什么？

EchoProfile 很适合以下方向的贡献：

- 新的 AI 历史导入器
- CoPA Profile 提示词和结构优化
- Thought Echoes 匹配逻辑
- 人物候选池数据集
- 画像可视化
- 隐私保护的数据处理方式
- 多语言文档和界面

## 致谢与许可

EchoProfile 是一个独立的开源项目，基于 Apache License 2.0 发布。

项目最初由 `Claude Code History Viewer` 演化而来；原项目的 MIT 版权声明和许可文本保留在 `NOTICE`。
