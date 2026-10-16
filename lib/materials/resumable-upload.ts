/** Keep every app request below hosting request-body limits. */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const RESUMABLE_UPLOAD_THRESHOLD = 8 * 1024 * 1024;

type Progress = { offset: number; done: boolean };

/** Query committed bytes after a lost response; never guess how much arrived. */
export async function sendUploadChunks(
  blob: Blob,
  send: (chunk: Blob, offset: number) => Promise<Progress>,
  status: () => Promise<Progress>,
): Promise<void> {
  let offset = 0;
  let failures = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, blob.size);
    let progress: Progress;
    try {
      progress = await send(blob.slice(offset, end), offset);
    } catch (error) {
      failures += 1;
      if (failures > 3) throw error;
      let recovered: Progress | undefined;
      for (let probe = 0; probe < 3; probe += 1) {
        try {
          recovered = await status();
          break;
        } catch {
          if (probe === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, (probe + 1) * 300));
        }
      }
      if (!recovered) throw error;
      progress = recovered;
      // Avoid a tight retry loop during a temporary network failure.
      if (progress.offset === offset && !progress.done) {
        await new Promise((resolve) => setTimeout(resolve, failures * 300));
        continue;
      }
    }
    if (!Number.isSafeInteger(progress.offset) || progress.offset <= offset || progress.offset > end ||
        progress.done !== (progress.offset === blob.size)) {
      throw new Error("Invalid upload progress. Please retry the file.");
    }
    offset = progress.offset;
    failures = 0;
  }
}
