import { describe, test } from 'node:test';
import assert from 'node:assert';
import { getOptions } from '../demo/get-options.js';

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
      const options = getOptions([textOption('ignoreCustomFragments', '/(a+)+/')]);
      assert.deepStrictEqual(options.ignoreCustomFragments.map(re => re.source), ['(a+)+']);
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
});