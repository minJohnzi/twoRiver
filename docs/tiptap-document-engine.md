# Tiptap 文档与笔记引擎方案

状态：方案草案  
最后更新：2026-06-22  
适用范围：TwoRiver 从 Markdown 文章编辑器演进为文档和笔记库

## 1. 结论

TwoRiver 的长期内容内核建议改为 Tiptap/ProseMirror JSON 文档模型，Markdown 继续作为导入、导出和兼容格式存在，不再作为唯一权威存储格式。

核心原则：

- `content_json` 是权威内容，保存 Tiptap JSON。
- `content_text` 是检索内容，由 `content_json` 派生。
- `content_markdown` 在迁移期继续保留，用于旧文章兼容、导入导出和回滚。
- 自定义格式以 Tiptap node/mark 实现，例如 `callout`、`noteLink`、`attachment`、`embed`、`aiBlock`。
- 渲染层不直接信任 HTML，公开页面优先从 JSON 渲染出受控 React 组件或受控 HTML。

这能让文档库后续自然支持块级引用、双链、评论、版本历史、附件、AI 结构化块和全文搜索。

## 2. 依据

Tiptap 是基于 ProseMirror 的 headless 富文本编辑器框架，适合在 React 中自定义编辑体验、菜单、扩展和渲染方式。官方 React 集成文档推荐安装 `@tiptap/react`、`@tiptap/pm` 和 `@tiptap/starter-kit`，并通过 `useEditor` 与 `EditorContent` 接入 React。

Tiptap 官方持久化文档明确支持返回 HTML 或 JSON，并推荐使用 JSON 持久化编辑器状态，因为 JSON 更灵活、更容易解析，也更适合外部处理。ProseMirror 本身以 schema、state、transaction、view、transform 组织编辑器数据和编辑过程，这正好匹配文档库需要长期维护的结构化内容模型。

官方参考：

- Tiptap Overview: https://tiptap.dev/docs/editor/getting-started/overview
- Tiptap React: https://tiptap.dev/docs/editor/getting-started/install/react
- Tiptap Persistence: https://tiptap.dev/docs/editor/core-concepts/persistence
- Tiptap Node API: https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node
- Tiptap Markdown: https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage
- ProseMirror Guide: https://prosemirror.net/docs/guide/

## 3. 当前项目现状

当前内容链路：

- 后端 SQLite 表 `post_translations` 只有 `content_markdown`。
- 共享 schema 中 `PostTranslationSchema` 和 `UpsertPostInputSchema` 只接收 `contentMarkdown`。
- 后台编辑页使用 `<textarea>` 编辑 Markdown。
- 前台预览使用 `marked` 转 HTML，再通过 `DOMPurify` 清洗。
- 图片上传后返回 Markdown 图片语法并插入正文。

这套结构适合博客文章，但不适合继续扩展为“文档和笔记库”的核心：

- 块级引用缺少稳定 block id。
- 双链、附件、提示块、AI 结果块只能靠 Markdown 约定解析。
- 评论和版本差异只能在字符串层面做，难以定位具体块。
- 搜索、摘要、目录和结构化导出都需要重复解析 Markdown。

## 4. 目标与非目标

目标：

- 在不破坏现有文章的前提下，引入 Tiptap JSON 内容模型。
- 支持文档和笔记库的基础块、扩展块、双链和全文搜索。
- 保留 Markdown 导入导出能力。
- 允许后台编辑器逐步从 Markdown textarea 迁移到富文本编辑器。
- 为后续 AI 编辑、版本历史、评论和块级引用留下数据结构。

非目标：

- 第一阶段不做多人实时协作。
- 第一阶段不购买或依赖 Tiptap Pro 功能。
- 第一阶段不一次性重构所有文章、分类、标签和公开页面。
- 第一阶段不把 Markdown 完全移除。

## 5. 推荐技术栈

基础依赖：

```bash
pnpm --filter @tworiver/web add @tiptap/react @tiptap/pm @tiptap/starter-kit
```

按功能追加：

```bash
pnpm --filter @tworiver/web add @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder
pnpm --filter @tworiver/web add @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
pnpm --filter @tworiver/web add @tiptap/extension-task-list @tiptap/extension-task-item
pnpm --filter @tworiver/web add @tiptap/extension-code-block-lowlight @tiptap/extension-typography
```

建议谨慎引入：

- `@tiptap/extension-unique-id`：用于给块生成稳定 id。可以先验证许可、体积和协作场景注意事项；也可以先自研一个轻量 block id extension。
- `@tiptap/markdown`：官方文档标记为 Beta，适合先用于导入导出实验，不建议作为第一阶段核心存储链路。

## 6. 内容模型

### 6.1 权威文档格式

保存 Tiptap JSON，并包一层 TwoRiver 自有元数据：

