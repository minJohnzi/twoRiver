import { articleExtensions } from "@tworiver/content-engine/editor";
import { validateArticleDocument } from "@tworiver/content-engine";
import type { ArticleDocument } from "@tworiver/content-engine/browser";
import type { Locale } from "@tworiver/shared";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface ArticleEditorProps {
  value: ArticleDocument;
  locale: Locale;
  onChange: (value: ArticleDocument) => void;
  onInvalidContent?: (error: unknown) => void;
  onRequestImage?: (editor: Editor) => void;
  readOnly?: boolean;
  ariaLabel?: string;
}

export interface ArticleEditorToolbarState {
  isEditable: boolean;
  isParagraph: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  isBold: boolean;
  isItalic: boolean;
  isStrike: boolean;
  isCode: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
  isBlockquote: boolean;
  isCodeBlock: boolean;
  isLink: boolean;
  isInTable: boolean;
  canUndo: boolean;
  canRedo: boolean;
  codeLanguage: string;
  linkHref: string;
}

export interface ArticleEditorToolbarActions {
  setParagraph: () => void;
  setHeading: (level: 2 | 3) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleStrike: () => void;
  toggleCode: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleBlockquote: () => void;
  setLink: (href: string) => void;
  unsetLink: () => void;
  setCodeBlockLanguage: (language: string) => void;
  requestImage: () => void;
  insertTable: () => void;
  addTableRow: () => void;
  deleteTableRow: () => void;
  addTableColumn: () => void;
  deleteTableColumn: () => void;
  insertHorizontalRule: () => void;
  undo: () => void;
  redo: () => void;
}

const EMPTY_ARTICLE_DOCUMENT: ArticleDocument = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

const CODE_LANGUAGES = ["plaintext", "ts", "js", "python", "bash", "json", "css", "html", "md"] as const;

function editorLabels(locale: Locale) {
  if (locale === "zh") {
    return {
      body: "文章正文",
      invalid: "文章内容无法载入，请重新加载或恢复兼容 Markdown。",
      toolbar: "富文本编辑工具栏",
      paragraph: "正文",
      heading2: "二级标题",
      heading3: "三级标题",
      bold: "加粗",
      italic: "斜体",
      strike: "删除线",
      code: "行内代码",
      bulletList: "无序列表",
      orderedList: "有序列表",
      blockquote: "引用",
      link: "链接",
      linkUrl: "链接地址",
      applyLink: "应用链接",
      removeLink: "移除链接",
      codeBlock: "代码块语言",
      image: "插入图片",
      table: "插入表格",
      addRow: "添加行",
      deleteRow: "删除行",
      addColumn: "添加列",
      deleteColumn: "删除列",
      horizontalRule: "分隔线",
      undo: "撤销",
      redo: "重做"
    };
  }

  return {
    body: "Article body",
    invalid: "Article content could not be loaded. Reload or restore the compatibility Markdown.",
    toolbar: "Rich text editor toolbar",
    paragraph: "Paragraph",
    heading2: "Heading 2",
    heading3: "Heading 3",
    bold: "Bold",
    italic: "Italic",
    strike: "Strike",
    code: "Inline code",
    bulletList: "Bullet list",
    orderedList: "Ordered list",
    blockquote: "Quote",
    link: "Link",
    linkUrl: "Link URL",
    applyLink: "Apply link",
    removeLink: "Remove link",
    codeBlock: "Code block language",
    image: "Insert image",
    table: "Insert table",
    addRow: "Add row",
    deleteRow: "Delete row",
    addColumn: "Add column",
    deleteColumn: "Delete column",
    horizontalRule: "Horizontal rule",
    undo: "Undo",
    redo: "Redo"
  };
}

function validateEditorValue(value: ArticleDocument): { document: ArticleDocument; error: null } | { document: null; error: unknown } {
  try {
    return { document: validateArticleDocument(value), error: null };
  } catch (error) {
    return { document: null, error };
  }
}

function serializeDocument(document: ArticleDocument | null): string {
  return JSON.stringify(document ?? EMPTY_ARTICLE_DOCUMENT);
}

