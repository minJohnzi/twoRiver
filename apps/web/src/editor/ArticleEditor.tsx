import { articleExtensions } from "@tworiver/content-engine/editor";
import { validateArticleDocument, type ArticleDocument } from "@tworiver/content-engine/browser";
import type { Locale } from "@tworiver/shared";
import { FileHandler } from "@tiptap/extension-file-handler";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  ARTICLE_IMAGE_MIME_TYPES,
  type ArticleImageUploadController,
  type ImageInsertContext
} from "./useArticleImageUpload";

export interface ArticleEditorProps {
  value: ArticleDocument;
  locale: Locale;
  onChange: (value: ArticleDocument) => void;
  onInvalidContent?: (error: unknown) => void;
  onRequestImage?: (editor: Editor) => void;
  imageUploadController?: ArticleImageUploadController;
  imageUploadNotice?: string | null;
  readOnly?: boolean;
  ariaLabel?: string;
}

export interface ArticleEditorToolbarState {
  isEditable: boolean;
  isParagraph: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  isHeading4: boolean;
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
  hasSelection: boolean;
  isFocused: boolean;
  isEmptyParagraph: boolean;
}

export interface ArticleEditorToolbarActions {
  setParagraph: () => void;
  setHeading: (level: 2 | 3 | 4) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleStrike: () => void;
  toggleCode: () => void;
  toggleCodeBlock: () => void;
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

const CODE_LANGUAGES = [
  "plaintext",
  "ts",
  "tsx",
  "js",
  "jsx",
  "python",
  "bash",
  "json",
  "yaml",
  "scss",
  "css",
  "html",
  "md",
  "sql",
  "go",
  "rust",
  "java",
  "mermaid"
] as const;

function editorLabels(locale: Locale) {
  if (locale === "zh") {
    return {
      body: "文章正文",
      invalid: "文章内容无法载入，请重新加载或恢复兼容 Markdown。",
      toolbar: "富文本编辑工具栏",
      paragraph: "正文",
      heading2: "二级标题",
      heading3: "三级标题",
      heading4: "四级标题",
      bold: "加粗",
      italic: "斜体",
      strike: "删除线",
      code: "行内代码",
      codeBlock: "代码块",
      bulletList: "无序列表",
      orderedList: "有序列表",
      blockquote: "引用",
      link: "链接",
      linkUrl: "链接地址",
      applyLink: "应用链接",
      removeLink: "移除链接",
      codeBlockLanguage: "代码块语言",
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
    heading4: "Heading 4",
    bold: "Bold",
    italic: "Italic",
    strike: "Strike",
    code: "Inline code",
    codeBlock: "Code block",
    bulletList: "Bullet list",
    orderedList: "Ordered list",
    blockquote: "Quote",
    link: "Link",
    linkUrl: "Link URL",
    applyLink: "Apply link",
    removeLink: "Remove link",
    codeBlockLanguage: "Code block language",
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
  imageUploadController,
  imageUploadNotice,
  readOnly = false,
  ariaLabel
}: ArticleEditorProps) {
  const labels = editorLabels(locale);
  const validation = useMemo(() => validateEditorValue(value), [value]);
  const validatedDocumentKey = serializeDocument(validation.document);
  const onChangeRef = useRef(onChange);
  const onInvalidContentRef = useRef(onInvalidContent);
  const imageUploadControllerRef = useRef(imageUploadController);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageContextRef = useRef<ImageInsertContext | null>(null);
  const applyingExternalValueRef = useRef(false);
  const hasImageUploadController = Boolean(imageUploadController);

  const editorExtensions = useMemo(
    () => {
      if (!hasImageUploadController) {
        return articleExtensions;
      }

      return [
        ...articleExtensions,
        FileHandler.configure({
          allowedMimeTypes: [...ARTICLE_IMAGE_MIME_TYPES],
          onPaste(currentEditor, files) {
            imageUploadControllerRef.current?.onPasteFiles(files, currentEditor);
          },
          onDrop(currentEditor, files, position) {
            imageUploadControllerRef.current?.onDropFiles(files, position, currentEditor);
          }
        })
      ];
    },
    [hasImageUploadController]
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInvalidContentRef.current = onInvalidContent;
  }, [onInvalidContent]);

  useEffect(() => {
    imageUploadControllerRef.current = imageUploadController;
  }, [imageUploadController]);

  useEffect(() => {
    if (validation.error) {
      onInvalidContentRef.current?.(validation.error);
    }
  }, [validation.error]);

  const editor = useEditor(
    {
      extensions: editorExtensions,
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
    [editorExtensions]
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

  const handleRequestImage = useCallback(
    (currentEditor: Editor) => {
      if (imageUploadControllerRef.current) {
        pendingImageContextRef.current = {
          editor: currentEditor,
          position: currentEditor.state.selection.from
        };
        imageInputRef.current?.click();
        return;
      }

      onRequestImage?.(currentEditor);
    },
    [onRequestImage]
  );

  const handleImageInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    const context = pendingImageContextRef.current;
    pendingImageContextRef.current = null;

    if (!file || !context) {
      return;
    }

    void imageUploadControllerRef.current?.chooseFile(file, context);
  }, []);

  if (validation.error) {
    return (
      <section className="article-rich-editor article-rich-editor--invalid">
        <div className="article-rich-editor__error" role="alert">
          {labels.invalid}
        </div>
      </section>
    );
  }

  const uploadNotice =
    imageUploadNotice ??
    (imageUploadController?.isUploading ? (locale === "zh" ? "图片上传中…" : "Uploading image…") : null);

  return (
    <section className="article-rich-editor" data-locale={locale}>
      {editor ? (
        <ArticleEditorToolbar
          editor={editor}
          locale={locale}
          onRequestImage={handleRequestImage}
          isImageUploading={imageUploadController?.isUploading ?? false}
        />
      ) : null}
      <input
        ref={imageInputRef}
        className="article-rich-editor__file-input"
        type="file"
        accept={ARTICLE_IMAGE_MIME_TYPES.join(",")}
        onChange={handleImageInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />
      {uploadNotice ? (
        <p className="article-rich-editor__notice" role="status">
          {uploadNotice}
        </p>
      ) : null}
      <EditorContent editor={editor} />
    </section>
  );
}

function ArticleEditorToolbar({
  editor,
  locale,
  onRequestImage,
  isImageUploading = false
}: {
  editor: Editor;
  locale: Locale;
  onRequestImage?: (editor: Editor) => void;
  isImageUploading?: boolean;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => toolbarStateFromEditor(currentEditor)
  });
  const actions = useMemo(() => toolbarActionsFromEditor(editor, onRequestImage), [editor, onRequestImage]);

  return (
    <>
      <ArticleEditorBubbleMenu editor={editor} locale={locale} state={state} actions={actions} />
      <ArticleEditorInsertMenu editor={editor} locale={locale} state={state} actions={actions} isImageUploading={isImageUploading} />
      <ArticleEditorToolbarView locale={locale} state={state} actions={actions} isImageUploading={isImageUploading} />
    </>
  );
}

function toolbarStateFromEditor(editor: Editor): ArticleEditorToolbarState {
  return {
    isEditable: editor.isEditable,
    isParagraph: editor.isActive("paragraph"),
    isHeading2: editor.isActive("heading", { level: 2 }),
    isHeading3: editor.isActive("heading", { level: 3 }),
    isHeading4: editor.isActive("heading", { level: 4 }),
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
    linkHref: String(editor.getAttributes("link").href ?? ""),
    hasSelection: !editor.state.selection.empty,
    isFocused: editor.isFocused,
    isEmptyParagraph:
      editor.isActive("paragraph") &&
      editor.state.selection.empty &&
      editor.state.selection.$from.parent.type.name === "paragraph" &&
      editor.state.selection.$from.parent.content.size === 0
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
    toggleCodeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
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
  actions,
  isImageUploading = false
}: {
  locale: Locale;
  state: ArticleEditorToolbarState;
  actions: ArticleEditorToolbarActions;
  isImageUploading?: boolean;
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
      <div className="article-rich-editor__toolbar-group" role="group" aria-label={locale === "zh" ? "段落样式" : "Block style"}>
        <ToolbarButton label={labels.paragraph} shortLabel="P" pressed={state.isParagraph} disabled={disabled} onClick={actions.setParagraph} />
        <ToolbarButton label={labels.heading2} shortLabel="H2" pressed={state.isHeading2} disabled={disabled} onClick={() => actions.setHeading(2)} />
        <ToolbarButton label={labels.heading3} shortLabel="H3" pressed={state.isHeading3} disabled={disabled} onClick={() => actions.setHeading(3)} />
        <ToolbarButton label={labels.heading4} shortLabel="H4" pressed={state.isHeading4} disabled={disabled} onClick={() => actions.setHeading(4)} />
      </div>
      <div className="article-rich-editor__toolbar-group" role="group" aria-label={locale === "zh" ? "行内格式" : "Inline formatting"}>
        <ToolbarButton label={labels.bold} shortLabel="B" pressed={state.isBold} disabled={disabled} onClick={actions.toggleBold} />
        <ToolbarButton label={labels.italic} shortLabel="I" pressed={state.isItalic} disabled={disabled} onClick={actions.toggleItalic} />
        <ToolbarButton label={labels.strike} shortLabel="S" pressed={state.isStrike} disabled={disabled} onClick={actions.toggleStrike} />
        <ToolbarButton label={labels.code} shortLabel="</>" pressed={state.isCode} disabled={disabled} onClick={actions.toggleCode} />
      </div>
      <div className="article-rich-editor__toolbar-group" role="group" aria-label={locale === "zh" ? "块格式" : "Block formatting"}>
        <ToolbarButton label={labels.bulletList} shortLabel="•" pressed={state.isBulletList} disabled={disabled} onClick={actions.toggleBulletList} />
        <ToolbarButton label={labels.orderedList} shortLabel="1." pressed={state.isOrderedList} disabled={disabled} onClick={actions.toggleOrderedList} />
        <ToolbarButton label={labels.blockquote} shortLabel="“" pressed={state.isBlockquote} disabled={disabled} onClick={actions.toggleBlockquote} />
        <ToolbarButton label={labels.horizontalRule} shortLabel="—" disabled={disabled} onClick={actions.insertHorizontalRule} />
      </div>
      <div className="article-rich-editor__toolbar-group article-rich-editor__toolbar-group--link" role="group" aria-label={labels.link}>
        <ToolbarButton
          label={labels.link}
          shortLabel={locale === "zh" ? "链接" : "Link"}
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
      <div className="article-rich-editor__toolbar-group" role="group" aria-label={locale === "zh" ? "插入" : "Insert"}>
        <ToolbarButton label={labels.image} shortLabel={locale === "zh" ? "图片" : "Image"} disabled={disabled || isImageUploading} onClick={actions.requestImage} />
        <ToolbarButton label={labels.codeBlock} shortLabel={locale === "zh" ? "代码" : "Code"} pressed={state.isCodeBlock} disabled={disabled} onClick={actions.toggleCodeBlock} />
        <label className="article-rich-editor__select-label article-rich-editor__select-label--compact">
          <span>{locale === "zh" ? "语言" : "Lang"}</span>
          <select
            aria-label={labels.codeBlockLanguage}
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
      </div>
      <div className="article-rich-editor__toolbar-group" role="group" aria-label={locale === "zh" ? "表格" : "Table"}>
        <ToolbarButton label={labels.table} shortLabel={locale === "zh" ? "表格" : "Table"} disabled={disabled} onClick={actions.insertTable} />
        <ToolbarButton label={labels.addRow} shortLabel="+R" disabled={disabled || !state.isInTable} onClick={actions.addTableRow} />
        <ToolbarButton label={labels.deleteRow} shortLabel="-R" disabled={disabled || !state.isInTable} onClick={actions.deleteTableRow} />
        <ToolbarButton label={labels.addColumn} shortLabel="+C" disabled={disabled || !state.isInTable} onClick={actions.addTableColumn} />
        <ToolbarButton label={labels.deleteColumn} shortLabel="-C" disabled={disabled || !state.isInTable} onClick={actions.deleteTableColumn} />
      </div>
      <div className="article-rich-editor__toolbar-group" role="group" aria-label={locale === "zh" ? "历史" : "History"}>
        <ToolbarButton label={labels.undo} shortLabel="↶" disabled={disabled || !state.canUndo} onClick={actions.undo} />
        <ToolbarButton label={labels.redo} shortLabel="↷" disabled={disabled || !state.canRedo} onClick={actions.redo} />
      </div>
    </div>
  );
}

function ArticleEditorBubbleMenu({
  editor,
  locale,
  state,
  actions
}: {
  editor: Editor;
  locale: Locale;
  state: ArticleEditorToolbarState;
  actions: ArticleEditorToolbarActions;
}) {
  const labels = editorLabels(locale);
  const disabled = !state.isEditable;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="article-selection-bubble-menu"
      className="article-rich-editor__bubble-menu"
      role="toolbar"
      aria-label={locale === "zh" ? "Selection formatting" : "Selection formatting"}
      shouldShow={({ editor: currentEditor, state: currentState }) =>
        currentEditor.isEditable && currentEditor.isFocused && !currentState.selection.empty
      }
    >
      <ToolbarButton label={labels.bold} shortLabel="B" pressed={state.isBold} disabled={disabled} onClick={actions.toggleBold} />
      <ToolbarButton label={labels.italic} shortLabel="I" pressed={state.isItalic} disabled={disabled} onClick={actions.toggleItalic} />
      <ToolbarButton label={labels.link} shortLabel={locale === "zh" ? "Link" : "Link"} pressed={state.isLink} disabled={disabled} onClick={() => actions.setLink(state.linkHref || "https://")} />
      <ToolbarButton label={labels.heading2} shortLabel="H2" pressed={state.isHeading2} disabled={disabled} onClick={() => actions.setHeading(2)} />
      <ToolbarButton label={labels.blockquote} shortLabel=">" pressed={state.isBlockquote} disabled={disabled} onClick={actions.toggleBlockquote} />
      <ToolbarButton label={labels.code} shortLabel="</>" pressed={state.isCode} disabled={disabled} onClick={actions.toggleCode} />
    </BubbleMenu>
  );
}

