# TwoRiver TipTap 文章编辑器设计规范

- 日期：2026-06-30
- 状态：已批准，待实施
- 适用范围：TwoRiver 后台文章编辑、文章翻译、发布与公开渲染
- 前置草案：`docs/tiptap-document-engine.md`
- 决策结论：采用 TipTap 3.x，以 TipTap JSON 作为新文章的权威内容，以 Markdown 作为旧文章格式、兼容投影与导入导出格式

## 1. 背景

TwoRiver 当前使用 Markdown 作为文章正文的唯一权威格式。后台文章编辑页已经承担源码编辑、分栏预览、正文搜索、大纲、图片上传与拖放、双语内容、AI 翻译、统计和发布状态等职责；公开文章页则在 Markdown 解析后继续完成 HTML 清洗、代码高亮、复制按钮、表格包装、图片灯箱和文章目录增强。

这套结构仍适合以技术作者为主的纯 Markdown 博客，但随着后台编辑体验、结构化内容和 AI 辅助能力继续增加，字符串级编辑和解析会使正文格式、图片引用、目录、翻译和公开渲染之间的耦合越来越高。

本规范将原“文档与笔记引擎”草案收敛为可独立实施的文章编辑器改造。文档树、双链、块引用、版本历史、评论、多人协作和 AI 自定义块不属于本次实施范围，也不作为首期数据模型的前置条件。

## 2. 已确认决策

1. 后台文章编辑器迁移到 TipTap 3.x，但不进行一次性全量替换。
2. 新 TipTap 正文以 JSON 为权威内容，不以 Markdown 为权威存储。
3. 旧 Markdown 文章继续原样读取和编辑，只有作者显式确认后才转换为 TipTap。
4. 每个语言版本独立记录内容格式，同一文章的中文和英文可以处于不同迁移阶段。
5. 任一语言正文在任一时刻只能有一种权威格式；JSON 和 Markdown 不得同时作为可编辑源。
6. TipTap 保存时由后端同步派生纯文本和 Markdown 兼容投影，并通过结构化扫描识别资源引用；前端提交的派生字段不被信任。
7. TipTap 文章具备公开 JSON 渲染能力后才允许发布。
8. 公开页不加载完整编辑器运行时；JSON 通过白名单静态渲染后复用现有文章增强逻辑。
9. 首期不依赖 TipTap Pro、协作服务或外部转换服务。
10. 首期不提供 TipTap 与 Markdown 源码之间的自由来回切换。
11. 首期保持手动保存和发布，不新增自动保存。
12. 现有 Markdown 文章、公开 URL、图片 URL、目录、代码复制和图片灯箱必须保持兼容。

## 3. 目标

- 为后台提供稳定的所见即所得文章编辑体验。
- 把正文从无约束字符串升级为受 schema 约束的结构化文档。
- 保留中英双语、图片上传、代码块、表格、分类、标签、发布状态和 AI 翻译能力。
- 旧 Markdown 文章无需批量迁移即可继续编辑和发布。
- 支持按单个语言版本显式转换，并保留可恢复的原始 Markdown 快照。
- 让公开页能够同时渲染 Markdown 和 TipTap JSON，且共享同一套文章视觉增强。
- 让后端能够从结构化文档可靠派生搜索文本和资源引用。
- 为将来的 schema 演进留下明确的版本与迁移入口。
- 使编辑器核心从当前大型页面组件中拆出，形成可独立测试的边界。

## 4. 非目标

- 不建设通用文档库、文档树或笔记系统。
- 不新增 `documents`、`document_links` 或 `document_versions` 表。
- 不实现双链、块引用、评论、修订建议或版本比较。
- 不实现多人实时协作、Yjs 或 Hocuspocus。
- 不实现 `callout`、`noteLink`、`attachment`、`embed` 或 `aiBlock` 自定义节点。
- 不实现 DOCX、PDF、Notion 或 Google Docs 文件级导入导出。
- 不引入 TipTap Pro、Pages、Conversion 或 Cloud 服务。
- 不重构分类、标签、页面、项目、导航或站点设置的数据模型。
- 不把独立页面和 About 正文同时迁移到 TipTap。
- 不保证 Markdown 导出文本与导入前的原始字符逐字一致，只保证首期受支持节点的语义兼容。
- 不在本次改造中替换公开页现有的代码高亮主题或文章视觉设计。

## 5. 方案选择

### 5.1 保留 Markdown 并继续扩展现有编辑器

优点是改动小、数据迁移风险低、技术作者仍可直接控制源码。缺点是图片、表格、目录、AI 编辑和未来结构化内容继续依赖字符串解析，当前编辑页的职责会进一步增长。

该方案只适合确认长期维持纯技术博客、且主要作者偏好 Markdown 源码的产品方向。本次不采用。