export function ArticleEditor({
  value,
  locale,
  onChange,
  onInvalidContent,
  onRequestImage,
  readOnly = false,
  ariaLabel
}: ArticleEditorProps) {
  const labels = editorLabels(locale);
  const validation = useMemo(() => validateEditorValue(value), [value]);
  const validatedDocumentKey = serializeDocument(validation.document);
  const onChangeRef = useRef(onChange);
  const onInvalidContentRef = useRef(onInvalidContent);
  const applyingExternalValueRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInvalidContentRef.current = onInvalidContent;
  }, [onInvalidContent]);

  useEffect(() => {
    if (validation.error) {
      onInvalidContentRef.current?.(validation.error);
    }
  }, [validation.error]);

  const editor = useEditor(
    {
      extensions: articleExtensions,
      content: validation.document ?? EMPTY_ARTICLE_DOCUMENT,
      editable: !readOnly && validation.error === null,
      injectCSS: false,
      immediatelyRender: false,
      enableContentCheck: true,
      editorProps: {
        attributes: {
          class: "article-rich-editor__surface",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": ariaLabel ?? labels.body,
          spellcheck: "true",
          "data-locale": locale
        }
      },
      onContentError({ error }) {
        onInvalidContentRef.current?.(error);
      },
      onUpdate({ editor: nextEditor }) {
        if (applyingExternalValueRef.current) {
          return;
        }
        onChangeRef.current(nextEditor.getJSON() as ArticleDocument);
      }
    },
    []
  );

  useEffect(() => {
    editor?.setEditable(!readOnly && validation.error === null);
  }, [editor, readOnly, validation.error]);

  useEffect(() => {
    if (!editor || !validation.document) {
      return;
    }

    if (JSON.stringify(editor.getJSON()) === validatedDocumentKey) {
      return;
    }

    try {
      applyingExternalValueRef.current = true;
      editor.commands.setContent(validation.document, { emitUpdate: false, errorOnInvalidContent: true });
    } catch (error) {
      onInvalidContentRef.current?.(error);
    } finally {
      applyingExternalValueRef.current = false;
    }
  }, [editor, validatedDocumentKey, validation.document]);

  if (validation.error) {
    return (
      <section className="article-rich-editor article-rich-editor--invalid">
        <div className="article-rich-editor__error" role="alert">
          {labels.invalid}
        </div>
      </section>
    );
  }

  return (
    <section className="article-rich-editor" data-locale={locale}>
      {editor ? (
        <ArticleEditorToolbar
          editor={editor}
          locale={locale}
          {...(onRequestImage ? { onRequestImage } : {})}
        />
      ) : null}
      <EditorContent editor={editor} />
    </section>
  );
}

function ArticleEditorToolbar({
  editor,
  locale,
  onRequestImage
}: {
  editor: Editor;
  locale: Locale;
  onRequestImage?: (editor: Editor) => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => toolbarStateFromEditor(currentEditor)
  });
  const actions = useMemo(() => toolbarActionsFromEditor(editor, onRequestImage), [editor, onRequestImage]);

  return <ArticleEditorToolbarView locale={locale} state={state} actions={actions} />;
}

function toolbarStateFromEditor(editor: Editor): ArticleEditorToolbarState {
  return {
    isEditable: editor.isEditable,
    isParagraph: editor.isActive("paragraph"),
    isHeading2: editor.isActive("heading", { level: 2 }),
    isHeading3: editor.isActive("heading", { level: 3 }),
    isBold: editor.isActive("bold"),
    isItalic: editor.isActive("italic"),
    isStrike: editor.isActive("strike"),
    isCode: editor.isActive("code"),
    isBulletList: editor.isActive("bulletList"),
    isOrderedList: editor.isActive("orderedList"),
    isBlockquote: editor.isActive("blockquote"),
    isCodeBlock: editor.isActive("codeBlock"),
    isLink: editor.isActive("link"),
    isInTable: editor.isActive("table"),
    canUndo: canRun(editor, (chain) => chain.undo()),
    canRedo: canRun(editor, (chain) => chain.redo()),
    codeLanguage: String(editor.getAttributes("codeBlock").language ?? "plaintext"),
    linkHref: String(editor.getAttributes("link").href ?? "")
  };
}

function canRun(editor: Editor, command: (chain: ReturnType<ReturnType<Editor["can"]>["chain"]>) => unknown): boolean {
  try {
    const result = command(editor.can().chain().focus()) as { run?: () => boolean };
    return result.run?.() ?? false;
  } catch {
    return false;
  }
}

function toolbarActionsFromEditor(editor: Editor, onRequestImage?: (editor: Editor) => void): ArticleEditorToolbarActions {
  return {
    setParagraph: () => editor.chain().focus().setParagraph().run(),
    setHeading: (level) => editor.chain().focus().toggleHeading({ level }).run(),
    toggleBold: () => editor.chain().focus().toggleBold().run(),
    toggleItalic: () => editor.chain().focus().toggleItalic().run(),
    toggleStrike: () => editor.chain().focus().toggleStrike().run(),
    toggleCode: () => editor.chain().focus().toggleCode().run(),
    toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
    toggleBlockquote: () => editor.chain().focus().toggleBlockquote().run(),
    setLink: (href) => editor.chain().focus().extendMarkRange("link").setLink({ href }).run(),
    unsetLink: () => editor.chain().focus().extendMarkRange("link").unsetLink().run(),
    setCodeBlockLanguage: (language) =>
      editor.chain().focus().setCodeBlock({ language: language === "plaintext" ? "" : language }).run(),
    requestImage: () => onRequestImage?.(editor),
    insertTable: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    addTableRow: () => editor.chain().focus().addRowAfter().run(),
    deleteTableRow: () => editor.chain().focus().deleteRow().run(),
    addTableColumn: () => editor.chain().focus().addColumnAfter().run(),
    deleteTableColumn: () => editor.chain().focus().deleteColumn().run(),
    insertHorizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run()
  };
}

