---
name: figure-pool-generator
description: 当用户要为 EchoProfile 按主题生成或刷新人物池 JSON、导入 zip、人物候选池、本地肖像素材，尤其是科学家、企业家、投资人、特定国家/时代/行业/气质权重名单时使用。
---

# 人物池生成器

## 概览

这是 EchoProfile 项目内的人物池生成 skill，用来产出可用的第一版人物池，而不是写泛泛的人物研究文章。产物必须落到本仓库的本地资产中，并符合当前 `FigurePool` 预期和 zip 导入/导出行为。

默认目标：

- 一个主题人物池
- 通常 `30-50` 人，除非用户给出更明确数量
- 人物气质要强区分，不要把所有人写成同一种腔调
- 本地肖像，尺寸尽量一致
- 仓库内 JSON 源文件
- 用户要求可导入产物时，额外生成兼容 zip 包

## 何时使用

用户提出这些需求时使用：

- 创建新人物池 / 候选池 / figure pool
- 刷新或扩展已有主题人物池
- 为一组人物生成 JSON 文件或 zip 导入包
- 按国家、时代、行业、学派、气质倾向调整人物池权重

不要用于：

- 只编辑一两个已有记录
- 与 EchoProfile 无关的通用传记写作
- 无关的素材下载任务

## 先读取的项目上下文

生成任何内容前，先检查当前仓库真实状态，不要假设 schema：

- 人物池系统设计：`skills/figure-pool-generator/references/figure-pool-design.md`
- 素材标准：`skills/figure-pool-generator/references/figure-pool-material-guidelines-design.md`
- 生成器设计：`skills/figure-pool-generator/references/figure-pool-generator-skill-design.md`
- 共享校验/打包工具：`skills/figure-pool-generator/scripts/figure_pool_tools.py`
- zip 打包器：`skills/figure-pool-generator/scripts/pack_figure_pool_zip.py`
- 校验器：`skills/figure-pool-generator/scripts/validate_figure_pool.py`
- 工具行为测试：`skills/figure-pool-generator/tests/`

如果当前 checkout 里存在应用侧导入/导出实现，用 `rg "pool.json|portrait_url|FigurePool|figure-pools" src src-tauri` 查找，并以当前代码优先于旧文档。如果当前 checkout 没有应用实现，把 bundled scripts 和 tests 当作可执行契约。

## 输出位置

除非用户另有要求，优先使用这些路径：

- 源 JSON：`src/data/figure-pools/<pool-slug>.json`
- 肖像目录：`public/figure-portraits/<pool-slug>/`
- 导入 zip：`zip/<pool-slug>.zip`

文件名使用 ASCII 和稳定 slug。

## 必需记录字段

每条记录必须满足当前人物池 schema 预期：

- `slug`
- `name`
- `localized_names`：有稳定本地化名称时填写
- `portrait_url`
- `quote_en`
- `quote_zh`
- `core_traits`
- `thinking_style`
- `temperament_tags`
- `temperament_summary`
- `loading_copy_zh`
- `loading_copy_en`
- `bio_zh`
- `bio_en`
- `achievements_zh`
- `achievements_en`

缺少肖像、必填字符串为空、成就数组为空、`slug` 重复都视为硬阻塞，不能继续声称完成。

## 内置工具

重复校验或打包时使用 bundled scripts，不要临时重写一次性逻辑：

- 校验源人物池：`python3 skills/figure-pool-generator/scripts/validate_figure_pool.py --input src/data/figure-pools/<pool-slug>.json`
- 打包导入 zip：`python3 skills/figure-pool-generator/scripts/pack_figure_pool_zip.py --input src/data/figure-pools/<pool-slug>.json --output zip/<pool-slug>.zip`

两个脚本默认把 `/figure-portraits/...` 按仓库 `public/` 目录解析。如果不在仓库根目录运行，追加 `--project-root /path/to/EchoProfile`。

## 工作流程

### 1. 归一化用户需求

从用户请求中提取真实约束：

- 主题和边界
- 目标人数
- 必须包含的人物
- 必须排除的人物
- 国家 / 时代 / 行业权重
- 文案语气要求
- 是否需要 zip 输出

如果用户给出最终名单，把它当作权威来源。不要偷偷加回用户排除的人。

### 2. 确认当前 schema 和 zip 格式

写文件前检查当前实现：