### 5.2 TipTap 负责编辑，保存时转换回 Markdown

优点是数据库和公开页变化较少。缺点是每次保存都经过 JSON 到 Markdown 的有损边界，Markdown 无法完整表达所有富文本结构；一旦允许源码和富文本双向覆盖，格式漂移和内容丢失很难定位。

该方案不满足单一权威内容原则，本次不采用。

### 5.3 TipTap JSON 权威存储，Markdown 渐进兼容

优点是内容模型清晰、可验证、可迁移，且能够保留旧文章和旧公开渲染链路。代价是需要同时改造数据库、API、编辑器、公开渲染、资源引用和 AI 翻译。

本次采用该方案，并通过按语言版本转换、兼容投影和功能开关控制上线风险。

## 6. 总体架构

系统分为五个明确边界：

1. **文章编辑器**：负责交互、选择区、命令、上传触发和输出 TipTap JSON。
2. **内容引擎**：负责 schema、验证、规范化、纯文本提取、Markdown 投影、资源引用和 schema migration。
3. **文章 API 与仓储**：负责内容格式判别、事务保存、权限、生命周期和兼容输入输出。
4. **公开内容渲染**：按格式选择 Markdown 或 JSON 渲染，并产出统一文章文档结构。
5. **显式迁移流程**：负责 Markdown 转换预检、人工确认、快照和恢复。

数据流：

```text
TipTap editor
  -> content JSON
  -> API validates and normalizes
  -> one database transaction writes:
       content_json                authoritative content
       content_schema_version      schema version
       content_text                derived search text
       content_markdown            compatibility projection
       validated image URLs        structurally discoverable in JSON
  -> public JSON renderer
  -> shared article enhancements

Legacy Markdown editor
  -> content_markdown              authoritative content
  -> existing Markdown renderer
  -> shared article enhancements
```

任何持久化派生步骤失败时，整个保存事务失败，不允许只写入 JSON 而留下旧的纯文本或 Markdown 投影。资源引用继续按当前产品模型在资源删除前即时扫描，不新增持久化关联表。

## 7. 工程边界

### 7.1 新增内容引擎包

新增 `packages/content-engine`，避免 Web、API 和迁移脚本各自维护一套节点名称、属性和转换规则。

建议职责：

```text
packages/content-engine/src/
  documentTypes.ts
  documentSchema.ts
  articleExtensions.ts
  normalizeDocument.ts
  validateDocument.ts
  extractText.ts
  extractProseText.ts
  collectResourceReferences.ts
  markdownImport.ts
  markdownProjection.ts
  renderArticleDocument.ts
  migrations/
    v1.ts
```

包内不包含 React 页面或后台 UI。它可以依赖 TipTap/ProseMirror 的无浏览器能力和 Zod，但不能读取数据库、环境变量或文件系统。

`packages/shared` 继续维护业务 API schema，并依赖内容引擎导出的内容类型和 Zod schema。内容引擎不得反向依赖 `packages/shared`，避免循环依赖。

### 7.2 Web 边界

后台编辑器放入：

```text
apps/web/src/editor/
  ArticleEditor.tsx
  ArticleEditorToolbar.tsx
  ArticleLinkPopover.tsx
  ArticleTableControls.tsx
  CodeBlockLanguageSelect.tsx
  useArticleImageUpload.ts
  useUnsavedArticleWarning.ts
```

`AdminEditorPage` 继续负责文章元数据、分类、标签、双语切换、生命周期和 API 调用，不再直接实现正文选择区、Markdown 搜索、格式命令或图片插入算法。

TipTap 及编辑器组件只从后台编辑路由懒加载，不进入首页、列表页或普通公开页面首屏依赖。

### 7.3 API 边界

API 继续使用现有 Fastify route、repository 和 SQLite 事务模式。内容验证和派生放在内容服务中，不散落到 route 或 SQL 映射函数。

建议新增：

```text
apps/api/src/services/articleContentService.ts
```

职责包括：

- 规范化旧 API 输入；
- 验证和规范化 TipTap JSON；
- 派生纯文本；
- 生成 Markdown 兼容投影；
- 收集图片引用；
- 执行 Markdown 转换预检；
- 构造明确的内容校验错误。

## 8. TipTap 文档 schema v1

### 8.1 存储形态