export function ArticleEditorToolbarView({
  locale,
  state,
  actions
}: {
  locale: Locale;
  state: ArticleEditorToolbarState;
  actions: ArticleEditorToolbarActions;
}) {
  const labels = editorLabels(locale);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [href, setHref] = useState(state.linkHref);
  const disabled = !state.isEditable;

  useEffect(() => {
    setHref(state.linkHref);
  }, [state.linkHref]);

  function applyLink() {
    const nextHref = href.trim();
    if (nextHref) {
      actions.setLink(nextHref);
    } else {
      actions.unsetLink();
    }
    setIsLinkOpen(false);
  }

  return (
    <div className="article-rich-editor__toolbar" role="toolbar" aria-label={labels.toolbar}>
      <div className="article-rich-editor__toolbar-group">
        <ToolbarButton label={labels.paragraph} pressed={state.isParagraph} disabled={disabled} onClick={actions.setParagraph} />
        <ToolbarButton label={labels.heading2} pressed={state.isHeading2} disabled={disabled} onClick={() => actions.setHeading(2)} />
        <ToolbarButton label={labels.heading3} pressed={state.isHeading3} disabled={disabled} onClick={() => actions.setHeading(3)} />
      </div>
      <div className="article-rich-editor__toolbar-group">
        <ToolbarButton label={labels.bold} pressed={state.isBold} disabled={disabled} onClick={actions.toggleBold} />
        <ToolbarButton label={labels.italic} pressed={state.isItalic} disabled={disabled} onClick={actions.toggleItalic} />
        <ToolbarButton label={labels.strike} pressed={state.isStrike} disabled={disabled} onClick={actions.toggleStrike} />
        <ToolbarButton label={labels.code} pressed={state.isCode} disabled={disabled} onClick={actions.toggleCode} />
      </div>
      <div className="article-rich-editor__toolbar-group">
        <ToolbarButton label={labels.bulletList} pressed={state.isBulletList} disabled={disabled} onClick={actions.toggleBulletList} />
        <ToolbarButton label={labels.orderedList} pressed={state.isOrderedList} disabled={disabled} onClick={actions.toggleOrderedList} />
        <ToolbarButton label={labels.blockquote} pressed={state.isBlockquote} disabled={disabled} onClick={actions.toggleBlockquote} />
      </div>
      <div className="article-rich-editor__toolbar-group article-rich-editor__toolbar-group--link">
        <ToolbarButton
          label={labels.link}
          pressed={state.isLink || isLinkOpen}
          disabled={disabled}
          onClick={() => setIsLinkOpen((current) => !current)}
          expanded={isLinkOpen}
        />
        {isLinkOpen ? (
          <form
            className="article-rich-editor__link-popover"
            aria-label={labels.link}
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            <input
              aria-label={labels.linkUrl}
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="https://example.com"
            />
            <button type="submit">{labels.applyLink}</button>
            <button
              type="button"
              onClick={() => {
                actions.unsetLink();
                setHref("");
                setIsLinkOpen(false);
              }}
            >
              {labels.removeLink}
            </button>
          </form>
        ) : null}
      </div>
      <div className="article-rich-editor__toolbar-group">
        <label className="article-rich-editor__select-label">
          <span>{labels.codeBlock}</span>
          <select
            aria-label={labels.codeBlock}
            value={state.codeLanguage}
            disabled={disabled}
            onChange={(event) => actions.setCodeBlockLanguage(event.target.value)}
          >
            {CODE_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <ToolbarButton label={labels.image} disabled={disabled} onClick={actions.requestImage} />
        <ToolbarButton label={labels.horizontalRule} disabled={disabled} onClick={actions.insertHorizontalRule} />
      </div>
      <div className="article-rich-editor__toolbar-group">
        <ToolbarButton label={labels.table} disabled={disabled} onClick={actions.insertTable} />
        <ToolbarButton label={labels.addRow} disabled={disabled || !state.isInTable} onClick={actions.addTableRow} />
        <ToolbarButton label={labels.deleteRow} disabled={disabled || !state.isInTable} onClick={actions.deleteTableRow} />
        <ToolbarButton label={labels.addColumn} disabled={disabled || !state.isInTable} onClick={actions.addTableColumn} />
        <ToolbarButton label={labels.deleteColumn} disabled={disabled || !state.isInTable} onClick={actions.deleteTableColumn} />
      </div>
      <div className="article-rich-editor__toolbar-group">
        <ToolbarButton label={labels.undo} disabled={disabled || !state.canUndo} onClick={actions.undo} />
        <ToolbarButton label={labels.redo} disabled={disabled || !state.canRedo} onClick={actions.redo} />
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  pressed,
  expanded,
  disabled,
  onClick
}: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
