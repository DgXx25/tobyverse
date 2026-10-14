export { inferMaterialType, materialFileName, MATERIAL_FILE_ACCEPT, COMPOSER_FILE_ACCEPT } from "@/lib/materials/types";
export {
  PREVIEW_MAX_CHARS,
  EXTRACT_MAX_CHARS,
  CHAT_EXCERPT_CHARS,
  CHAT_MATERIAL_LIMIT,
  SHEET_EXCERPT_CHARS,
  SHEET_TOTAL_CHARS,
  MAX_UPLOAD_BYTES,
  previewText,
  clipText,
} from "@/lib/materials/limits";
export {
  originalStoragePath,
  extractedTextPath,
  uploadMaterialBytes,
  uploadExtractedText,
  readExtractedText,
  loadMaterialText,
  deleteStoragePath,
} from "@/lib/materials/storage";
export {
  subscribeMaterials,
  listMaterials,
  countMaterials,
  waitForMaterialPreviews,
  deleteMaterialDoc,
  newMaterialRef,
  writeMaterialDoc,
} from "@/lib/materials/store";
export { removeMaterial, removeLibraryMaterial } from "@/lib/materials/save";
export { ingestMaterial, ingestMaterialFile, ingestMaterialPaste, ingestMaterialUrl } from "@/lib/materials/ingest-client";
export { pickRelevantMaterials, toChatExcerpt } from "@/lib/materials/relevance";
export { excerptsForChat } from "@/lib/materials/chat-context";
