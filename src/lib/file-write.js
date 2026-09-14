/**
 * Output writing for the CLI, shared by in-process runs and the worker pool
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// A random name is taken by chance only, so a few attempts are plenty
const ATTEMPTS_MAX = 10;
// As many links as a system commonly follows before reporting a loop
const LINKS_MAX = 40;

/**
 * The file a write replaces: the output itself or, for a symlink, the file it
 * points to—followed by hand where that file does not exist yet, which
 * `realpath` cannot resolve
 * @param {string} outputFile
 * @returns {Promise<string>}
 */
async function resolveTarget(outputFile) {
  let file = outputFile;
  for (let i = 0; i < LINKS_MAX; i++) {
    try {
      return await fs.promises.realpath(file);
    } catch {
      const link = await fs.promises.readlink(file).catch(() => undefined);
      if (link === undefined) return file;
      // A relative link is read from the real location of its folder
      const dir = await fs.promises.realpath(path.dirname(file)).catch(() => path.dirname(file));
      file = path.resolve(dir, link);
    }
  }
  return outputFile;
}

/**
 * Create a temporary file next to the target under a random name, exclusively,
 * so that it can neither be predicted nor write through a file or link already there
 * @param {string} targetFile
 * @param {number | undefined} mode
 */
async function openTempFile(targetFile, mode) {
  for (let attempt = 1; ; attempt++) {
    const tempFile = path.join(path.dirname(targetFile), `.${path.basename(targetFile)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
    try {
      return { tempFile, handle: await fs.promises.open(tempFile, 'wx', mode) };
    } catch (err) {
      if (/** @type {any} */ (err).code !== 'EEXIST' || attempt >= ATTEMPTS_MAX) throw err;
    }
  }
}

/**
 * Write a file by way of a temporary file in the same folder, so that an exit
 * that leaves no chance to clean up—a native crash in a minifier, an OOM
 * kill—cannot leave a half-written file where the output belongs
 * @param {string} outputFile
 * @param {string} data
 */
export async function writeFileAtomic(outputFile, data) {
  // A rename would replace a symlink itself, so work on the file it points to
  const targetFile = await resolveTarget(outputFile);
  // The rename replaces the output rather than writing through it, so a mode set on the output has to be carried over
  const stats = await fs.promises.stat(targetFile).catch(() => undefined);
  const mode = stats ? stats.mode & 0o7777 : undefined;

  // Outside the `try`, so that only a file this write created is ever removed
  const { tempFile, handle } = await openTempFile(targetFile, mode);

  try {
    try {
      await handle.writeFile(data, 'utf8');
    } finally {
      await handle.close();
    }
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