`content_json` 只存储 TipTap document 本身：

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "正文" }
      ]
    }
  ]
}
```

`content_format` 和 `content_schema_version` 存在数据库列及 API envelope 中，不在 JSON 内重复保存，避免元数据冲突。

### 8.2 允许节点

首期允许：

- `doc`
- `text`
- `paragraph`
- `heading`，允许 level 1–6；工具栏只主动提供 level 2 和 3，导入器保留旧文章已有级别
- `bulletList`
- `orderedList`
- `listItem`
- `blockquote`
- `codeBlock`，保存可选 `language`
- `hardBreak`
- `horizontalRule`
- `image`
- `table`
- `tableRow`
- `tableHeader`
- `tableCell`

首期允许 marks：

- `bold`
- `italic`
- `strike`
- `code`
- `link`

TipTap 3 StarterKit 默认包含的 `underline` 在首期显式关闭，避免产生当前 Markdown 兼容格式无法稳定表达的新语义。

### 8.3 节点属性

`heading`：

- `level`：1–6
- `id`：非空稳定字符串，在单个语言文档内唯一

`codeBlock`：

- `language`：受支持的语言标识或 `null`

`link`：

- `href`：合法站内相对路径、hash、`http:`、`https:` 或 `mailto:`
- `title`：可选普通文本
- 新窗口行为不进入正文数据，由公开渲染策略决定

`image`：

- `src`：本站 `/uploads/` URL 或合法 `https:` URL
- `alt`：普通文本，默认空字符串
- `title`：可选普通文本
- 首期不保存任意 CSS、class、width、height 或 base64 数据

`tableCell` 和 `tableHeader` 首期不保存任意 style。表格首期不提供调整列宽功能。

### 8.4 标题 ID

只有 heading 节点需要稳定 ID，普通段落不生成 block ID。

- 从 Markdown 转换时，优先复用当前公开渲染的标题 ID 规则，以避免既有文章锚点失效。
- 新创建且缺少 ID 的 heading 使用 `h_` 加 UUID。
- 标题文字修改不改变既有 ID。
- 复制粘贴带来的重复 ID由规范化过程重新生成。
- AI 翻译复制源文档结构时保留 heading ID，使语言切换尽可能保持相同 hash。
- 后端在保存时再次补齐并校验 ID，不能只依赖前端插件。

官方 UniqueID 扩展可配置为只处理 heading；服务端规范化仍是最终数据边界。

### 8.5 schema 演进

- 当前版本为 `1`。
- 任何节点名称、内容表达式或持久化 attrs 的变更都必须提升版本。
- migration 是纯函数，输入旧版本 JSON，输出下一版本 JSON。
- 读取 TipTap 内容时先执行逐版本 migration，再验证当前 schema。
- 保存时只写当前 schema 版本。
- 公开渲染无法处理高于当前代码版本的 schema 时，记录错误并回退到 Markdown 兼容投影。

## 9. 数据库设计

### 9.1 新增字段

在 `post_translations` 增加：

```sql
content_format TEXT NOT NULL DEFAULT 'markdown',
content_json TEXT,
content_schema_version INTEGER,
content_text TEXT NOT NULL DEFAULT '',
migration_source_markdown TEXT,
migration_source_created_at TEXT
```

字段语义：

- `content_format`：`markdown` 或 `tiptap`。
- `content_markdown`：Markdown 行为下是权威正文；TipTap 行为下是服务端生成的兼容投影。
- `content_json`：仅 TipTap 行为下存在，是权威正文。
- `content_schema_version`：仅 TipTap 行为下存在。
- `content_text`：由权威内容派生，不由客户端决定。
- `migration_source_markdown`：旧 Markdown 转换时保存的不可变快照；新建 TipTap 正文为 `NULL`。
- `migration_source_created_at`：生成原 Markdown 快照的 UTC 时间；必须与 `migration_source_markdown` 同时为空或同时存在。

### 9.2 数据不变量

必须同时由应用校验和数据库约束或触发器保护：

```text
format = markdown
  content_json is null
  content_schema_version is null
  content_markdown is authoritative

format = tiptap
  content_json is not null
  content_schema_version >= 1
  content_markdown is derived and not editable
```

`content_json` 必须是合法 JSON。新建数据库在表定义中加入 CHECK；已有数据库通过幂等迁移和写入触发器获得等价约束，避免为添加列而重建包含生产内容的表。

### 9.3 现有数据迁移

数据库迁移只做以下操作：

1. 添加新列和索引/触发器。
2. 所有现有记录设为 `content_format = 'markdown'`。
3. `content_json`、`content_schema_version`、`migration_source_markdown`、`migration_source_created_at` 保持 `NULL`。
4. 从现有 `content_markdown` 回填 `content_text`。
5. 不在数据库迁移中自动把任何文章转换为 TipTap。

迁移必须可重复运行，并覆盖新库、旧库、部分字段已存在和迁移中断后的恢复场景。

### 9.4 翻译保存策略

当前 repository 通过删除全部翻译后重新插入完成文章更新。TipTap 改造时必须改为按 `(post_id, locale)` UPSERT，并在同一事务末尾删除本次请求明确移除的语言版本。

这样可以：

- 保留 translation 的 `created_at`；
- 保留不可变迁移快照；
- 避免未来新增内容字段时被默认值静默覆盖；
- 让每个语言版本独立迁移和回退。

## 10. API 契约

### 10.1 规范内容类型

```ts
type ArticleContent =
  | {
      format: "markdown";
      markdown: string;
    }
  | {
      format: "tiptap";
      schemaVersion: number;
      doc: TiptapDocument;
    };
