// Worker pool for whole files, as the CLI’s directory runs need them
//
// This pools one kind of work—read a file, minify it, write it—rather than arbitrary
// tasks: The worker body, the message contract, and the result are all about files. The
// spawning and queueing below would generalize, but nothing else asks for it yet.
//
// Minifying a document is CPU-bound work on one thread, so a run over a directory
// serializes no matter how the files are awaited. Whole files are the unit handed to
// workers, which is what makes threads pay here: A document takes long enough that the
// thread it crosses costs a fraction of a percent, and files share no state, so nothing
// travels but paths, options, and the resulting sizes.
//
// Scaling is bounded by what each thread has to re-learn rather than by the cores: Every
// worker runs its own isolate and warms up its own JIT, so the useful worker count tops
// out well short of the core count.
//
// Node-only: cli.js loads this module lazily and minifies in process wherever worker
// threads are unavailable or the options can’t cross a structured clone.

import fs from 'node:fs';
import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';

// This module is its own worker entry point: The pool spawns it by URL and the branch
// below runs in the spawned copy. Keeping both halves in one file keeps the message
// contract in one place. The minifier is imported dynamically so that loading the
// pool on the main thread doesn’t drag it in; only workers ever pay for it.
if (!isMainThread && parentPort) {
  const port = parentPort;
  const { minify } = await import('../htmlminifier.js');
  const { options } = workerData;

  // The pool hands a worker one file at a time, so the file a diagnostic belongs to is
  // simply the one in hand
  let fileCurrent = '';

  // `log` cannot cross a structured clone, so it is rebuilt here and forwarded. Whether
  // the minifier logged an `Error` travels with the message: The CLI words those
  // differently, and an error that crossed as a plain string would lose that wording.
  const taskOptions = {
    ...options,
    log: (/** @type {unknown} */ message) => port.postMessage({
      log: message instanceof Error ? message.message : String(message),
      logIsError: message instanceof Error,
      logFile: fileCurrent
    })
  };

  port.on('message', async (/** @type {{id: number, inputFile: string, outputFile: string, dryRun: boolean}} */ task) => {
    try {
      fileCurrent = task.inputFile;
      const data = await fs.promises.readFile(task.inputFile, 'utf8');
      const minified = await minify(data, taskOptions);
      if (!task.dryRun) {
        await fs.promises.writeFile(task.outputFile, minified, 'utf8');
      }
      port.postMessage({
        id: task.id,
        originalSize: Buffer.byteLength(data, 'utf8'),
        minifiedSize: Buffer.byteLength(minified, 'utf8')
      });
    } catch (err) {
      port.postMessage({ id: task.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

const urlWorker = new URL(import.meta.url);

/**
 * @param {object} args
 * @param {import('../htmlminifier.js').MinifierOptions} args.options
 * @param {number} args.size
 * @param {((message: string, isError: boolean, file: string) => void) | undefined} [args.onLog]
 */
export function createFilePool({ options, size, onLog }) {
  /** @type {Worker[]} */
  const workers = [];
  /** @type {Worker[]} */
  const idle = [];
  /** @type {Map<number, {resolve: (value: {originalSize: number, minifiedSize: number}) => void, reject: (reason: Error) => void}>} */
  const pending = new Map();
  /** @type {{task: object, resolve: Function, reject: Function}[]} */
  const queue = [];
  let idNext = 0;
  /** @type {Error | null} */
  let failure = null;

  // A worker that dies takes its task with it, and any task still queued would wait for a
  // turn that never comes; both are failed at once so the run ends rather than hangs
  const failAll = (/** @type {Error} */ err) => {
    failure = err;
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
    for (const item of queue.splice(0)) item.reject(err);
  };

  for (let i = 0; i < size; i++) {
    // Workers inherit the parent’s `execArgv`, which can carry flags that are invalid for
    // a module worker and would kill it on startup
    const worker = new Worker(urlWorker, { workerData: { options }, execArgv: [] });
    worker.unref();
    worker.on('message', (/** @type {{id?: number, log?: string, logIsError?: boolean, logFile?: string, error?: string, originalSize?: number, minifiedSize?: number}} */ message) => {
      if (message.log !== undefined) {
        onLog?.(message.log, Boolean(message.logIsError), message.logFile ?? '');
        return;
      }
      const entry = pending.get(/** @type {number} */ (message.id));
      pending.delete(/** @type {number} */ (message.id));
      idle.push(worker);
      if (!pending.size && !queue.length) worker.unref();
      drain();
      if (!entry) return;
      if (message.error !== undefined) entry.reject(new Error(message.error));
      else entry.resolve({ originalSize: message.originalSize ?? 0, minifiedSize: message.minifiedSize ?? 0 });
    });
    worker.on('error', failAll);
    workers.push(worker);
    idle.push(worker);
  }

  function drain() {
    while (idle.length && queue.length) {
      const worker = /** @type {Worker} */ (idle.pop());
      const item = /** @type {{task: object, resolve: Function, reject: Function}} */ (queue.shift());
      const id = idNext++;
      pending.set(id, /** @type {any} */ ({ resolve: item.resolve, reject: item.reject }));
      // Only a worker with something outstanding may hold the process open
      worker.ref();
      worker.postMessage({ ...item.task, id });
    }
  }

  return {
    /**
     * @param {{inputFile: string, outputFile: string, dryRun: boolean}} task
     * @returns {Promise<{originalSize: number, minifiedSize: number}>}
     */
    run(task) {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject });
        drain();
      });
    },
    async close() {
      await Promise.all(workers.map(worker => worker.terminate()));
    }
  };
}