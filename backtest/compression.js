// Compressed output sizes, shared by backtest.js and benchmark.js.
//
// Most HTML is served compressed, and a change that shrinks raw output can still grow
// what is transferred. Gzip level 6 and Brotli quality 6 are common defaults for
// on-the-fly compression; quality 11 (precompressed files) takes seconds per large
// file, too slow for runs across many commits.

import zlib from 'zlib';

const GZIP_LEVEL = 6;
const BROTLI_QUALITY = 6;

/**
 * @param {string} text
 * @returns {{gzip: number, brotli: number}}
 */
function compressedSizes(text) {
  const buffer = Buffer.from(text);
  return {
    gzip: zlib.gzipSync(buffer, { level: GZIP_LEVEL }).length,
    brotli: zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
        [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length
      }
    }).length
  };
}

// Exports

export {
  BROTLI_QUALITY,
  GZIP_LEVEL,
  compressedSizes
};