function ArticleEditorInsertMenu({
  editor,
  locale,
  state,
  actions,
  isImageUploading = false
}: {
  editor: Editor;
  locale: Locale;
  state: ArticleEditorToolbarState;
  actions: ArticleEditorToolbarActions;
  isImageUploading?: boolean;
}) {
  const labels = editorLabels(locale);
  const disabled = !state.isEditable;

  return (
    <FloatingMenu
      editor={editor}
      pluginKey="article-empty-block-insert-menu"
      className="article-rich-editor__insert-menu"
      role="toolbar"
      aria-label={locale === "zh" ? "Insert block" : "Insert block"}
      shouldShow={({ editor: currentEditor, state: currentState }) => {
        const { selection } = currentState;
        return (
          currentEditor.isEditable &&
          currentEditor.isFocused &&
          selection.empty &&
          currentEditor.isActive("paragraph") &&
          selection.$from.parent.type.name === "paragraph" &&
          selection.$from.parent.content.size === 0
        );
      }}
    >
      <span className="article-rich-editor__slash-trigger" aria-hidden="true">/</span>
      <span className="article-rich-editor__insert-menu-label">Insert block</span>
      <ToolbarButton label={labels.image} shortLabel="+" disabled={disabled || isImageUploading} onClick={actions.requestImage} />
      <ToolbarButton label={labels.codeBlock} shortLabel="Code" pressed={state.isCodeBlock} disabled={disabled} onClick={actions.toggleCodeBlock} />
      <ToolbarButton label={labels.table} shortLabel="Table" disabled={disabled} onClick={actions.insertTable} />
      <ToolbarButton label="Mermaid" shortLabel="Mermaid" disabled={disabled} onClick={() => {
        actions.setCodeBlockLanguage("mermaid");
      }} />
      <ToolbarButton label={labels.horizontalRule} shortLabel="Divider" disabled={disabled} onClick={actions.insertHorizontalRule} />
    </FloatingMenu>
  );
}

function ToolbarButton({
  label,
  shortLabel,
  pressed,
  expanded,
  disabled,
  onClick
}: {
  label: string;
  shortLabel?: string;
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
      title={label}
      className="article-rich-editor__tool-button"
    >
      {shortLabel ?? label}
    </button>
  );
}
