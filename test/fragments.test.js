import { describe, test } from 'node:test';
import assert from 'node:assert';
import { toDelimitedFragment, toFragment, replaceCustomFragments } from '../src/lib/fragments.js';

describe('Fragments', () => {
  describe('`toDelimitedFragment`', () => {
    test('Reads the shape the shipped defaults use', () => {
      assert.deepStrictEqual(toDelimitedFragment(/<%[\s\S]*?%>/), { open: '<%', close: '%>', min: 0, max: Infinity });
      assert.deepStrictEqual(toDelimitedFragment(/<\?[\s\S]*?\?>/), { open: '<?', close: '?>', min: 0, max: Infinity });
    });

    test('Reads bounded and reversed bodies', () => {
      assert.deepStrictEqual(toDelimitedFragment(/\{\{[\s\S]{0,500}?\}\}/), { open: '{{', close: '}}', min: 0, max: 500 });
      assert.deepStrictEqual(toDelimitedFragment(/<%[\S\s]{2,}?%>/), { open: '<%', close: '%>', min: 2, max: Infinity });
      assert.deepStrictEqual(toDelimitedFragment(/<%[^]+?%>/), { open: '<%', close: '%>', min: 1, max: Infinity });
      assert.deepStrictEqual(toDelimitedFragment(/<%[\s\S]{4}?%>/), { open: '<%', close: '%>', min: 4, max: 4 });
    });

    test('Keeps escaped characters as themselves', () => {
      assert.deepStrictEqual(toDelimitedFragment(/\{%[\s\S]*?%\}/), { open: '{%', close: '%}', min: 0, max: Infinity });
      assert.deepStrictEqual(toDelimitedFragment(/<\?php[\s\S]*?\?>/), { open: '<?php', close: '?>', min: 0, max: Infinity });
    });

    test('Refuses shapes a literal scan cannot stand in for', () => {
      assert.strictEqual(toDelimitedFragment(/<%[\s\S]*%>/), null, 'Greedy body takes the last terminator, not the first');
      assert.strictEqual(toDelimitedFragment(/<%[^%]*?%>/), null, 'Body is not every character');
      assert.strictEqual(toDelimitedFragment(/<(WC@[\s\S]*?)>/), null, 'Delimiters are not literal');
      assert.strictEqual(toDelimitedFragment(/^<%[\s\S]*?%>/), null, 'Anchors are not literal');
      assert.strictEqual(toDelimitedFragment(/\s*[\s\S]*?%>/), null, 'Opening delimiter is not literal');
      assert.strictEqual(toDelimitedFragment(/<%[\s\S]*?/), null, 'No closing delimiter to scan to');
    });

    test('Takes flags into account', () => {
      assert.strictEqual(toDelimitedFragment(/<%.*?%>/), null, '`.` stops at line terminators without `s`');
      assert.deepStrictEqual(toDelimitedFragment(/<%.*?%>/s), { open: '<%', close: '%>', min: 0, max: Infinity });
      assert.strictEqual(toDelimitedFragment(/<%[\s\S]*?%>/i), null, 'Case folding moves character indexes');
      // `g` is the caller's business, so it does not stand in the way
      assert.deepStrictEqual(toDelimitedFragment(/<%[\s\S]*?%>/g), { open: '<%', close: '%>', min: 0, max: Infinity });
    });
  });

  describe('`replaceCustomFragments`', () => {
    const marker = (/** @type {string} */ match) => '[' + JSON.stringify(match) + ']';
    const prepare = (/** @type {RegExp[]} */ patterns) => patterns.map(toFragment);

    const patternSets = [
      [/<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/],
      [/<%[\s\S]*?%>/],
      [/\{\{[\s\S]{0,3}?\}\}/, /<%[\s\S]*?%>/],
      [/<%[\s\S]{1,4}?%>/],
      [/\{%[\s\S]*?%\}/, /\{\{[\s\S]*?\}\}/, /<[^]*?>/],
      // Overlapping delimiters, in both orders, since ties go to the pattern listed first
      [/<%%[\s\S]*?%%>/, /<%[\s\S]*?%>/],
      [/<%[\s\S]*?%>/, /<%%[\s\S]*?%%>/],
      [/<%[\s\S]+?%>/, /<%[\s\S]{2,5}?%>/],
      [/a[\s\S]*?a/],
      // Shapes that fall back to running the pattern, on their own and mixed in
      [/<%[^%]*?%>/],
      [/<%[\s\S]*%>/],
      [/<%[^%]*?%>/, /\{\{[\s\S]*?\}\}/],
      [/<(WC@[\s\S]*?)>/, /<%[\s\S]*?%>/]
    ];

    test('Matches what the equivalent regex would match, across random inputs', () => {
      // The scan stands in for `\s*(?:A|B)+\s*`, so that regex is the oracle
      const viaRegExp = (/** @type {string} */ input, /** @type {RegExp[]} */ patterns) => {
        const sources = patterns.map(pattern => pattern.source);
        return input.replace(new RegExp('\\s*(?:' + sources.join('|') + ')+\\s*', 'g'), marker);
      };

      const alphabet = ['<', '>', '%', '?', '{', '}', 'a', ' ', '  ', '\n', '\t', '<%', '%>', '<%%', '%%>', '{{', '}}', '<% x %>', 'aa', '<%a%>', '<WC@x>'];
      // Seeded, so a failure is reproducible
      let seed = 42;
      const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const pick = (/** @type {any[]} */ options) => options[Math.floor(random() * options.length)];

      for (let round = 0; round < 20000; round++) {
        const patterns = pick(patternSets);
        let input = '';
        for (let i = 0, n = Math.floor(random() * 26); i < n; i++) input += pick(alphabet);

        assert.strictEqual(
          replaceCustomFragments(input, prepare(patterns), marker),
          viaRegExp(input, patterns),
          `Round ${round} with ${patterns.join(' ')} on ${JSON.stringify(input)}`
        );
      }
    });

    test('Whitespace and adjacent fragments join the match', () => {
      const fragments = prepare([/<%[\s\S]*?%>/]);
      assert.strictEqual(replaceCustomFragments('a   <%x%><%y%>   b', fragments, marker), 'a["   <%x%><%y%>   "]b');
      // However long the run, since nothing caps it
      const spaces = ' '.repeat(500);
      assert.strictEqual(replaceCustomFragments(`a${spaces}<%x%>`, fragments, marker), `a["${spaces}<%x%>"]`);
      // Only fragments running straight into each other share a match; whitespace
      // between them belongs to the first
      assert.strictEqual(replaceCustomFragments('<%x%> <%y%>', fragments, marker), '["<%x%> "]["<%y%>"]');
    });

    test('Input without a fragment comes back untouched', () => {
      const input = '<p>' + '<% '.repeat(50) + '</p>';
      assert.strictEqual(replaceCustomFragments(input, prepare([/<%[\s\S]*?%>/]), marker), input);
    });

    test('A pattern keeps its own flags', () => {
      // The whitespace before the match joins it, as it would for any other fragment
      assert.strictEqual(replaceCustomFragments('<%x%> <A%x%a>', prepare([/<a%[\s\S]*?%a>/i]), marker), '<%x%>[" <A%x%a>"]');
      assert.strictEqual(replaceCustomFragments('<%x%> <A%x%a>', prepare([/<a%[\s\S]*?%a>/]), marker), '<%x%> <A%x%a>');
    });

    test('A pattern that matches nothing cannot stall the scan', () => {
      // `String.replace` spreads an empty match over every position; skipping it is saner
      assert.strictEqual(replaceCustomFragments('abc', prepare([/x*/]), marker), 'abc');
      assert.strictEqual(replaceCustomFragments('abxc', prepare([/x*/]), marker), 'ab["x"]c');
    });
  });
});