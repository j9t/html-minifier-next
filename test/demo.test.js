import { describe, test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { getOptions } from '../demo/lib/get-options.js';
import { annotateInvisibles } from '../demo/lib/show-invisibles.js';
import { decodeState, encodeState } from '../demo/lib/url-state.js';

// The demo takes LZ-String from a script the page loads, which is read the way a page
// would read it: as a script that hands itself to whatever holds it
const lzString = { exports: {} };
new Function('module', readFileSync(new URL('../demo/public/lz-string.min.js', import.meta.url), 'utf8'))(lzString);
const LZString = lzString.exports;
globalThis.LZString = LZString;

const defaultOptions = [
  { id: 'collapseWhitespace', type: 'checkbox', checked: true },
  { id: 'removeComments', type: 'checkbox', checked: false },
  { id: 'maxLineLength', type: 'number', value: '' }
];

/** @param {Partial<{input: string, options: object[], showInvisibles: boolean}>} state */
const roundTrip = (state) => decodeState(encodeState({
  input: '',
  options: defaultOptions,
  defaultOptions,
  showInvisibles: false,
  ...state
}));

/**
 * @param {string} id
 * @param {string} value
 */
const textOption = (id, value) => ({ id, type: 'text', value });

describe('Demo', () => {
  describe('`getOptions`', () => {
    test('A `/…/flags` pattern is read as the pattern it spells', () => {
      // The form the demo’s own `customAttrCollapse` example shows
      const options = getOptions([textOption('customAttrCollapse', '/ng-class/i')]);
      assert.ok(options.customAttrCollapse instanceof RegExp);
      assert.strictEqual(options.customAttrCollapse.source, 'ng-class');
      assert.strictEqual(options.customAttrCollapse.flags, 'i');
    });

    test('A bare pattern is read as a source, carrying no flags', () => {
      const options = getOptions([textOption('customAttrCollapse', 'ng-class')]);
      assert.ok(options.customAttrCollapse instanceof RegExp);
      assert.strictEqual(options.customAttrCollapse.source, 'ng-class');
      assert.strictEqual(options.customAttrCollapse.flags, '');
    });

    test('Whitespace-separated patterns each keep their own flags', () => {
      const options = getOptions([textOption('ignoreCustomFragments', '/<%[\\s\\S]*?%>/ /\\{a%[\\s\\S]*?%a\\}/i')]);
      assert.deepStrictEqual(options.ignoreCustomFragments.map(re => [re.source, re.flags]), [
        ['<%[\\s\\S]*?%>', ''],
        ['\\{a%[\\s\\S]*?%a\\}', 'i']
      ]);
    });

    test('A pattern that will not parse is dropped rather than thrown', (t) => {
      t.mock.method(console, 'warn', () => {});
      const options = getOptions([
        textOption('ignoreCustomFragments', '/<%[\\s\\S]*?%>/ /(/'),
        textOption('customAttrCollapse', '/(/')
      ]);
      assert.deepStrictEqual(options.ignoreCustomFragments.map(re => re.source), ['<%[\\s\\S]*?%>']);
      assert.strictEqual('customAttrCollapse' in options, false);
    });

    test('A risky fragment pattern is warned about, not dropped', (t) => {
      const warn = t.mock.method(console, 'warn', () => {});
      const options = getOptions([textOption('ignoreCustomFragments', '/a*a*/')]);
      assert.deepStrictEqual(options.ignoreCustomFragments.map(re => re.source), ['a*a*']);
      assert.ok(warn.mock.calls.length > 0);
    });

    test('Options that carry no pattern pass through as they are', () => {
      const options = getOptions([
        { id: 'collapseWhitespace', type: 'checkbox', checked: true },
        { id: 'maxLineLength', type: 'number', value: '80' },
        textOption('processScripts', 'text/html, text/ng-template'),
        textOption('removeComments', '')
      ]);
      assert.strictEqual(options.collapseWhitespace, true);
      assert.strictEqual(options.maxLineLength, 80);
      assert.deepStrictEqual(options.processScripts, ['text/html', 'text/ng-template']);
      assert.strictEqual('removeComments' in options, false);
    });
  });

  describe('`encodeState`/`decodeState`', () => {
    test('The input travels as it was written', () => {
      assert.strictEqual(roundTrip({ input: '<p>Hello' })?.i, '<p>Hello');
    });

    test('Only options that stand apart from their default travel along', () => {
      const options = [
        { id: 'collapseWhitespace', type: 'checkbox', checked: true },
        { id: 'removeComments', type: 'checkbox', checked: true },
        { id: 'maxLineLength', type: 'number', value: '80' }
      ];
      assert.deepStrictEqual(roundTrip({ options })?.o, { removeComments: true, maxLineLength: '80' });
    });

    test('The “Show invisibles” view travels with the URL, and only when it is on', () => {
      assert.strictEqual(roundTrip({ showInvisibles: true })?.s, 1);
      assert.strictEqual('s' in (roundTrip({ showInvisibles: false }) ?? {}), false);
    });

    test('A renamed option is read as the option it became', () => {
      const hash = LZString.compressToEncodedURIComponent(JSON.stringify({ i: '', o: { sortClassName: true } }));
      assert.deepStrictEqual(decodeState(hash)?.o, { sortClassNames: true });
    });

    test('An option that no longer exists is dropped', () => {
      const hash = LZString.compressToEncodedURIComponent(JSON.stringify({ i: '', o: { html5: true, removeComments: true } }));
      assert.deepStrictEqual(decodeState(hash)?.o, { removeComments: true });
    });

    test('A hash that will not decode is taken as no state', () => {
      assert.strictEqual(decodeState('not-a-state'), null);
    });
  });

  describe('`annotateInvisibles`', () => {
    test('Text that holds no invisible character is escaped, not marked', () => {
      assert.strictEqual(annotateInvisibles('<p>a & b</p>'), '&lt;p&gt;a &amp; b&lt;/p&gt;');
    });

    test('Ordinary spaces, tabs, and line breaks stay as they are', () => {
      assert.strictEqual(annotateInvisibles('a \tb\nc'), 'a \tb\nc');
    });

    test('A no-break space is marked, keeping the character itself', () => {
      assert.strictEqual(
        annotateInvisibles('a\u00A0b'),
        'a<span class="invisible" title="U+00A0 NO-BREAK SPACE">\u00A0</span>b'
      );
    });

    test('A zero-width character carries a marker to render', () => {
      assert.strictEqual(
        annotateInvisibles('a\u00ADb'),
        'a<span class="invisible zero-width" title="U+00AD SOFT HYPHEN" data-marker="SHY">\u00AD</span>b'
      );
    });

    test('Each character of a run is marked on its own, so that runs can be counted', () => {
      const html = annotateInvisibles('\u00A0\u00A0\u202F');
      assert.strictEqual(html.match(/<span /g)?.length, 3);
      assert.ok(html.includes('U+202F NARROW NO-BREAK SPACE'));
    });

    test('A control character falls back to its code point', () => {
      assert.strictEqual(
        annotateInvisibles('\u0007'),
        '<span class="invisible zero-width" title="U+0007 CONTROL CHARACTER" data-marker="U+0007">\u0007</span>'
      );
    });

    test('Characters outside the BMP pass through whole', () => {
      assert.strictEqual(annotateInvisibles('\u{1D54F}'), '\u{1D54F}');
    });

    test('Anything but a string is taken as empty', () => {
      assert.strictEqual(annotateInvisibles(undefined), '');
      assert.strictEqual(annotateInvisibles(null), '');
    });
  });
});