- `FigureRecord` 字段预期
- 仓库当前保存完整 `FigurePool` 对象，还是只保存导入 payload
- zip 布局

当前 bundled packer 的 zip 行为：

- zip 根目录包含 `pool.json`
- 肖像放在 `portraits/` 下
- `pool.json` 中每条记录的 `portrait_url` 必须重写为 `portraits/<filename>`

zip payload 是导入 payload，不是内部运行态快照。

### 3. 构建人物名单

默认名单规模为 `30-50` 人。

选择规则：

- 优先代表性强、信号密度高的人物
- 保持内部差异，不堆叠近似人物
- 优先选择公开材料足够、能填好所有字段的人物
- 遵守用户权重，例如更多中国和美国互联网创始人
- 如果主题过窄，质量优先，并明确说明取舍

### 4. 写记录

为产品展示而写，不写百科式简历堆砌。

字段指导：

- `quote_zh` / `quote_en`：短、可独立阅读、带人物气质
- `bio_zh` / `bio_en`：简洁展示文案，不堆履历
- `achievements_*`：`2-4` 条清晰、高识别度成就
- `core_traits`：压缩的人格/能力特征
- `thinking_style`：观察此人如何思考和行动
- `temperament_summary`：概括能量、节奏、风格
- `loading_copy_*`：短而生动，并贴合人物

用户要求更生动时：

- 增加场景感、时代纹理、战略味道
- 让人物之间明显不同
- 避免机器式平行句
- 仍保持字段适合 UI 展示，不要写太长

除非用户明确要求统一，否则不要让每条记录都像同一个模板。

### 5. 下载并标准化肖像

肖像规则：

- 优先高清、干净、单人照片
- 本地保存到 `public/figure-portraits/<pool-slug>/`
- 文件名和 `slug` 对齐
- 同一人物池内尺寸尽量一致
- 避免破损热链；仓库应拥有本地素材

如果网络受限，先按当前环境规则处理，不要假设可以下载。

### 6. 写 JSON 源文件

在 `src/data/figure-pools/` 下创建仓库内源文件。

如果当前仓库约定使用完整 pool object，就保持该 source shape。如果用户只需要可导入输出，可以直接按导入 payload 编写。

至少保证文件内部一致：

- pool 名称和描述匹配主题
- 记录数量正确
- 所有肖像路径都解析到本地资产
- 所有必填字段都存在

### 7. 需要时导出 zip

用户要求 zip 时，按已实现 importer 兼容格式打包，并把最终 `.zip` 文件放到项目根目录的 `zip/` 文件夹：

- 输出文件路径使用 `zip/<pool-slug>.zip`，必要时先创建 `zip/` 目录
- 在 zip 包根目录创建 `pool.json`
- 把每条记录的 `portrait_url` 重写为 `portraits/<filename>`
- 把肖像文件放入 `portraits/`
- 不包含 importer/exporter 不需要的内部运行态元数据

以 `skills/figure-pool-generator/scripts/pack_figure_pool_zip.py` 和它的测试为准，不猜格式。

## 验证

没有新鲜检查结果时，不要声称完成。

最低检查：

- validator script 通过
- 记录数量符合预期
- 肖像文件本地存在
- 没有重复 slug
- packer script 成功
- zip 包含 `pool.json`
- zip 内肖像数量等于记录数
- zip 内 `pool.json` 使用 `portraits/` 路径

常用命令：

```bash
python3 skills/figure-pool-generator/scripts/validate_figure_pool.py --input src/data/figure-pools/<pool-slug>.json
python3 skills/figure-pool-generator/scripts/pack_figure_pool_zip.py --input src/data/figure-pools/<pool-slug>.json --output zip/<pool-slug>.zip
python3 - <<'PY'
import json, zipfile
from pathlib import Path
z = zipfile.ZipFile(Path("zip/<pool-slug>.zip"))
payload = json.loads(z.read("pool.json"))
print("entries", len(z.namelist()))
print("records", len(payload["records"]))
print("portrait_entries", sum(1 for n in z.namelist() if n.startswith("portraits/")))
PY
```

## 回报结果

完成后报告：

- JSON 路径
- 肖像目录
- zip 路径：如果创建了 zip，必须位于 `zip/<pool-slug>.zip`
- 最终记录数
- 用户要求的包含/排除名单是否遵守
- 任何取舍、弱记录、缺失素材

报告要事实化。除非当前回合成功跑过验证命令，否则不要说已经完成。
