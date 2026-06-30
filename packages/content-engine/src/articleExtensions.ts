import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { UniqueID } from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

export const articleExtensions = [
  StarterKit.configure({
    underline: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto"]
    }
  }),
  CodeBlockLowlight.configure({ lowlight }),
  Image.configure({ allowBase64: false, inline: false }),
  TableKit.configure({ table: { resizable: false } }),
  UniqueID.configure({
    types: ["heading"],
    generateID: () => "h_" + globalThis.crypto.randomUUID()
  })
];
