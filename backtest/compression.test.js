import { describe, test } from 'node:test';
import assert from 'node:assert';
import { compressedSizes } from './compression.js';

describe('Compression', () => {
  const markup = '<ul>' + '<li class="item"><a href="/page">Page</a></li>'.repeat(200) + '</ul>';

  test('Sizes are byte counts well below the raw size of repetitive markup', () => {
    const { gzip, brotli } = compressedSizes(markup);
    for (const size of [gzip, brotli]) {
      assert.ok(Number.isInteger(size) && size > 0);
      assert.ok(size < Buffer.byteLength(markup) / 10);
    }
  });

  test('Sizes are the same for the same input, so runs can be compared', () => {
    assert.deepStrictEqual(compressedSizes(markup), compressedSizes(markup));
  });

  test('Sizes count bytes rather than characters', () => {
    const ascii = compressedSizes('a'.repeat(1000) + 'b');
    const multibyte = compressedSizes('a'.repeat(1000) + '😀'.repeat(50));
    assert.ok(multibyte.gzip > ascii.gzip);
  });
});