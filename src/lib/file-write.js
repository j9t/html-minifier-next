/**
 * Output writing for the CLI, shared by in-process runs and the worker pool
 */

import fs from 'node:fs';
import path from 'node:path';
import { threadId } from 'node:worker_threads';

let writeCounter = 0;

/**
 * Write a file by way of a temporary file in the same folder, so that an exit
 * that leaves no chance to clean up—a native crash in a minifier, an OOM
 * kill—cannot leave a half-written file where the output belongs
 * @param {string} outputFile
 * @param {string} data
 */
export async function writeFileAtomic(outputFile, data) {
  // A rename would replace a symlink itself, so work on the file it points to
  const targetFile = await fs.promises.realpath(outputFile).catch(() => outputFile);
  // Workers share the process ID, so the thread ID keeps their temporary files apart
  const tempFile = path.join(path.dirname(targetFile), `.${path.basename(targetFile)}.${process.pid}.${threadId}.${writeCounter++}.tmp`);
  // The rename replaces the output rather than writing through it, so a mode set on the output has to be carried over
  const stats = await fs.promises.stat(targetFile).catch(() => undefined);
  const mode = stats ? stats.mode & 0o7777 : undefined;

  try {
    await fs.promises.writeFile(tempFile, data, { encoding: 'utf8', mode });
    // `mode` on creation is subject to the umask, so the exact bits have to be set separately
    if (mode !== undefined) {
      await fs.promises.chmod(tempFile, mode);
    }
    await fs.promises.rename(tempFile, targetFile);
  } catch (err) {
    await fs.promises.rm(tempFile, { force: true });
    throw err;
  }
}