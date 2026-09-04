// Worker pool for SVGO
//
// SVGO is CPU-bound pure JavaScript, so optimizing several SVG blocks on the main
// thread serializes them no matter how they are awaited. Handing them to worker
// threads is the only way to use more than one core for this work.
//
// Node-only: options.js loads this module lazily and falls back to in-process
// SVGO wherever worker threads are unavailable (browser builds, notably) or
// wherever the pool reports itself broken.

import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';

// This module is its own worker entry point: the pool spawns it by URL and the
// branch below runs in the spawned copy. Keeping both halves in one file keeps the
// message contract—{id, svg, svgoOptions} out, {id, data | error} back—in one place.
// SVGO is imported dynamically so that loading the pool on the main thread doesn’t
// drag it in; only workers ever pay for it.
if (!isMainThread && parentPort) {
  const port = parentPort;
  const { optimize } = await import('svgo');
  port.on('message', (/** @type {{id: number, svg: string, svgoOptions: object}} */ task) => {
    try {
      port.postMessage({ id: task.id, data: optimize(task.svg, task.svgoOptions).data });
    } catch (err) {
      port.postMessage({ id: task.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

// Spawning a worker means loading SVGO in it, so keep the pool small enough that
// startup stays amortized across a realistic batch
const POOL_SIZE_MAX = 4;

// Terminate idle workers so a long-running process doesn’t hold threads open
const IDLE_TIMEOUT_MS = 10000;

const urlWorker = new URL(import.meta.url);

/** @type {{worker: Worker, busy: boolean}[]} */
const workers = [];
/** @type {Map<number, {resolve: (value: string) => void, reject: (reason: Error) => void}>} */
const pending = new Map();
/** @type {{svg: string, svgoOptions: object, resolve: (value: string) => void, reject: (reason: Error) => void}[]} */
const queue = [];

let idNext = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let timerIdle = null;

// Set when a worker fails to run at all, so callers stop paying for dispatch
// attempts that can only fail
let broken = false;

export const poolSize = Math.max(1, Math.min(availableParallelism() - 1, POOL_SIZE_MAX));

function scheduleIdleShutdown() {
  if (timerIdle) clearTimeout(timerIdle);
  timerIdle = setTimeout(() => {
    if (!queue.length && !pending.size) shutdown();
  }, IDLE_TIMEOUT_MS);
  // Never let the shutdown timer itself keep the process alive
  timerIdle.unref?.();
}

/** Terminate every worker and clear the pool */
export function shutdown() {
  if (timerIdle) {
    clearTimeout(timerIdle);
    timerIdle = null;
  }
  for (const slot of workers) slot.worker.terminate();
  workers.length = 0;
}

/**
 * Fail every outstanding task so callers can fall back rather than hang.
 * @param {Error} err
 */
function failAll(err) {
  broken = true;
  for (const [id, task] of pending) {
    pending.delete(id);
    task.reject(err);
  }
  while (queue.length) {
    const task = /** @type {NonNullable<typeof queue[number]>} */ (queue.shift());
    task.reject(err);
  }
  shutdown();
}

function spawn() {
  // `execArgv: []` keeps the parent’s CLI flags out of the worker, which would
  // otherwise refuse to start under flags that only apply to the main process
  const worker = new Worker(urlWorker, { execArgv: [] });
  const slot = { worker, busy: false };

  worker.on('message', (/** @type {{id: number, data?: string, error?: string}} */ message) => {
    const task = pending.get(message.id);
    pending.delete(message.id);
    slot.busy = false;
    if (task) {
      if (message.error !== undefined) task.reject(new Error(message.error));
      else task.resolve(/** @type {string} */ (message.data));
    }
    drain();
    if (!queue.length && !pending.size) {
      // Idle workers must not hold the process open
      for (const idle of workers) idle.worker.unref();
      scheduleIdleShutdown();
    }
  });

  // A worker that cannot run at all would strand every queued task, so treat its
  // failure as the pool’s failure and let callers fall back to in-process SVGO
  worker.on('error', (/** @type {Error} */ err) => {
    failAll(err);
  });

  // Only a worker with a task in flight keeps the process alive; see drain()
  worker.unref();
  workers.push(slot);
  return slot;
}

function drain() {
  while (queue.length) {
    let slot = workers.find(candidate => !candidate.busy);
    if (!slot && workers.length < poolSize) slot = spawn();
    if (!slot) return;

    const task = /** @type {NonNullable<typeof queue[number]>} */ (queue.shift());
    const id = idNext++;
    slot.busy = true;
    // Hold the process open until this task comes back
    slot.worker.ref();
    pending.set(id, { resolve: task.resolve, reject: task.reject });
    slot.worker.postMessage({ id, svg: task.svg, svgoOptions: task.svgoOptions });
  }
}

/** Whether the pool has failed and should no longer be used */
export function isBroken() {
  return broken;
}

/**
 * Optimize one SVG on a worker thread.
 * @param {string} svg
 * @param {object} svgoOptions
 * @returns {Promise<string>}
 */
export function optimizeOnWorker(svg, svgoOptions) {
  if (broken) return Promise.reject(new Error('SVG worker pool unavailable'));
  return new Promise((resolve, reject) => {
    queue.push({ svg, svgoOptions, resolve, reject });
    drain();
  });
}