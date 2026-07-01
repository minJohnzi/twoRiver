import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { uploadAdminPostImage, type UploadedImage } from "../api/admin";

export const ARTICLE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export interface ImageInsertContext {
  editor: Editor;
  position?: number;
  altText?: string;
}

export interface ArticleImageUploadController {
  isUploading: boolean;
  chooseFile: (file: File, context: ImageInsertContext) => Promise<void>;
  onPasteFiles: (files: File[], editor: Editor) => void;
  onDropFiles: (files: File[], position: number, editor: Editor) => void;
}

export interface UseArticleImageUploadOptions {
  postUid: string | null | undefined;
  upload?: (input: { postUid: string; file: File }) => Promise<UploadedImage>;
  onNotice?: (message: string) => void;
}

export function sanitizeArticleImageAltText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\]/g, ")").replace(/\s+/g, " ").trim();
}

export function useArticleImageUpload({
  postUid,
  upload = uploadAdminPostImage,
  onNotice
}: UseArticleImageUploadOptions): ArticleImageUploadController {
  const [isUploading, setIsUploading] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const chooseFile = useCallback(
    async (file: File, context: ImageInsertContext) => {
      if (!ARTICLE_IMAGE_MIME_TYPES.includes(file.type as (typeof ARTICLE_IMAGE_MIME_TYPES)[number])) {
        onNotice?.("Unsupported image type.");
        return;
      }
      if (!postUid) {
        onNotice?.("Save the post before inserting images.");
        return;
      }
      if (inFlightRef.current) {
        onNotice?.("An image upload is already in progress.");
        return inFlightRef.current;
      }

      const uploadTask = (async () => {
        setIsUploading(true);
        const insertPosition = context.position ?? context.editor.state.selection.from;
        try {
          const result = await upload({ postUid, file });
          const position = clampInsertPosition(context.editor, insertPosition);
          context.editor.commands.insertContentAt(position, {
            type: "image",
            attrs: {
              src: result.url,
              alt: sanitizeArticleImageAltText(context.altText ?? file.name.replace(/\.[^.]+$/, "")),
              title: null
            }
          });
          onNotice?.("Image inserted.");
        } catch {
          onNotice?.("Image upload failed.");
        } finally {
          setIsUploading(false);
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = uploadTask;
      return uploadTask;
    },
    [onNotice, postUid, upload]
  );

  const onPasteFiles = useCallback(
    (files: File[], editor: Editor) => {
      const file = files.find((item) => ARTICLE_IMAGE_MIME_TYPES.includes(item.type as (typeof ARTICLE_IMAGE_MIME_TYPES)[number]));
      if (file) {
        void chooseFile(file, { editor, position: editor.state.selection.from });
      }
    },
    [chooseFile]
  );

  const onDropFiles = useCallback(
    (files: File[], position: number, editor: Editor) => {
      const file = files.find((item) => ARTICLE_IMAGE_MIME_TYPES.includes(item.type as (typeof ARTICLE_IMAGE_MIME_TYPES)[number]));
      if (file) {
        void chooseFile(file, { editor, position });
      }
    },
    [chooseFile]
  );

  return { isUploading, chooseFile, onPasteFiles, onDropFiles };
}

function clampInsertPosition(editor: Editor, position: number): number {
  const maxPosition = editor.state.doc.content.size;
  if (!Number.isFinite(position)) {
    return maxPosition;
  }
  return Math.max(0, Math.min(position, maxPosition));
}
