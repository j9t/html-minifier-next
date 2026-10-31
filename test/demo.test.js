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
    test('Reads a `/…/flags` pattern as the pattern it spells', () => {
      // The form the demo’s own `customAttrCollapse` example shows
      const options = getOptions([textOption('customAttrCollapse', '/ng-class/i')]);
      assert.ok(options.customAttrCollapse instanceof RegExp);
      assert.strictEqual(options.customAttrCollapse.source, 'ng-class');
      assert.strictEqual(options.customAttrCollapse.flags, 'i');
    });

    test('Reads a bare pattern as a source, carrying no flags', () => {
      const options = getOptions([textOption('customAttrCollapse', 'ng-class')]);
      assert.ok(options.customAttrCollapse instanceof RegExp);
      assert.strictEqual(options.customAttrCollapse.source, 'ng-class');
      assert.strictEqual(options.customAttrCollapse.flags, '');
    });

    test('Keeps each whitespace-separated pattern’s own flags', () => {
      const options = getOptions([textOption('ignoreCustomFragments', '/<%[\\s\\S]*?%>/ /\\{a%[\\s\\S]*?%a\\}/i')]);
      assert.deepStrictEqual(options.ignoreCustomFragments.map(re => [re.source, re.flags]), [
        ['<%[\\s\\S]*?%>', ''],
        ['\\{a%[\\s\\S]*?%a\\}', 'i']
      ]);
    });

    test('Drops a pattern that will not parse rather than throwing', (t) => {
      t.mock.method(console, 'warn', () => {});
      const options = getOptions([
        textOption('ignoreCustomFragments', '/<%[\\s\\S]*?%>/ /(/'),
        textOption('customAttrCollapse', '/(/')
      ]);
      assert.deepStrictEqual(options.ignoreCustomFragments.map(re => re.source), ['<%[\\s\\S]*?%>']);
      assert.strictEqual('customAttrCollapse' in options, false);
    });

    test('Warns about a risky fragment pattern rather than dropping it', (t) => {
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

    test('Splits each list and pattern-list option as its definition types it', () => {
      const options = getOptions([
        textOption('inlineCustomElements', 'x-a, x-b'),
        textOption('removeEmptyElementsExcept', 'td'),
        textOption('customAttrAssign', '/\\$=/ /:=/'),
        textOption('ignoreCustomComments', '/^!/'),
        textOption('customEventAttributes', '/^on/ /^x-on:/')
      ]);
      assert.deepStrictEqual(options.inlineCustomElements, ['x-a', 'x-b']);
      assert.deepStrictEqual(options.removeEmptyElementsExcept, ['td']);
      assert.deepStrictEqual(options.customAttrAssign.map(re => re.source), ['\\$=', ':=']);
      assert.deepStrictEqual(options.ignoreCustomComments.map(re => re.source), ['^!']);
      assert.deepStrictEqual(options.customEventAttributes.map(re => re.source), ['^on', '^x-on:']);
    });
  });

  describe('`encodeState`/`decodeState`', () => {
    test('Carries the input as it was written', () => {
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

    test('Carries the “Show invisibles” view with the URL, and only when it is on', () => {
      assert.strictEqual(roundTrip({ showInvisibles: true })?.s, 1);
      assert.strictEqual('s' in (roundTrip({ showInvisibles: false }) ?? {}), false);
    });

    test('Reads a renamed option as the option it became', () => {
      const hash = LZString.compressToEncodedURIComponent(JSON.stringify({ i: '', o: { sortClassName: true } }));
      assert.deepStrictEqual(decodeState(hash)?.o, { sortClassNames: true });
    });

    test('Drops an option that no longer exists', () => {
      const hash = LZString.compressToEncodedURIComponent(JSON.stringify({ i: '', o: { html5: true, removeComments: true } }));
      assert.deepStrictEqual(decodeState(hash)?.o, { removeComments: true });
    });

    test('Takes a hash that will not decode as no state', () => {
      assert.strictEqual(decodeState('not-a-state'), null);
    });
  });

  describe('`annotateInvisibles`', () => {
    test('Escapes text that holds no invisible character, without marking it', () => {
      assert.strictEqual(annotateInvisibles('<p>a & b</p>'), '&lt;p&gt;a &amp; b&lt;/p&gt;');
    });

    test('Leaves single spaces and line breaks as they are', () => {
      assert.strictEqual(annotateInvisibles('a b c\nd\r\ne'), 'a b c\nd\r\ne');
    });

    test('Marks a tab within a line, so that it can be told from spaces', () => {
      assert.strictEqual(
        annotateInvisibles('a\tb'),
        'a<span class="invisible" title="U+0009 CHARACTER TABULATION">\t</span>b'
      );
    });

    test('Marks a run of spaces within a line space by space, so that it can be counted', () => {
      const space = '<span class="invisible space" title="U+0020 SPACE"> </span>';
      assert.strictEqual(annotateInvisibles('a  b   '), `a${space.repeat(2)}b${space.repeat(3)}`);
    });

    test('Marks a run of spaces after a tab within a line', () => {
      const space = '<span class="invisible space" title="U+0020 SPACE"> </span>';
      const tab = '<span class="invisible" title="U+0009 CHARACTER TABULATION">\t</span>';
      assert.strictEqual(annotateInvisibles('a\t  b'), `a${tab}${space.repeat(2)}b`);
    });

    test('Does not mark indentation, a run that opens a line', () => {
      assert.strictEqual(annotateInvisibles('  a\n    b\n\t  c\r  d'), '  a\n    b\n\t  c\r  d');
    });

    test('Does not mark indentation after a line or paragraph separator', () => {
      assert.strictEqual(
        annotateInvisibles('a\u2028  b\u2029\t  c'),
        'a<span class="invisible zero-width" title="U+2028 LINE SEPARATOR" data-marker="LS">\u2028</span>  b' +
        '<span class="invisible zero-width" title="U+2029 PARAGRAPH SEPARATOR" data-marker="PS">\u2029</span>\t  c'
      );
    });

    test('Marks a no-break space, keeping the character itself', () => {
      assert.strictEqual(
        annotateInvisibles('a\u00A0b'),
        'a<span class="invisible" title="U+00A0 NO-BREAK SPACE">\u00A0</span>b'
      );
    });

    test('Gives a zero-width character a marker to render', () => {
      assert.strictEqual(
        annotateInvisibles('a\u00ADb'),
        'a<span class="invisible zero-width" title="U+00AD SOFT HYPHEN" data-marker="SHY">\u00AD</span>b'
      );
    });

    test('Marks each character of a run on its own, so that runs can be counted', () => {
      const html = annotateInvisibles('\u00A0\u00A0\u202F');
      assert.strictEqual(html.match(/<span /g)?.length, 3);
      assert.ok(html.includes('U+202F NARROW NO-BREAK SPACE'));
    });

    test('Falls back to the code point for a control character', () => {
      assert.strictEqual(
        annotateInvisibles('\u0007'),
        '<span class="invisible zero-width" title="U+0007 CONTROL CHARACTER" data-marker="U+0007">\u0007</span>'
      );
    });

    test('Keeps the place of a null character, which HTML parsing drops, as a zero-width space', () => {
      assert.strictEqual(
        annotateInvisibles('a\u0000b'),
        'a<span class="invisible zero-width" title="U+0000 CONTROL CHARACTER" data-marker="U+0000">\u200B</span>b'
      );
    });

    test('Marks a bidi control by name', () => {
      assert.strictEqual(
        annotateInvisibles('a\u202Eb'),
        'a<span class="invisible zero-width" title="U+202E RIGHT-TO-LEFT OVERRIDE" data-marker="RLO">\u202E</span>b'
      );
    });

    test('Keeps the place of a bidi isolate control as a zero-width space, so as not to pair with the view’s isolates', () => {
      assert.strictEqual(
        annotateInvisibles('a\u2067b\u2069c'),
        'a<span class="invisible zero-width" title="U+2067 RIGHT-TO-LEFT ISOLATE" data-marker="RLI">\u200B</span>b' +
        '<span class="invisible zero-width" title="U+2069 POP DIRECTIONAL ISOLATE" data-marker="PDI">\u200B</span>c'
      );
    });

    test('Falls back to the code point for an unnamed default-ignorable character', () => {
      assert.strictEqual(
        annotateInvisibles('\u3164'),
        '<span class="invisible zero-width" title="U+3164 INVISIBLE CHARACTER" data-marker="U+3164">\u3164</span>'
      );
    });

    test('Marks an invisible character outside the BMP whole', () => {
      assert.strictEqual(
        annotateInvisibles('\u{E0041}'),
        '<span class="invisible zero-width" title="U+E0041 INVISIBLE CHARACTER" data-marker="U+E0041">\u{E0041}</span>'
      );
    });

    test('Does not mark variation selectors, as in emoji', () => {
      assert.strictEqual(annotateInvisibles('\u2764\uFE0F \u845B\u{E0100}'), '\u2764\uFE0F \u845B\u{E0100}');
    });

    test('Characters outside the BMP pass through whole', () => {
      assert.strictEqual(annotateInvisibles('\u{1D54F}'), '\u{1D54F}');
    });

    test('Produces marked text that reads back as the original, so that offsets in the view match the input’s', () => {
      const str = '<p title="a\u00A0b">x\t&amp;\u00AD y\u200B\u0007  \u202F\u202E\u{E0041}</p>\n  \u{1D54F}';
      const text = annotateInvisibles(str)
        .replace(/<span class="invisible(?: [a-z-]+)?" title="[^"]+"(?: data-marker="[^"]+")?>/g, '')
        .replace(/<\/span>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      assert.strictEqual(text, str);
    });

    test('Takes anything but a string as empty', () => {
      assert.strictEqual(annotateInvisibles(undefined), '');
      assert.strictEqual(annotateInvisibles(null), '');
    });
  });
});