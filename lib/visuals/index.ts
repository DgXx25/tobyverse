export { visualBlockSchema, visualBlockListSchema, notesDocumentSchema } from "@/lib/visuals/schemas";
export { parseVisualBlock, parseNoteBlock, parseNoteBlocks, validNoteBlocks, blockPreviewText } from "@/lib/visuals/validate";
export { visualFromId, renderFormula, catalogIconId, CATALOG_ICON_IDS, CATALOG_ELEMENT_IDS, isCatalogKind } from "@/lib/visuals/catalog";
export {
  splitLatexParts,
  splitRichParts,
  splitChatFences,
  splitCodeFences,
  splitDisplayMath,
  protectInlineMath,
  restoreInlineMath,
  scrubLeakedMarkup,
  unwrapLatex,
  isLatexSource,
} from "@/lib/visuals/math";
export { htmlToMarkdown, looksLikeHtml, scrubInlineHtml } from "@/lib/visuals/html-rich";