```json
{
  "schemaVersion": 1,
  "editor": "tiptap",
  "doc": {
    "type": "doc",
    "content": [
      {
        "type": "heading",
        "attrs": {
          "level": 1,
          "id": "b_intro"
        },
        "content": [{ "type": "text", "text": "项目笔记" }]
      },
      {
        "type": "callout",
        "attrs": {
          "id": "b_risk",
          "variant": "warning",
          "title": "风险"
        },
        "content": [
          {
            "type": "paragraph",
            "attrs": { "id": "b_risk_p1" },
            "content": [{ "type": "text", "text": "需要确认发布时间。" }]
          }
        ]
      }
    ]
  }
}
```

约定：

- 所有可引用 block 都有 `attrs.id`。
- `id` 由前端创建，后端校验唯一性，缺失时后端补齐。
- node/mark 名称保持稳定，重命名必须走 schema migration。
- 自定义 node 的 `attrs` 必须可 JSON 序列化，不保存临时 UI 状态。

### 6.2 第一阶段节点

基础 node：

- `doc`
- `paragraph`
- `heading`
- `bulletList`
- `orderedList`
- `listItem`
- `taskList`
- `taskItem`
- `blockquote`
- `codeBlock`
- `horizontalRule`
- `image`
- `table`
- `tableRow`
- `tableCell`
- `tableHeader`

基础 mark：

- `bold`
- `italic`
- `strike`
- `code`
- `link`

自定义 node/mark：

- `callout`：提示、警告、信息、成功。
- `noteLink`：站内文档链接，支持 `docId`、`blockId`、`titleSnapshot`。
- `attachment`：文件附件，支持 `assetId`、`mimeType`、`name`、`size`。
- `embed`：外部或站内嵌入，第一阶段只允许白名单类型。
- `aiBlock`：AI 摘要、行动项、翻译结果等结构化输出。

## 7. 数据库设计

### 7.1 兼容式迁移

先在现有 `post_translations` 上增加列：

```sql
ALTER TABLE post_translations ADD COLUMN content_json TEXT;
ALTER TABLE post_translations ADD COLUMN content_text TEXT NOT NULL DEFAULT '';
ALTER TABLE post_translations ADD COLUMN content_schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE post_translations ADD COLUMN content_markdown_cache TEXT;
```

字段语义：

- `content_json`：Tiptap JSON 的字符串化结果。旧内容迁移前允许为 `NULL`。
- `content_text`：从 JSON 或 Markdown 派生的纯文本，用于搜索、摘要、列表预览。
- `content_schema_version`：TwoRiver 文档 schema 版本，不等同于 Tiptap 包版本。
- `content_markdown_cache`：从 JSON 导出的 Markdown 缓存，可为空，可重建。

迁移期读取规则：

```text
if content_json exists:
  render content_json
else:
  render content_markdown with existing MarkdownPreview
```

迁移期写入规则：

```text
Tiptap editor save:
  write content_json
  write content_text
  write content_markdown_cache
  keep content_markdown for rollback or export if needed

Markdown editor save:
  write content_markdown
  derive content_text from Markdown
  keep content_json unchanged or clear it by explicit migration flag
```

### 7.2 文档库扩展表

当内容从“博客文章”扩展为“文档和笔记库”时，建议新增通用文档表，而不是继续把全部概念塞进 `posts`：

```sql
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('note', 'article', 'page')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  parent_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  content_schema_version INTEGER NOT NULL DEFAULT 1,
  content_markdown_cache TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (document_id, locale),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_document_id INTEGER NOT NULL,
  source_block_id TEXT,
  target_document_id INTEGER NOT NULL,
  target_block_id TEXT,
  link_type TEXT NOT NULL CHECK (link_type IN ('explicit', 'backlink', 'embed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (target_document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

## 8. 后端接口

共享类型新增：

```ts
export const TiptapJsonSchema = z.object({
  schemaVersion: z.number().int().positive(),
  editor: z.literal("tiptap"),
  doc: z.object({
    type: z.literal("doc"),
    content: z.array(z.unknown()).optional()
  })
});