```

文章翻译返回：

```ts
interface PostTranslation {
  locale: "zh" | "en";
  title: string;
  summary: string;
  content: ArticleContent;
  contentMarkdown: string;
  canRestoreMarkdown: boolean;
  restoreMarkdownSnapshotAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}
```

`contentMarkdown` 在过渡期保留：

- Markdown 正文时等于权威 Markdown。
- TipTap 正文时等于后端生成的兼容投影。
- 标记为 deprecated，旧公开页面和旧客户端完成迁移后再删除。

### 10.2 写入兼容

新编辑器使用 `content` 判别联合提交。后端在过渡期继续接受旧的 `contentMarkdown` 输入，并统一规范化为：

```ts
{ format: "markdown", markdown: contentMarkdown }
```

以下输入直接返回 400：

- 同一正文同时提交 Markdown 和 TipTap 权威内容；
- TipTap 缺少 schema version 或 doc；
- Markdown 内容携带 `content_json`；
- 未知格式；
- 超过大小或复杂度限制；
- 文档 schema、URL 或 heading ID 校验失败。

### 10.3 转换接口

新增两个显式管理员接口：

```text
POST /api/admin/posts/:id/translations/:locale/tiptap-preview
POST /api/admin/posts/:id/translations/:locale/convert-to-tiptap
```

预检接口：

- 不写数据库；
- 返回转换后的 JSON；
- 返回原 Markdown 和转换后 Markdown 投影；
- 返回不支持语法、HTML、外部图片和语义差异警告；
- 返回可否安全转换。

确认接口：

- 请求携带当前文章 `updatedAt`，防止预检后正文已被其他操作修改；
- 再次执行转换和校验，不信任前端回传的预检 JSON；
- 保存原始 Markdown 快照；
- 同时保存快照生成时间；
- 切换 `content_format`；
- 在同一事务写入全部派生字段。

恢复原 Markdown 使用：

```text
POST /api/admin/posts/:id/translations/:locale/restore-markdown
```

只对存在 `migration_source_markdown` 的 TipTap 正文开放。恢复后：

- `content_format = markdown`；
- `content_markdown` 恢复原快照；
- `content_json` 和版本置空；
- 重新派生 `content_text`；
- `migration_source_markdown` 置空。
- `migration_source_created_at` 置空。

新建 TipTap 文章没有原始 Markdown 快照，不能使用该恢复接口，但可以导出当前 Markdown 兼容投影并显式创建 Markdown 副本。

## 11. 后端保存管线

TipTap 正文保存严格执行：

1. 校验请求外层业务 schema。
2. 检查原始 JSON 请求体大小。
3. 根据 `content_schema_version` 执行 migration。
4. 根据当前允许节点和 attrs 验证文档。
5. 规范化 heading ID、空节点和重复属性。
6. 再次验证规范化结果。
7. 派生用于搜索的 `content_text`，包含标题、正文、列表、表格、图片 alt 和代码内容。
8. 派生 Markdown 兼容投影。
9. 结构化扫描图片 URL，并确认所有资源属性已经通过验证。
10. 在同一 SQLite 事务中写入翻译和现有文章关系数据；不新增资源引用关联表。
11. 返回数据库重新读取的规范结果。

限制：

- JSON 编码后最大 1 MiB。
- 最多 20,000 个节点。
- 最大嵌套深度 50。
- 单个 URL 最大 2,048 字符。
- 不允许 `data:`、`javascript:`、`file:` 或任意 iframe HTML。
- Image 仍使用现有 5 MiB 文件上传限制，图片二进制不进入正文 JSON。

限制值集中定义在内容引擎中，API 和测试读取同一常量。

## 12. 后台编辑体验

### 12.1 格式选择

- 打开 Markdown 正文时继续显示现有 Markdown 编辑器。
- 打开 TipTap 正文时显示新的富文本编辑器。
- 新建文章在灰度期由“使用富文本编辑器”入口创建 TipTap 正文；稳定后 TipTap 成为默认。
- Markdown 正文只有通过显式转换流程才能进入 TipTap。
- TipTap 正文不显示可编辑 Markdown 源码。
- TipTap 可以提供只读的“导出 Markdown”结果，但不能把编辑后的 Markdown 直接覆盖 JSON。

### 12.2 工具栏

固定工具栏提供：

- 段落、二级标题、三级标题；
- 粗体、斜体、删除线、行内代码；
- 有序列表、无序列表、引用；
- 链接；
- 代码块和语言；
- 图片；
- 表格插入、增删行列、删除表格；
- 分隔线；
- 撤销、重做。

正文内允许保留导入的 H1、H4、H5 和 H6，但工具栏不主动创建这些级别。文章标题仍由独立标题字段管理。

首期不增加 slash menu、气泡格式菜单、块拖拽手柄、颜色、字体、字号、对齐、下划线或任意 HTML。

### 12.3 图片

选择、拖放和粘贴图片继续复用当前上传 API 和文件校验：

1. 记录当前 selection。
2. 上传图片。
3. 上传成功后在记录位置插入 image node。
4. 默认 alt 使用选中文本；没有选中文本时为空并提示作者补充。
5. 上传失败时不写入持久化节点，保留当前正文并显示可重试错误。

上传中的临时 UI 状态不能进入文档 JSON。外部网页图片粘贴不自动下载到本站；只允许合法 HTTPS URL，并在 Markdown 转换预检中显示外部资源警告。

### 12.4 中英双语

- 中文和英文编辑器状态独立保存。
- 切换语言前把当前 editor JSON 同步到页面 draft state。
- 切换语言不得销毁另一语言的未保存编辑状态。
- 两种语言可分别使用 Markdown 或 TipTap。
- 保存请求仍按现有文章粒度一次提交两个语言版本。
- 任一语言校验失败时整篇保存失败，避免元数据和翻译部分更新。

### 12.5 保存与离开

- 保留现有保存草稿、保存、发布、归档和删除入口。
- editor transaction 只更新本地 draft，不自动调用保存 API。
- JSON 与最后一次成功保存结果不同即标记为未保存。
- 浏览器刷新、关闭或路由离开时显示未保存提醒。
- 保存失败时保留完整 editor state，不回滚到服务端旧值。
- 保存成功后使用服务端返回的规范化 JSON 重置 dirty baseline。

## 13. AI 翻译兼容

现有 AI 翻译以 Markdown 字符串作为输入输出。TipTap 正文不能通过“JSON 转 Markdown、翻译、再解析 Markdown”完成翻译，因为该链路可能破坏结构、链接、代码块和 marks。

TipTap 翻译采用结构保持策略：

1. 按 block 收集可翻译 text nodes。
2. 每个 text segment 携带稳定 path/segment ID，并把同一 block 的相邻 segment 一起发送，给模型足够上下文。
3. 排除 codeBlock 内容、URL 和结构 attrs。
4. image alt/title 可以作为独立可翻译 segment。
5. 模型只返回相同 block 和 segment ID 的译文。
6. 后端检查 ID 集合与拓扑没有变化。
7. 把译文写回源文档克隆，保留所有 nodes、marks、heading IDs 和链接。
8. 运行完整文档验证后才返回前端。
9. 结果只进入目标语言的本地 draft，作者保存前可以继续修改。

模型响应缺少 segment、增加未知 segment、改变结构或无法通过 schema 校验时，接口失败并保持目标正文不变。

在该管线完成前，TipTap 正文的 AI 翻译按钮显示为不可用并给出说明；它不阻止 TipTap 草稿试用，但在 TipTap 成为新文章默认格式前必须完成。

摘要等只需要自然语言正文的 AI 功能使用 `extractProseText` 即时提取标题、段落、列表、引用、表格文本和图片 alt，并排除 codeBlock；数据库中的 `content_text` 保留代码内容以支持全文搜索。

## 14. 公开渲染

### 14.1 统一渲染契约

公开文章页和后台只读预览消费统一结果：

```ts
interface ArticleHeading {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

interface RenderedArticleDocument {
  html: string;
  headings: ArticleHeading[];
}
```

新增入口：

```ts
renderArticleDocument(content, labels): RenderedArticleDocument
```

行为：

- Markdown：调用现有 marked、DOMPurify 和高亮流程。
- TipTap：先运行 schema migration 和白名单静态 JSON 映射，再执行最终 HTML 清洗。
- 两者随后共用代码块包装、复制按钮、表格容器、图片灯箱标记和 heading 收集逻辑。

### 14.2 TipTap JSON 渲染

公开页使用 TipTap Static Renderer 的 JSON 入口或等价的纯映射层，不创建 Editor、EditorView 或 selection state。

- 每个允许 node 和 mark 必须有显式映射。
- 所有文本和 attrs 输出前转义。
- link 和 image URL 再次执行协议白名单。
- 不支持的 node/mark 不静默删除正文；记录结构化错误并触发整篇兼容投影 fallback。
- 自定义 NodeView 不属于首期。

### 14.3 回退

公开 TipTap 渲染失败时：

1. 记录文章 ID、语言、schema version 和失败类型，不记录完整正文。
2. 使用保存时生成的 `content_markdown` 兼容投影走现有 Markdown 渲染。
3. 若兼容投影也失败，显示稳定的本地化文章不可用状态，不输出原始异常。

公开渲染回退不修改数据库。

### 14.4 包体积

- `@tiptap/react` 和编辑器扩展只存在于后台编辑 route chunk。
- 公开页优先使用不依赖 ProseMirror Editor runtime 的 JSON 静态映射入口。
- 构建测试记录迁移前后公开入口和后台编辑入口 chunk；公开首页主 chunk 不得因编辑器引入 TipTap React runtime。

## 15. Markdown 导入、投影与恢复

### 15.1 导入定位

`@tiptap/markdown` 只用于显式转换预检，不进入每次保存的权威链路。当前包仍为 Beta，因此转换必须针对 TwoRiver 实际文章语料建立 golden fixtures。

转换器至少检查：

- 标题和重复锚点；
- 有序/无序嵌套列表；
- GFM 表格；
- fenced code language；
- 图片和 alt；
- 链接；
- 行内 HTML；
- task list；
- 当前 schema 不支持的自定义 Markdown。

存在无法安全表达的结构时，预检返回阻断错误，不允许确认转换。作者可以先修改原 Markdown，或者继续保留 Markdown 格式。

### 15.2 Markdown 兼容投影

投影只覆盖 schema v1 节点，目标是 CommonMark/GFM 可读语义，不保证原始排版和空白。

投影必须稳定：同一规范化 JSON 重复投影得到相同字符串。服务端通过 serializer 校验和 golden snapshot 验证受支持节点，不依赖浏览器 DOM 或当前 Web Markdown renderer；无法投影的 TipTap 文档拒绝保存。公开页面仍对投影结果执行现有 Markdown 清洗和渲染流程。

兼容投影服务于：

- 旧公开代码回退；
- 数据导出；
- AI 或第三方只接受 Markdown 的只读输入；
- 紧急代码版本回滚。

它不能作为 TipTap 正文的编辑源。

### 15.3 恢复语义

“恢复原 Markdown”只恢复转换前快照，不把当前 TipTap 文档即时序列化后设为 Markdown 权威内容。这样用户明确知道会放弃转换后的 TipTap 修改。

恢复前必须：

- 显示将恢复的快照时间；
- 提示转换后的修改会丢失；
- 要求二次确认；
- 在操作前执行数据库备份策略规定的最小快照或审计记录。

## 16. 资源引用

现有资源引用扫描只搜索 Markdown 字符串。迁移后统一通过内容格式适配器收集：

- Markdown 正文：继续按当前安全转义后的 URL 匹配。
- TipTap 正文：遍历经过验证的 image nodes，读取规范化 `src`。
- TipTap 的 Markdown 兼容投影不重复计数。

资源删除检查必须同时覆盖两种格式。引用扫描失败时按“仍被引用”处理，禁止删除资源，而不是乐观放行。

首期 image node 直接保存 URL，不新增虚构 `assetId`。若未来资源表提供稳定 ID，再通过新的 schema version 引入。

## 17. 安全

- API 只接受 schema 白名单内的 nodes、marks 和 attrs。
- 不接受或持久化任意 HTML node。
- link 允许站内相对路径、hash、`http:`、`https:` 和 `mailto:`；禁止脚本、文件和数据协议。
- image 允许 `/uploads/` 与 `https:`；禁止 base64、SVG data URL 和任意本地路径。
- 公开 JSON 渲染使用转义映射，并保留 DOMPurify 作为最终防线。
- Markdown 转换中的 HTML 按现有 sanitizer 处理；无法可靠映射时阻断转换。
- 服务端重新派生纯文本、Markdown 投影和资源引用。
- 文档大小、节点数、深度和 URL 长度受限。
- 日志只记录文章 ID、locale、schema version、错误代码和节点 path，不记录完整正文或 AI 请求正文。
- 所有转换、恢复、保存和发布接口继续使用现有 session、CSRF、速率限制和管理员鉴权。

## 18. 错误处理

### 18.1 编辑器初始化失败

TipTap JSON 无法迁移或验证时，后台不创建空编辑器覆盖内容。页面显示恢复状态：

- 提示正文暂时不可编辑；
- 提供只读 Markdown 兼容投影预览；
- 提供复制错误编号；
- 保留文章元数据读取；
- 禁止保存和发布该语言版本。

### 18.2 保存失败

- 校验错误返回稳定错误码、locale 和 node path。
- 网络或服务端错误不清空本地 editor state。
- 派生或事务失败不更新任何正文列。
- 文章 `updatedAt` 冲突返回 409；前端提示重新载入，不静默覆盖。

### 18.3 图片失败

- 文件校验失败不插入节点。
- 上传后插入前若 selection 已失效，图片插入当前安全光标位置并提示作者确认。
- 已成功写入文件但前端取消插入时，沿用孤立上传清理机制。

### 18.4 转换失败

- 预检失败不写数据库。
- 确认转换前后都重新读取文章版本。
- 原 Markdown 快照、JSON 和格式切换在一个事务中完成。
- 恢复失败保留当前 TipTap 正文和快照。

## 19. 测试策略

### 19.1 内容引擎单元测试

- 所有允许节点和 marks 的有效文档；
- 未知 node、mark 和 attr；
- 文档大小、节点数和深度限制；
- heading ID 补齐、保留和重复修复；
- JSON 到纯文本；
- JSON 到 Markdown 稳定投影；
- JSON 资源引用；
- link/image URL 协议；
- schema v1 migration 幂等性；
- Markdown golden fixtures 转换和阻断报告；
- 中英文、混合标记和 code block 文本提取。

### 19.2 数据库与 API 测试

- 新库 schema 和旧库幂等迁移；
- 现有 Markdown 行全部保持 Markdown；
- `content_text` 回填；
- Markdown 新建、更新、发布和读取兼容；
- TipTap 新建、更新、发布和读取；
- 同一文章中英文格式不同；
- repository UPSERT 保留 `created_at` 和迁移快照；
- 非法格式组合被数据库或 API 拒绝；
- 派生失败事务回滚；
- stale `updatedAt` 返回 409；
- 转换预检不写数据库；
- 转换确认和恢复；
- JSON 图片引用阻止资源删除；
- TipTap AI 翻译保持文档拓扑。

### 19.3 Web 组件测试

- Markdown 正文继续加载现有编辑器；
- TipTap 空文档和已有文档加载；
- 工具栏命令状态；
- 中英文切换保留未保存内容；
- dirty state 与离开提醒；
- 保存成功使用规范化结果重置 baseline；
- 校验和网络错误保留编辑内容；
- 图片上传成功、失败和 selection 恢复；
- 转换预检、警告、确认和恢复对话框；
- TipTap 正文不显示可编辑 Markdown 源码。

### 19.4 公开渲染回归

- Markdown 和 TipTap 生成同一 `RenderedArticleDocument` 契约；
- 标题目录和稳定 ID；
- 代码语言、语法高亮和复制；
- 表格包装；
- 图片灯箱；
- link 和 image 安全清洗；
- 未知或不可渲染 JSON 回退 Markdown 投影；
- 中英文切换；
- 公开首页主 chunk 不包含 TipTap React editor runtime。

### 19.5 浏览器测试

使用 Playwright 覆盖真实 `contenteditable`、selection、Clipboard 和拖放行为：

- 中文 IME、英文和混合输入；
- 撤销重做；
- 键盘快捷键；
- 嵌套列表；
- 表格操作；
- 代码语言；
- 链接编辑；
- 图片选择、拖放和粘贴；
- 双语切换；
- 刷新恢复；
- 发布后公开目录、代码复制和图片灯箱；
- 320px 后台基本可操作性和公开文章无回归。

jsdom 测试只负责纯函数和外围 React 状态，不作为 selection、IME 或 Clipboard 正确性的唯一证据。

## 20. 上线顺序

### 阶段 0：隔离验证

- 锁定同一 TipTap 3.x 精确版本。
- 新增管理员 editor lab，不接生产保存。
- 验证 React 19、中文 IME、表格、代码语言、图片上传和构建拆包。
- 建立真实 Markdown golden corpus。

### 阶段 1：后端双轨能力

- 新增内容引擎、数据库字段、迁移、API union 和保存管线。
- 旧 Web 仍只提交 Markdown。
- 公开 API 继续返回兼容 `contentMarkdown`。
- 部署后验证旧文章无变化。

### 阶段 2：TipTap 草稿试用

- 通过 `VITE_TIPTAP_NEW_ARTICLE_ENABLED` 开放新建 TipTap 草稿入口。
- 已有 TipTap 正文无论开关状态都必须可读取；开关只控制新建和转换入口。
- TipTap 草稿可保存，不允许发布。
- 收集中文输入、粘贴、图片和表格问题。

### 阶段 3：公开渲染与发布

- 上线 JSON 静态渲染和 Markdown 回退。
- 完成公开文章回归与 E2E。
- 允许 TipTap 草稿发布。
- 完成 TipTap AI 翻译后，才允许 TipTap 成为新文章默认格式。

### 阶段 4：按文章转换

- 开放转换预检和人工确认。
- 先迁移内部测试文章，再迁移少量已发布文章。
- 每次批量转换前备份 SQLite 和 uploads。
- 观察公开渲染 fallback、保存失败和资源引用错误。
- 稳定后再把新建文章默认格式切换为 TipTap。

数据库迁移只增加字段，旧应用版本仍可读取 `content_markdown`。TipTap 保存持续生成兼容投影，因此紧急代码回滚时正文仍可显示。代码回滚前必须备份数据库；旧编辑器对 TipTap 投影的再次保存会把内容降级为 Markdown，因此回滚期间禁止编辑或明确接受该降级行为。

## 21. 可观测性

增加不含正文的结构化事件：

- TipTap 保存成功/失败；
- schema validation 错误码；
- schema migration 次数和版本；
- Markdown 转换预检结果；
- JSON 公开渲染 fallback；
- Markdown 投影失败；
- 资源引用扫描失败；
- AI 翻译拓扑校验失败。

后台可见错误使用短错误编号关联服务端日志。首期不建设新监控平台，沿用 Fastify 日志和现有运维日志入口。

## 22. 验收标准

- 现有 Markdown 文章无需转换即可继续编辑、保存、发布和公开阅读。
- 新 TipTap 草稿刷新后内容、格式、图片、表格、代码语言和标题 ID 完整恢复。
- TipTap 与 Markdown 在同一文章的不同语言版本中可以安全共存。
- 任一正文只有一种可编辑权威格式。
- TipTap 保存由服务端同步生成纯文本和 Markdown 投影，资源删除检查能够结构化扫描 TipTap JSON。
- TipTap 文章在公开页保持现有目录、代码复制、表格和图片灯箱能力。
- 公开首页首屏不加载 TipTap React editor runtime。
- 被 TipTap JSON 引用的图片不能从资源库删除。
- Markdown 转换必须预检、人工确认并保留原始快照。
- 恢复原 Markdown 不依赖即时 JSON 到 Markdown 转换。
- TipTap AI 翻译保持文档节点、marks、链接、代码和 heading ID 结构。
- 非法 node、attrs、URL、超大或过深文档被后端拒绝。
- 保存失败、转换失败和上传失败不丢失当前编辑内容。
- Web 测试、API 测试、类型检查、生产构建和关键 Playwright 场景全部通过。

## 23. 预计改动范围

主要涉及：

- 新增 `packages/content-engine`
- `packages/shared/src/schemas/publishing.ts`
- `apps/api/src/db/schema.sql`
- `apps/api/src/db/migrate.ts`
- `apps/api/src/repositories/postsRepository.ts`
- `apps/api/src/routes/adminPostRoutes.ts`
- 新增 `apps/api/src/services/articleContentService.ts`
- `apps/api/src/services/resourceReferenceService.ts`
- `apps/api/src/services/ai/translationDraftService.ts`
- `apps/web/package.json`
- `apps/web/src/api/admin.ts`
- `apps/web/src/pages/AdminEditorPage.tsx`
- 新增 `apps/web/src/editor/*`
- `apps/web/src/pages/PostPage.tsx`
- `apps/web/src/components/MarkdownPreview.tsx`
- `apps/web/src/utils/renderMarkdownDocument.ts` 或其后继统一渲染模块
- 编辑器、Markdown、文章页和后台相关样式
- 对应内容引擎、API、Web 与 Playwright 测试

不修改页面、项目、导航、统计、账户和备份的产品语义；备份只需确认新增 SQLite 列会随数据库快照完整保存。

## 24. 设计后的实施门槛

进入逐文件实施计划前必须确认：

1. 本规范的数据权威与恢复语义获得批准。
2. 首期节点/marks 清单获得批准。
3. AI 翻译被视为“默认启用 TipTap 前必须恢复”的现有能力。
4. 当前后台功能对齐分支完成整理，至少具备可重复的 Web/API 基线测试。
5. 实施时使用单独功能分支或隔离 worktree，避免和当前大范围未提交后台改动交叉覆盖。

## 25. 参考

- TipTap React：https://tiptap.dev/docs/editor/getting-started/install/react
- TipTap Persistence：https://tiptap.dev/docs/editor/core-concepts/persistence
- TipTap StarterKit：https://tiptap.dev/docs/editor/extensions/functionality/starterkit
- TipTap Static Renderer：https://tiptap.dev/docs/editor/api/utilities/static-renderer
- TipTap Markdown：https://tiptap.dev/docs/editor/markdown
- TipTap UniqueID：https://tiptap.dev/docs/editor/extensions/functionality/uniqueid
- TipTap FileHandler：https://tiptap.dev/docs/editor/extensions/functionality/filehandler
- ProseMirror Guide：https://prosemirror.net/docs/guide/