export const PostTranslationSchema = z.object({
  locale: LocaleSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  contentMarkdown: z.string().default(""),
  contentJson: TiptapJsonSchema.nullable().default(null),
  contentText: z.string().default(""),
  seoTitle: z.string().nullable().default(null),
  seoDescription: z.string().nullable().default(null)
});
```

API 行为：

- `GET /api/posts/:slug` 同时返回 `contentJson` 和 `contentMarkdown`。
- `GET /api/admin/posts/:id` 同时返回 `contentJson`、`contentMarkdown`、`contentMarkdownCache`。
- `POST/PUT /api/admin/posts` 接受 `contentJson`，后端重新派生 `contentText`。
- 图片上传继续返回 URL，同时增加结构化结果 `{ assetId, url, alt }`，由编辑器插入 image node。

后端校验：

- 校验 JSON 大小上限，避免超大文档。
- 校验 node/mark 白名单，拒绝未知 node，或放入 `unsupportedBlock`。
- 校验 link/image/embed URL 白名单。
- 校验每个 block id 在单篇文档内唯一。
- 派生 `content_text` 时忽略隐藏 attrs 和不应进入搜索的结构。

## 9. 前端架构

建议新增目录：

```text
apps/web/src/editor/
  extensions/
    Callout.ts
    NoteLink.ts
    Attachment.ts
    AiBlock.ts
  serialization/
    extractText.ts
    markdownImport.ts
    markdownExport.ts
    normalizeDocument.ts
  components/
    RichTextEditor.tsx
    EditorToolbar.tsx
    BlockMenu.tsx
    DocumentRenderer.tsx
```

后台编辑器组件：

- `RichTextEditor` 接收 `contentJson`、`onChange`、`locale`、`uploadImage`。
- 工具栏只做产品需要的命令，不暴露过多格式。
- 图片拖拽/粘贴复用现有上传 API，但插入 `image` node。
- 提示块、任务列表、表格、链接和附件通过按钮或 slash menu 插入。
- 保存时使用 `editor.getJSON()`，并在前端先派生 `contentText` 作为即时预览，后端仍重新派生一遍。

公开渲染组件：

- 第一阶段可以用只读 Tiptap `EditorContent` 渲染。
- 更推荐新增 `DocumentRenderer`，从受控 JSON 映射到 React 组件，避免公开页加载完整编辑器能力。
- `DocumentRenderer` 对未知 node 显示降级块，并记录监控日志。

示例编辑器骨架：

```tsx
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image
    ],
    content: content?.doc ?? { type: "doc", content: [] },
    onUpdate({ editor }) {
      onChange({
        schemaVersion: 1,
        editor: "tiptap",
        doc: editor.getJSON()
      });
    }
  });

  return <EditorContent editor={editor} />;
}
```

## 10. Markdown 兼容策略

短期：

- 旧文章继续走 `content_markdown`。
- 新文章可选择 Tiptap 编辑器，保存 `content_json`。
- 后台提供“从 Markdown 导入为富文本”的一次性按钮。
- 导入结果必须允许作者预览并确认。

中期：

- 批量迁移已发布文章，保留原始 Markdown 快照。
- 建立 JSON 到 Markdown 的导出测试。
- Markdown 导出只保证语义，不保证和原始 Markdown 字符串完全一致。

长期：

- Markdown 成为导入、导出、粘贴和 AI 输出兼容格式。
- 后台默认编辑器为 Tiptap。
- 只有高级模式或回滚工具继续显示 Markdown。

注意：`@tiptap/markdown` 当前官方文档标记为 Beta。第一阶段可以做实验，但迁移脚本和生产保存链路应该有可回滚策略，并对 `parse -> serialize` 做快照测试。

## 11. 搜索、双链和块引用

搜索：

- 保存时从 JSON 派生 `content_text`。
- SQLite 第一阶段可用 `LIKE` 或现有列表查询增强。
- 后续可引入 SQLite FTS5，索引 `title`、`summary`、`content_text`、`tags`。

双链：

- `noteLink` mark/node 保存目标 `docId` 和可选 `blockId`。
- 后端保存时扫描 JSON，重建 `document_links`。
- 公开页可以显示反向链接区域。

块引用：

- 每个可引用块保存 `attrs.id`。
- URL 形态建议为 `/docs/:slug#b_xxx`。
- 引用块保存 `targetDocumentId`、`targetBlockId`、`titleSnapshot`，目标丢失时可降级显示快照。

## 12. AI 集成

AI 不直接生成任意 HTML。推荐两种输入输出：

- 对短文本编辑：AI 返回 plain text 或 Markdown，再由编辑器插入当前 selection。
- 对结构化内容：AI 返回受控 JSON block，例如 `aiBlock`、`callout`、`taskList`。

AI 输出进入文档前必须经过：

- JSON schema 校验。
- node/mark 白名单校验。
- URL 和附件引用校验。
- 文本长度和块数量限制。

`aiBlock` 示例：

```json
{
  "type": "aiBlock",
  "attrs": {
    "id": "b_ai_summary",
    "kind": "summary",
    "sourceBlockIds": ["b_intro", "b_risk"],
    "model": "gpt-5"
  },
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "这段内容的核心风险是发布时间未定。" }]
    }
  ]
}
```

## 13. 安全策略

- 不保存或渲染用户提供的任意 HTML。
- 公开页渲染 JSON 时只允许白名单 node/mark。
- link URL 只允许 `https:`、`mailto:` 和站内相对路径。
- image URL 只允许本站上传路径或明确白名单域名。
- embed 第一阶段只做站内嵌入，外部 iframe 暂不开放。
- Markdown 导入时继续使用 sanitizer，并把不支持的 HTML 降级为文本或 `unsupportedBlock`。
- 后端永远重新派生 `content_text`，不完全信任前端提交的派生字段。

## 14. 迁移路线

### 阶段 0：准备

- 增加本文档和技术决策记录。
- 确认 Tiptap 版本、包体积、许可和 React 19 兼容情况。
- 写一个隔离 demo 页面，不接入生产保存。

验收：

- Tiptap demo 能编辑标题、段落、列表、链接、图片。
- `editor.getJSON()` 能保存并恢复。
- 现有 Markdown 编辑页不受影响。

### 阶段 1：双轨存储

- 数据库新增 `content_json`、`content_text`、`content_schema_version`、`content_markdown_cache`。
- 共享 schema 和 API 返回新增字段。
- 后端增加 JSON 校验、纯文本提取和 fallback 读取规则。
- 前端管理页隐藏开关引入 Tiptap 编辑器。

验收：

- 旧 Markdown 文章仍可编辑、发布、预览。
- 新 Tiptap 草稿可保存、刷新恢复、发布。
- 图片上传可插入 image node。
- API 测试覆盖 Markdown 和 JSON 双格式。

### 阶段 2：公开渲染和导入导出

- 新增 `DocumentRenderer`。
- 公开页面优先渲染 `content_json`。
- 增加 Markdown 导入按钮和 Markdown 导出接口。
- 增加 JSON 到 text、JSON 到 Markdown 的快照测试。

验收：

- 已发布 Tiptap 文章在公开页渲染一致。
- Markdown 导入后可人工确认。
- 导出 Markdown 包含标题、列表、链接、图片、代码块和表格。

### 阶段 3：文档库能力

- 新增 `documents`、`document_translations`、`document_links`、`document_versions`。
- 后台新增文档树或笔记列表。
- 实现 `noteLink` 和反向链接。
- 实现版本快照。

验收：

- 可以创建 note/article/page。
- 可以链接到文档和块。
- 保存后自动重建 backlinks。
- 可以恢复历史版本。

### 阶段 4：AI 与高级块

- 增加 `aiBlock`。
- AI 摘要、行动项、翻译结果以结构化块插入。
- 增加块级引用、附件和站内 embed。

验收：

- AI 输出不会绕过 schema 校验。
- 结构化块可编辑、可删除、可导出。
- 搜索能命中 AI 块中的正文内容。

## 15. 测试计划

单元测试：

- `extractText(contentJson)`。
- `normalizeDocument(contentJson)`。
- `validateTiptapDocument(contentJson)`。
- `scanDocumentLinks(contentJson)`。
- Markdown 导入导出 round-trip。

API 测试：

- 创建旧 Markdown 文章。
- 创建新 Tiptap 文章。
- 更新 Tiptap 文章后 `content_text` 变化。
- 未知 node 被拒绝或降级。
- 重复 block id 被拒绝或修复。

前端测试：

- 编辑器加载空文档。
- 编辑器保存和恢复 JSON。
- 插入图片、链接、表格、任务项。
- 公开页 JSON 渲染。
- 旧 Markdown fallback 渲染。

人工 QA：

- 粘贴富文本。
- 粘贴 Markdown。
- 拖拽和粘贴图片。
- 中英文双语文章编辑。
- 移动端只读渲染。

## 16. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| JSON schema 后续变更 | 旧文档无法渲染 | 增加 `content_schema_version` 和 migration 函数 |
| Markdown 导入丢语义 | 旧内容迁移不可靠 | 导入必须预览确认，保留原 Markdown 快照 |
| 自定义 node 过多 | 编辑器复杂、导出困难 | 第一阶段只做 `callout`、`noteLink`、`attachment` |
| 公开页加载编辑器过重 | 性能下降 | 使用 `DocumentRenderer` 做只读渲染 |
| 复制粘贴带入不安全 HTML | XSS 风险 | 白名单 schema、sanitize、URL 白名单 |
| 块 id 不稳定 | 双链和评论断裂 | block id 一旦生成不可随编辑重建 |

## 17. 推荐下一步

1. 先做阶段 0 demo：新增一个仅管理员可见的 Tiptap sandbox 页面。
2. 同时实现 `TiptapJsonSchema`、`extractText`、`normalizeDocument` 三个底层工具。
3. 再做数据库双轨迁移，不急着替换公开渲染。
4. 等保存、恢复、上传图片稳定后，再把编辑页从 Markdown textarea 切到 Tiptap。
