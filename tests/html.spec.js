import {describe, test} from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { minify } from '../src/htmlminifier.js';

describe('HTML', () => {
  test('minify exists', () => {
    assert.ok(minify);
  });

  test('Parsing non-trivial markup', async () => {
    let input, output;

    assert.strictEqual(await minify('</td>'), '');
    assert.strictEqual(await minify('</p>'), '<p></p>');
    assert.strictEqual(await minify('</br>'), '<br>');
    assert.strictEqual(await minify('<br>x</br>'), '<br>x<br>');
    assert.strictEqual(await minify('<p title="</p>">x</p>'), '<p title="</p>">x</p>');
    assert.strictEqual(await minify('<p title=" <!-- hello world --> ">x</p>'), '<p title=" <!-- hello world --> ">x</p>');
    assert.strictEqual(await minify('<p title=" <![CDATA[ \n\n foobar baz ]]> ">x</p>'), '<p title=" <![CDATA[ \n\n foobar baz ]]> ">x</p>');
    assert.strictEqual(await minify('<p foo-bar=baz>xxx</p>'), '<p foo-bar=baz>xxx</p>');
    assert.strictEqual(await minify('<p foo:bar=baz>xxx</p>'), '<p foo:bar=baz>xxx</p>');
    assert.strictEqual(await minify('<p foo.bar=baz>xxx</p>'), '<p foo.bar=baz>xxx</p>');

    input = '<div><div><div><div><div><div><div><div><div><div>' +
      'i\'m 10 levels deep' +
      '</div></div></div></div></div></div></div></div></div></div>';

    assert.strictEqual(await minify(input), input);

    assert.strictEqual(await minify('<script>alert(\'<!--\')</script>'), '<script>alert(\'<!--\')</script>');
    assert.strictEqual(await minify('<script>alert(\'<!-- foo -->\')</script>'), '<script>alert(\'<!-- foo -->\')</script>');
    assert.strictEqual(await minify('<script>alert(\'-->\')</script>'), '<script>alert(\'-->\')</script>');

    assert.strictEqual(await minify('<a title="x"href=" ">foo</a>'), '<a title="x" href="">foo</a>');
    assert.strictEqual(await minify('<p id=""class=""title="">x'), '<p id="" class="" title="">x</p>');
    assert.strictEqual(await minify('<p x="x\'"">x</p>'), '<p x="x\'">x</p>', 'trailing quote should be ignored');
    assert.strictEqual(await minify('<a href="#"><p>Click me</p></a>'), '<a href="#"><p>Click me</p></a>');
    assert.strictEqual(await minify('<span><button>Hit me</button></span>'), '<span><button>Hit me</button></span>');
    assert.strictEqual(await minify('<object type="image/svg+xml" data="image.svg"><div>[fallback image]</div></object>'),
      '<object type="image/svg+xml" data="image.svg"><div>[fallback image]</div></object>'
    );

    assert.strictEqual(await minify('<ng-include src="x"></ng-include>'), '<ng-include src="x"></ng-include>');
    assert.strictEqual(await minify('<ng:include src="x"></ng:include>'), '<ng:include src="x"></ng:include>');
    assert.strictEqual(await minify('<ng-include src="\'views/partial-notification.html\'"></ng-include><div ng-view=""></div>'),
      '<ng-include src="\'views/partial-notification.html\'"></ng-include><div ng-view=""></div>'
    );

    // Will cause test to time out if fail
    input = '<p>For more information, read <a href=https://stackoverflow.com/questions/17408815/fieldset-resizes-wrong-appears-to-have-unremovable-min-width-min-content/17863685#17863685>this Stack Overflow answer</a>.</p>';
    output = '<p>For more information, read <a href=https://stackoverflow.com/questions/17408815/fieldset-resizes-wrong-appears-to-have-unremovable-min-width-min-content/17863685#17863685>this Stack Overflow answer</a>.</p>';
    assert.strictEqual(await minify(input), output);

    input = '<html ⚡></html>';
    assert.strictEqual(await minify(input), input);

    input = '<h:ællæ></h:ællæ>';
    assert.strictEqual(await minify(input), input);

    input = '<$unicorn>';
    await assert.rejects(minify(input), { name: "Error" });

    assert.strictEqual(await minify(input, { continueOnParseError: true }), input);

    input = '<begriffs.pagination ng-init="perPage=20" collection="logs" url="\'/api/logs?user=-1\'" per-page="perPage" per-page-presets="[10,20,50,100]" template-url="/assets/paginate-anything.html"></begriffs.pagination>';
    assert.strictEqual(await minify(input), input);

    // https://github.com/kangax/html-minifier/issues/41
    assert.strictEqual(await minify('<some-tag-1></some-tag-1><some-tag-2></some-tag-2>'),
      '<some-tag-1></some-tag-1><some-tag-2></some-tag-2>'
    );

    // https://github.com/kangax/html-minifier/issues/40
    assert.strictEqual(await minify('[\']["]'), '[\']["]');

    // https://github.com/kangax/html-minifier/issues/21
    assert.strictEqual(await minify('<a href="test.html"><div>hey</div></a>'), '<a href="test.html"><div>hey</div></a>');

    // https://github.com/kangax/html-minifier/issues/17
    assert.strictEqual(await minify(':) <a href="https://example.com">link</a>'), ':) <a href="https://example.com">link</a>');

    // https://github.com/kangax/html-minifier/issues/169
    assert.strictEqual(await minify('<a href>ok</a>'), '<a href>ok</a>');

    assert.strictEqual(await minify('<a onclick></a>'), '<a onclick></a>');

    // https://github.com/kangax/html-minifier/issues/229
    assert.strictEqual(await minify('<CUSTOM-TAG></CUSTOM-TAG><div>Hello :)</div>'), '<custom-tag></custom-tag><div>Hello :)</div>');

    // https://github.com/kangax/html-minifier/issues/507
    input = '<tag v-ref:vm_pv :imgs=" objpicsurl_ "></tag>';
    assert.strictEqual(await minify(input), input);

    input = '<tag v-ref:vm_pv :imgs=" objpicsurl_ " ss"123>';
    await assert.rejects(minify(input), { name: "Error" });

    assert.strictEqual(await minify(input, { continueOnParseError: true }), input);

    // https://github.com/kangax/html-minifier/issues/512
    input = '<input class="form-control" type="text" style="" id="{{vm.formInputName}}" name="{{vm.formInputName}}"' +
      ' placeholder="YYYY-MM-DD"' +
      ' date-range-picker' +
      ' data-ng-model="vm.value"' +
      ' data-ng-model-options="{ debounce: 1000 }"' +
      ' data-ng-pattern="vm.options.format"' +
      ' data-options="vm.datepickerOptions">';
    assert.strictEqual(await minify(input), input);

    input = '<input class="form-control" type="text" style="" id="{{vm.formInputName}}" name="{{vm.formInputName}}"' +
      ' <!--FIXME hardcoded placeholder—dates may not be used for service required fields yet. -->' +
      ' placeholder="YYYY-MM-DD"' +
      ' date-range-picker' +
      ' data-ng-model="vm.value"' +
      ' data-ng-model-options="{ debounce: 1000 }"' +
      ' data-ng-pattern="vm.options.format"' +
      ' data-options="vm.datepickerOptions">';

    await assert.rejects(minify(input), { name: "Error" });

    assert.strictEqual(await minify(input, { continueOnParseError: true }), input);

    // https://github.com/kangax/html-minifier/issues/974
    input = '<!–– Failing New York Times Comment -->';
    await assert.rejects(minify(input), { name: "Error" });

    assert.strictEqual(await minify(input, { continueOnParseError: true }), input);

    input = '<br a=\u00A0 b="&nbsp;" c="\u00A0">';
    output = '<br a=\u00A0 b="&nbsp;" c="\u00A0">';
    assert.strictEqual(await minify(input), output);
    output = '<br a="\u00A0"b="\u00A0"c="\u00A0">';
    assert.strictEqual(await minify(input, { decodeEntities: true, removeTagWhitespace: true }), output);
    output = '<br a=\u00A0 b=\u00A0 c=\u00A0>';
    assert.strictEqual(await minify(input, { decodeEntities: true, removeAttributeQuotes: true }), output);
    assert.strictEqual(await minify(input, { decodeEntities: true, removeAttributeQuotes: true, removeTagWhitespace: true }), output);
  });

  test('Options', async () => {
    const input = '<p>blah<span>blah 2<span>blah 3</span></span></p>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, {}), input);
  });

  test('Case normalization', async () => {
    assert.strictEqual(await minify('<P>foo</p>'), '<p>foo</p>');
    assert.strictEqual(await minify('<DIV>boo</DIV>'), '<div>boo</div>');
    assert.strictEqual(await minify('<DIV title="moo">boo</DiV>'), '<div title="moo">boo</div>');
    assert.strictEqual(await minify('<DIV TITLE="blah">boo</DIV>'), '<div title="blah">boo</div>');
    assert.strictEqual(await minify('<DIV tItLe="blah">boo</DIV>'), '<div title="blah">boo</div>');
    assert.strictEqual(await minify('<DiV tItLe="blah">boo</DIV>'), '<div title="blah">boo</div>');
  });

  test('Space normalization between attributes', async () => {
    assert.strictEqual(await minify('<p title="bar">foo</p>'), '<p title="bar">foo</p>');
    assert.strictEqual(await minify('<img src="test"/>'), '<img src="test">');
    assert.strictEqual(await minify('<p title = "bar">foo</p>'), '<p title="bar">foo</p>');
    assert.strictEqual(await minify('<p title\n\n\t  =\n     "bar">foo</p>'), '<p title="bar">foo</p>');
    assert.strictEqual(await minify('<img src="test" \n\t />'), '<img src="test">');
    assert.strictEqual(await minify('<input title="bar"       id="boo"    value="hello world">'), '<input title="bar" id="boo" value="hello world">');
  });

  test('Space normalization around text', async () => {
    let input, output;
    input = '   <p>blah</p>\n\n\n   ';
    assert.strictEqual(await minify(input), input);
    output = '<p>blah</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = ' <p>blah</p> ';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);
    output = '<p>blah</p>\n';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true }), output);
    output = ' <p>blah</p>\n';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true, preserveLineBreaks: true }), output);
    await Promise.all([
      'a', 'abbr', 'acronym', 'b', 'big', 'del', 'em', 'font', 'i', 'ins', 'kbd',
      'mark', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup',
      'time', 'tt', 'u', 'var'
    ].map(async function (el) {
      assert.strictEqual(await minify('foo <' + el + '>baz</' + el + '> bar', { collapseWhitespace: true }), 'foo <' + el + '>baz</' + el + '> bar');
      assert.strictEqual(await minify('foo<' + el + '>baz</' + el + '>bar', { collapseWhitespace: true }), 'foo<' + el + '>baz</' + el + '>bar');
      assert.strictEqual(await minify('foo <' + el + '>baz</' + el + '>bar', { collapseWhitespace: true }), 'foo <' + el + '>baz</' + el + '>bar');
      assert.strictEqual(await minify('foo<' + el + '>baz</' + el + '> bar', { collapseWhitespace: true }), 'foo<' + el + '>baz</' + el + '> bar');
      assert.strictEqual(await minify('foo <' + el + '> baz </' + el + '> bar', { collapseWhitespace: true }), 'foo <' + el + '>baz </' + el + '>bar');
      assert.strictEqual(await minify('foo<' + el + '> baz </' + el + '>bar', { collapseWhitespace: true }), 'foo<' + el + '> baz </' + el + '>bar');
      assert.strictEqual(await minify('foo <' + el + '> baz </' + el + '>bar', { collapseWhitespace: true }), 'foo <' + el + '>baz </' + el + '>bar');
      assert.strictEqual(await minify('foo<' + el + '> baz </' + el + '> bar', { collapseWhitespace: true }), 'foo<' + el + '> baz </' + el + '>bar');
      assert.strictEqual(await minify('<div>foo <' + el + '>baz</' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz</' + el + '> bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '>baz</' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '>baz</' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo <' + el + '>baz</' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz</' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '>baz</' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '>baz</' + el + '> bar</div>');
      assert.strictEqual(await minify('<div>foo <' + el + '> baz </' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz </' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '> baz </' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '> baz </' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo <' + el + '> baz </' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz </' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '> baz </' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '> baz </' + el + '>bar</div>');
    }));
    // Don’t trim whitespace around element, but do trim within
    await Promise.all([
      'bdi', 'bdo', 'button', 'cite', 'code', 'dfn', 'math', 'q', 'rt', 'rtc', 'ruby', 'svg'
    ].map(async function (el) {
      assert.strictEqual(await minify('foo <' + el + '>baz</' + el + '> bar', { collapseWhitespace: true }), 'foo <' + el + '>baz</' + el + '> bar');
      assert.strictEqual(await minify('foo<' + el + '>baz</' + el + '>bar', { collapseWhitespace: true }), 'foo<' + el + '>baz</' + el + '>bar');
      assert.strictEqual(await minify('foo <' + el + '>baz</' + el + '>bar', { collapseWhitespace: true }), 'foo <' + el + '>baz</' + el + '>bar');
      assert.strictEqual(await minify('foo<' + el + '>baz</' + el + '> bar', { collapseWhitespace: true }), 'foo<' + el + '>baz</' + el + '> bar');
      assert.strictEqual(await minify('foo <' + el + '> baz </' + el + '> bar', { collapseWhitespace: true }), 'foo <' + el + '>baz</' + el + '> bar');
      assert.strictEqual(await minify('foo<' + el + '> baz </' + el + '>bar', { collapseWhitespace: true }), 'foo<' + el + '>baz</' + el + '>bar');
      assert.strictEqual(await minify('foo <' + el + '> baz </' + el + '>bar', { collapseWhitespace: true }), 'foo <' + el + '>baz</' + el + '>bar');
      assert.strictEqual(await minify('foo<' + el + '> baz </' + el + '> bar', { collapseWhitespace: true }), 'foo<' + el + '>baz</' + el + '> bar');
      assert.strictEqual(await minify('<div>foo <' + el + '>baz</' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz</' + el + '> bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '>baz</' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '>baz</' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo <' + el + '>baz</' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz</' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '>baz</' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '>baz</' + el + '> bar</div>');
      assert.strictEqual(await minify('<div>foo <' + el + '> baz </' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz</' + el + '> bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '> baz </' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '>baz</' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo <' + el + '> baz </' + el + '>bar</div>', { collapseWhitespace: true }), '<div>foo <' + el + '>baz</' + el + '>bar</div>');
      assert.strictEqual(await minify('<div>foo<' + el + '> baz </' + el + '> bar</div>', { collapseWhitespace: true }), '<div>foo<' + el + '>baz</' + el + '> bar</div>');
    }));
    await Promise.all([
      ['<span> foo </span>', '<span>foo</span>'],
      [' <span> foo </span> ', '<span>foo</span>'],
      ['<nobr>a</nobr>', '<nobr>a</nobr>'],
      ['<nobr>a </nobr>', '<nobr>a</nobr>'],
      ['<nobr> a</nobr>', '<nobr>a</nobr>'],
      ['<nobr> a </nobr>', '<nobr>a</nobr>'],
      ['a<nobr>b</nobr>c', 'a<nobr>b</nobr>c'],
      ['a<nobr>b </nobr>c', 'a<nobr>b </nobr>c'],
      ['a<nobr> b</nobr>c', 'a<nobr> b</nobr>c'],
      ['a<nobr> b </nobr>c', 'a<nobr> b </nobr>c'],
      ['a<nobr>b</nobr> c', 'a<nobr>b</nobr> c'],
      ['a<nobr>b </nobr> c', 'a<nobr>b</nobr> c'],
      ['a<nobr> b</nobr> c', 'a<nobr> b</nobr> c'],
      ['a<nobr> b </nobr> c', 'a<nobr> b</nobr> c'],
      ['a <nobr>b</nobr>c', 'a <nobr>b</nobr>c'],
      ['a <nobr>b </nobr>c', 'a <nobr>b </nobr>c'],
      ['a <nobr> b</nobr>c', 'a <nobr>b</nobr>c'],
      ['a <nobr> b </nobr>c', 'a <nobr>b </nobr>c'],
      ['a <nobr>b</nobr> c', 'a <nobr>b</nobr> c'],
      ['a <nobr>b </nobr> c', 'a <nobr>b</nobr> c'],
      ['a <nobr> b</nobr> c', 'a <nobr>b</nobr> c'],
      ['a <nobr> b </nobr> c', 'a <nobr>b</nobr> c']
    ].map(async function (inputs) {
      assert.strictEqual(await minify(inputs[0], {
        collapseWhitespace: true,
        conservativeCollapse: true
      }), inputs[0], inputs[0]);
      assert.strictEqual(await minify(inputs[0], { collapseWhitespace: true }), inputs[1], inputs[0]);
      const input = '<div>' + inputs[0] + '</div>';
      assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), input, input);
      const output = '<div>' + inputs[1] + '</div>';
      assert.strictEqual(await minify(input, { collapseWhitespace: true }), output, input);
    }));
    assert.strictEqual(await minify('<p>foo <img> bar</p>', { collapseWhitespace: true }), '<p>foo <img> bar</p>');
    assert.strictEqual(await minify('<p>foo<img>bar</p>', { collapseWhitespace: true }), '<p>foo<img>bar</p>');
    assert.strictEqual(await minify('<p>foo <img>bar</p>', { collapseWhitespace: true }), '<p>foo <img>bar</p>');
    assert.strictEqual(await minify('<p>foo<img> bar</p>', { collapseWhitespace: true }), '<p>foo<img> bar</p>');
    assert.strictEqual(await minify('<p>foo <wbr> bar</p>', { collapseWhitespace: true }), '<p>foo<wbr> bar</p>');
    assert.strictEqual(await minify('<p>foo<wbr>bar</p>', { collapseWhitespace: true }), '<p>foo<wbr>bar</p>');
    assert.strictEqual(await minify('<p>foo <wbr>bar</p>', { collapseWhitespace: true }), '<p>foo <wbr>bar</p>');
    assert.strictEqual(await minify('<p>foo<wbr> bar</p>', { collapseWhitespace: true }), '<p>foo<wbr> bar</p>');
    assert.strictEqual(await minify('<p>foo <wbr baz moo=""> bar</p>', { collapseWhitespace: true }), '<p>foo<wbr baz moo=""> bar</p>');
    assert.strictEqual(await minify('<p>foo<wbr baz moo="">bar</p>', { collapseWhitespace: true }), '<p>foo<wbr baz moo="">bar</p>');
    assert.strictEqual(await minify('<p>foo <wbr baz moo="">bar</p>', { collapseWhitespace: true }), '<p>foo <wbr baz moo="">bar</p>');
    assert.strictEqual(await minify('<p>foo<wbr baz moo=""> bar</p>', { collapseWhitespace: true }), '<p>foo<wbr baz moo=""> bar</p>');
    assert.strictEqual(await minify('<p>  <a href="#">  <code>foo</code></a> bar</p>', { collapseWhitespace: true }), '<p><a href="#"><code>foo</code></a> bar</p>');
    assert.strictEqual(await minify('<p><a href="#"><code>foo  </code></a> bar</p>', { collapseWhitespace: true }), '<p><a href="#"><code>foo</code></a> bar</p>');
    assert.strictEqual(await minify('<p>  <a href="#">  <code>   foo</code></a> bar   </p>', { collapseWhitespace: true }), '<p><a href="#"><code>foo</code></a> bar</p>');
    assert.strictEqual(await minify('<div> Empty <!-- or --> not </div>', { collapseWhitespace: true }), '<div>Empty<!-- or --> not</div>');
    assert.strictEqual(await minify('<div> a <input><!-- b --> c </div>', {
      collapseWhitespace: true,
      removeComments: true
    }), '<div>a <input> c</div>');
    await Promise.all([
      ' a <? b ?> c ',
      '<!-- d --> a <? b ?> c ',
      ' <!-- d -->a <? b ?> c ',
      ' a<!-- d --> <? b ?> c ',
      ' a <!-- d --><? b ?> c ',
      ' a <? b ?><!-- d --> c ',
      ' a <? b ?> <!-- d -->c ',
      ' a <? b ?> c<!-- d --> ',
      ' a <? b ?> c <!-- d -->'
    ].map(async function (input) {
      assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), input, input);
      assert.strictEqual(await minify(input, { collapseWhitespace: true, removeComments: true }), 'a <? b ?> c', input);
      assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true }), ' a <? b ?> c ', input);
      input = '<p>' + input + '</p>';
      assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), input, input);
      assert.strictEqual(await minify(input, { collapseWhitespace: true, removeComments: true }), '<p>a <? b ?> c</p>', input);
      assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true }), '<p> a <? b ?> c </p>', input);
    }));
    input = '<li><i></i> <b></b> foo</li>';
    output = '<li><i></i> <b></b> foo</li>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<li><i> </i> <b></b> foo</li>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<li> <i></i> <b></b> foo</li>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<li><i></i> <b> </b> foo</li>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<li> <i> </i> <b> </b> foo</li>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<div> <a href="#"> <span> <b> foo </b> <i> bar </i> </span> </a> </div>';
    output = '<div><a href="#"><span><b>foo </b><i>bar</i></span></a></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<head> <!-- a --> <!-- b --><link> </head>';
    output = '<head><!-- a --><!-- b --><link></head>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<head> <!-- a --> <!-- b --> <!-- c --><link> </head>';
    output = '<head><!-- a --><!-- b --><!-- c --><link></head>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<p> foo\u00A0bar\nbaz  \u00A0\nmoo\t</p>';
    output = '<p>foo\u00A0bar baz \u00A0 moo</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<label> foo </label>\n' +
      '<input>\n' +
      '<object> bar </object>\n' +
      '<select> baz </select>\n' +
      '<textarea> moo </textarea>\n';
    output = '<label>foo</label> <input> <object>bar</object> <select>baz</select> <textarea> moo </textarea>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    input = '<pre>\n' +
      'foo\n' +
      '<br>\n' +
      'bar\n' +
      '</pre>\n' +
      'baz\n';
    output = '<pre>\nfoo\n<br>\nbar\n</pre>baz';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('Types of whitespace that should always be preserved', async () => {
    // Hair space
    let input = '<div>\u200afo\u200ao\u200a</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);

    // Hair space passed as HTML entity
    let inputWithEntities = '<div>&#8202;fo&#8202;o&#8202;</div>';
    assert.strictEqual(await minify(inputWithEntities, { collapseWhitespace: true }), inputWithEntities);

    // Hair space passed as HTML entity, in decodeEntities:true mode
    assert.strictEqual(await minify(inputWithEntities, { collapseWhitespace: true, decodeEntities: true }), input);

    // Non-breaking space
    input = '<div>\xa0fo\xa0o\xa0</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);

    // Non-breaking space passed as HTML entity
    inputWithEntities = '<div>&nbsp;fo&nbsp;o&nbsp;</div>';
    assert.strictEqual(await minify(inputWithEntities, { collapseWhitespace: true }), inputWithEntities);

    // Non-breaking space passed as HTML entity, in decodeEntities:true mode
    assert.strictEqual(await minify(inputWithEntities, { collapseWhitespace: true, decodeEntities: true }), input);

    // Do not remove hair space when preserving line breaks between tags
    input = '<p></p>\u200a\n<p></p>\n';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true }), input);

    // Preserve hair space in attributes
    input = '<p class="foo\u200abar"></p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);

    // Preserve hair space in class names when deduplicating and reordering
    input = '<a class="0 1\u200a3 2 3"></a>';
    assert.strictEqual(await minify(input, { sortClassName: false }), input);
    assert.strictEqual(await minify(input, { sortClassName: true }), input);
  });

  test('Doctype normalization', async () => {
    let input;
    const output = '<!doctype html>';

    input = '<!DOCTYPE html>';
    assert.strictEqual(await minify(input, { useShortDoctype: false }), input);
    assert.strictEqual(await minify(input, { useShortDoctype: true }), output);

    assert.strictEqual(await minify(input, { useShortDoctype: true, removeTagWhitespace: true }), '<!doctypehtml>');

    input = '<!DOCTYPE\nhtml>';
    assert.strictEqual(await minify(input, { useShortDoctype: false }), '<!DOCTYPE html>');
    assert.strictEqual(await minify(input, { useShortDoctype: true }), output);

    input = '<!DOCTYPE\thtml>';
    assert.strictEqual(await minify(input, { useShortDoctype: false }), input);
    assert.strictEqual(await minify(input, { useShortDoctype: true }), output);

    input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"\n    "http://www.w3.org/TR/html4/strict.dtd">';
    assert.strictEqual(await minify(input, { useShortDoctype: false }), '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">');
    assert.strictEqual(await minify(input, { useShortDoctype: true }), output);
  });

  test('Removing comments', async () => {
    let input;

    input = '<!-- test -->';
    assert.strictEqual(await minify(input, { removeComments: true }), '');

    input = '<!-- foo --><div>baz</div><!-- bar\n\n moo -->';
    assert.strictEqual(await minify(input, { removeComments: true }), '<div>baz</div>');
    assert.strictEqual(await minify(input, { removeComments: false }), input);

    input = '<p title="<!-- comment in attribute -->">foo</p>';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<script><!-- alert(1) --></script>';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<STYLE><!-- alert(1) --></STYLE>';
    assert.strictEqual(await minify(input, { removeComments: true }), '<style><!-- alert(1) --></style>');
  });

  test('Ignoring comments', async () => {
    let input;

    input = '<!--! test -->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);
    assert.strictEqual(await minify(input, { removeComments: false }), input);

    input = '<!--! foo --><div>baz</div><!--! bar\n\n moo -->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);
    assert.strictEqual(await minify(input, { removeComments: false }), input);

    input = '<!--! foo --><div>baz</div><!-- bar\n\n moo -->';
    assert.strictEqual(await minify(input, { removeComments: true }), '<!--! foo --><div>baz</div>');
    assert.strictEqual(await minify(input, { removeComments: false }), input);

    input = '<!-- ! test -->';
    assert.strictEqual(await minify(input, { removeComments: true }), '');
    assert.strictEqual(await minify(input, { removeComments: false }), input);

    input = '<div>\n\n   \t<div><div>\n\n<p>\n\n<!--!      \t\n\nbar\n\n moo         -->      \n\n</p>\n\n        </div>  </div></div>';
    const output = '<div><div><div><p><!--!      \t\n\nbar\n\n moo         --></p></div></div></div>';
    assert.strictEqual(await minify(input, { removeComments: true }), input);
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { removeComments: false }), input);
    assert.strictEqual(await minify(input, { removeComments: false, collapseWhitespace: true }), output);

    input = '<p rel="<!-- comment in attribute -->" title="<!--! ignored comment in attribute -->">foo</p>';
    assert.strictEqual(await minify(input, { removeComments: true }), input);
  });

  test('Conditional comments', async () => {
    let input, output;

    input = '<![if IE 5]>test<![endif]>';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<!--[if IE 6]>test<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<!--[if IE 7]>-->test<!--<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<!--[if IE 8]><!-->test<!--<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<!--[if lt IE 5.5]>test<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<!--[if (gt IE 5)&(lt IE 7)]>test<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);

    input = '<html>\n' +
      '  <head>\n' +
      '    <!--[if lte IE 8]>\n' +
      '      <script type="text/javascript">\n' +
      '        alert("ie8!");\n' +
      '      </script>\n' +
      '    <![endif]-->\n' +
      '  </head>\n' +
      '  <body>\n' +
      '  </body>\n' +
      '</html>';
    output = '<head><!--[if lte IE 8]>\n' +
      '      <script type="text/javascript">\n' +
      '        alert("ie8!");\n' +
      '      </script>\n' +
      '    <![endif]-->';
    assert.strictEqual(await minify(input, { minifyJS: true, removeComments: true, collapseWhitespace: true, removeOptionalTags: true, removeScriptTypeAttributes: true }), output);
    output = '<head><!--[if lte IE 8]><script>alert("ie8!")</script><![endif]-->';
    assert.strictEqual(await minify(input, { minifyJS: true, removeComments: true, collapseWhitespace: true, removeOptionalTags: true, removeScriptTypeAttributes: true, processConditionalComments: true }), output);

    input = '<!DOCTYPE html>\n' +
      '<html lang="en">\n' +
      '  <head>\n' +
      '    <meta http-equiv="X-UA-Compatible"\n' +
      '          content="IE=edge,chrome=1">\n' +
      '    <meta charset="utf-8">\n' +
      '    <!--[if lt IE 7]><html class="no-js ie6"><![endif]-->\n' +
      '    <!--[if IE 7]><html class="no-js ie7"><![endif]-->\n' +
      '    <!--[if IE 8]><html class="no-js ie8"><![endif]-->\n' +
      '    <!--[if gt IE 8]><!--><html class="no-js"><!--<![endif]-->\n' +
      '\n' +
      '    <title>Document</title>\n' +
      '  </head>\n' +
      '  <body>\n' +
      '  </body>\n' +
      '</html>';
    output = '<!DOCTYPE html>' +
      '<html lang="en">' +
      '<head>' +
      '<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">' +
      '<meta charset="utf-8">' +
      '<!--[if lt IE 7]><html class="no-js ie6"><![endif]-->' +
      '<!--[if IE 7]><html class="no-js ie7"><![endif]-->' +
      '<!--[if IE 8]><html class="no-js ie8"><![endif]-->' +
      '<!--[if gt IE 8]><!--><html class="no-js"><!--<![endif]-->' +
      '<title>Document</title></head><body></body></html>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, processConditionalComments: true }), output);
  });

  test('Collapsing space in conditional comments', async () => {
    let input, output;

    input = '<!--[if IE 7]>\n\n   \t\n   \t\t ' +
      '<link rel="stylesheet" href="/css/ie7-fixes.css" type="text/css" />\n\t' +
      '<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), input);
    output = '<!--[if IE 7]>\n\n   \t\n   \t\t ' +
      '<link rel="stylesheet" href="/css/ie7-fixes.css" type="text/css">\n\t' +
      '<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true, processConditionalComments: true }), output);
    output = '<!--[if IE 7]>' +
      '<link rel="stylesheet" href="/css/ie7-fixes.css" type="text/css">' +
      '<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, processConditionalComments: true }), output);

    input = '<!--[if lte IE 6]>\n    \n   \n\n\n\t' +
      '<p title=" sigificant     whitespace   ">blah blah</p>' +
      '<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true }), input);
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), input);
    output = '<!--[if lte IE 6]>' +
      '<p title=" sigificant     whitespace   ">blah blah</p>' +
      '<![endif]-->';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, processConditionalComments: true }), output);
  });

  test('Removing comments from scripts', async () => {
    let input, output;

    input = '<script><!--\nalert(1);\n--></script>';
    assert.strictEqual(await minify(input), input);
    output = '<script>alert(1)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script><!--alert(2);--></script>';
    assert.strictEqual(await minify(input), input);
    output = '<script></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script><!--alert(3);\n--></script>';
    assert.strictEqual(await minify(input), input);
    output = '<script></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script><!--\nalert(4);--></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script><!--alert(5);\nalert(6);\nalert(7);--></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script><!--alert(8)</script>';
    assert.strictEqual(await minify(input), input);
    output = '<script></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script type="text/javascript"> \n <!--\nalert("-->"); -->\n\n   </script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script type="text/javascript"> \n <!--\nalert("-->");\n -->\n\n   </script>';
    assert.strictEqual(await minify(input), input);
    output = '<script type="text/javascript">alert("--\\x3e")</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script> //   <!--   \n  alert(1)   //  --> </script>';
    assert.strictEqual(await minify(input), input);
    output = '<script>alert(1)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script type="text/html">\n<div>\n</div>\n<!-- aa -->\n</script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));
  });

  test('Removing comments from styles', async () => {
    let input, output;

    input = '<style><!--\np.a{background:red}\n--></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p.a{background:red}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style><!--p.b{background:red}--></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p.b{background:red}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style><!--p.c{background:red}\n--></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p.c{background:red}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style><!--\np.d{background:red}--></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p.d{background:red}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style><!--p.e{background:red}\np.f{background:red}\np.g{background:red}--></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p.e,p.f,p.g{background:red}</style>'; // Lightning CSS merges identical rules
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style>p.h{background:red}<!--\np.i{background:red}\n-->p.j{background:red}</style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p.h,p.i,p.j{background:red}</style>'; // Lightning CSS merges identical rules
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style type="text/css"><!-- p { color: red } --></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style type="text/css">p{color:red}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style type="text/css">p::before { content: "<!--" }</style>';
    assert.strictEqual(await minify(input), input);
    output = '<style type="text/css">p:before{content:"<!--"}</style>'; // Lightning CSS normalizes `::before` to `:before`
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style type="text/html">\n<div>\n</div>\n<!-- aa -->\n</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input);
  });

  test('Removing CDATA sections from scripts/styles', async () => {
    let input, output;

    input = '<script><![CDATA[\nalert(1)\n]]></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script><![CDATA[alert(2)]]></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script><![CDATA[alert(3)\n]]></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script><![CDATA[\nalert(4)]]></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script><![CDATA[alert(5)\nalert(6)\nalert(7)]]></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    input = '<script>/*<![CDATA[*/alert(8)/*]]>*/</script>';
    assert.strictEqual(await minify(input), input);
    output = '<script>alert(8)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script>//<![CDATA[\nalert(9)\n//]]></script>';
    assert.strictEqual(await minify(input), input);
    output = '<script>alert(9)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script type="text/javascript"> /* \n\t  <![CDATA[  */ alert(10) /*  ]]>  */ \n </script>';
    assert.strictEqual(await minify(input), input);
    output = '<script type="text/javascript">alert(10)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<script>\n\n//<![CDATA[\nalert(11)//]]></script>';
    assert.strictEqual(await minify(input), input);
    output = '<script>alert(11)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    input = '<style><![CDATA[\np.a{background:red}\n]]></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style></style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style><![CDATA[p.b{background:red}]]></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style></style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style><![CDATA[p.c{background:red}\n]]></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style></style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style><![CDATA[\np.d{background:red}]]></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style></style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style><![CDATA[p.e{background:red}\np.f{background:red}\np.g{background:red}]]></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style></style>'; // Lightning CSS rejects invalid CSS with `CDATA` markers
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style>p.h{background:red}<![CDATA[\np.i{background:red}\n]]>p.j{background:red}</style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p.h{background:red}</style>'; // Lightning CSS parses valid CSS before invalid CDATA
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Invalid empty selector/ }
    );

    input = '<style>/* <![CDATA[ */p { color: red } // ]]></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p{color:red}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style type="text/html">\n<div>\n</div>\n<![CDATA[ aa ]]>\n</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));
  });

  test('Custom processors', async () => {
    let input, output;

    function css(text, type) {
      return (type || 'Normal') + ' CSS';
    }

    async function asyncCss(text, type) {
      return (type || 'Normal') + ' CSS';
    }

    input = '<style>\n.foo { font: 12pt "bar" } </style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: null }), input);
    assert.strictEqual(await minify(input, { minifyCSS: false }), input);
    output = '<style>Normal CSS</style>';
    assert.strictEqual(await minify(input, { minifyCSS: css }), output);
    assert.strictEqual(await minify(input, { minifyCSS: asyncCss }), output);

    input = '<p style="font: 12pt \'bar\'"></p>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: null }), input);
    assert.strictEqual(await minify(input, { minifyCSS: false }), input);
    output = '<p style="inline CSS"></p>';
    assert.strictEqual(await minify(input, { minifyCSS: css }), output);

    input = '<link rel="stylesheet" href="css/style-mobile.css" media="(max-width: 737px)">';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: null }), input);
    assert.strictEqual(await minify(input, { minifyCSS: false }), input);
    output = '<link rel="stylesheet" href="css/style-mobile.css" media="media CSS">';
    assert.strictEqual(await minify(input, { minifyCSS: css }), output);

    input = '<style media="(max-width: 737px)"></style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: null }), input);
    assert.strictEqual(await minify(input, { minifyCSS: false }), input);
    output = '<style media="media CSS">Normal CSS</style>';
    assert.strictEqual(await minify(input, { minifyCSS: css }), output);

    function js(text, inline) {
      return inline ? 'Inline JS' : 'Normal JS';
    }

    input = '<script>\nalert(1); </script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: null }), input);
    assert.strictEqual(await minify(input, { minifyJS: false }), input);
    output = '<script>Normal JS</script>';
    assert.strictEqual(await minify(input, { minifyJS: js }), output);

    input = '<p onload="alert(1);"></p>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: null }), input);
    assert.strictEqual(await minify(input, { minifyJS: false }), input);
    output = '<p onload="Inline JS"></p>';
    assert.strictEqual(await minify(input, { minifyJS: js }), output);

    function url() {
      return 'URL';
    }

    input = '<a href="https://example.com/foo">bar</a>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyURLs: null }), input);
    assert.strictEqual(await minify(input, { minifyURLs: false }), input);
    output = '<a href="URL">bar</a>';
    assert.strictEqual(await minify(input, { minifyURLs: url }), output);

    input = '<style>\n.foo { background: url("https://example.com/foo") } </style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyURLs: null }), input);
    assert.strictEqual(await minify(input, { minifyURLs: false }), input);
    assert.strictEqual(await minify(input, { minifyURLs: url }), input);
    output = '<style>.foo{background:url(URL)}</style>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: url }), output);
  });

  test('Empty attributes', async () => {
    let input;

    input = '<p id="" class="" STYLE=" " title="\n" lang="" dir="">x</p>';
    assert.strictEqual(await minify(input, { removeEmptyAttributes: true }), '<p>x</p>');

    input = '<p onclick=""   ondblclick=" " onmousedown="" ONMOUSEUP="" onmouseover=" " onmousemove="" onmouseout="" ' +
      'onkeypress=\n\n  "\n     " onkeydown=\n"" onkeyup\n="">x</p>';
    assert.strictEqual(await minify(input, { removeEmptyAttributes: true }), '<p>x</p>');

    input = '<input onfocus="" onblur="" onchange=" " value=" boo ">';
    assert.strictEqual(await minify(input, { removeEmptyAttributes: true }), '<input value=" boo ">');

    input = '<input value="" name="foo">';
    assert.strictEqual(await minify(input, { removeEmptyAttributes: true }), '<input name="foo">');

    input = '<img src="" alt="">';
    assert.strictEqual(await minify(input, { removeEmptyAttributes: true }), '<img src="" alt="">');

    // Preserve unrecognized attribute, remove recognized attrs with unspecified values
    input = '<div data-foo class id style title lang dir onfocus onblur onchange onclick ondblclick onmousedown onmouseup onmouseover onmousemove onmouseout onkeypress onkeydown onkeyup></div>';
    assert.strictEqual(await minify(input, { removeEmptyAttributes: true }), '<div data-foo></div>');

    // Remove additional attributes
    input = '<img src="" alt="">';
    assert.strictEqual(await minify(input, { removeEmptyAttributes: function (attrName, tag) { return tag === 'img' && attrName === 'src'; } }), '<img alt="">');
  });

  test('Cleaning class/style attributes', async () => {
    let input, output;

    input = '<p class=" foo bar  ">foo bar baz</p>';
    assert.strictEqual(await minify(input), '<p class="foo bar">foo bar baz</p>');

    input = '<p class=" foo      ">foo bar baz</p>';
    assert.strictEqual(await minify(input), '<p class="foo">foo bar baz</p>');
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<p class=foo>foo bar baz</p>');

    input = '<p class="\n  \n foo   \n\n\t  \t\n   ">foo bar baz</p>';
    output = '<p class="foo">foo bar baz</p>';
    assert.strictEqual(await minify(input), output);

    input = '<p class="\n  \n foo   \n\n\t  \t\n  class1 class-23 ">foo bar baz</p>';
    output = '<p class="foo class1 class-23">foo bar baz</p>';
    assert.strictEqual(await minify(input), output);

    input = '<p style="    color: red; background-color: rgb(100, 75, 200);  "></p>';
    output = '<p style="color: red; background-color: rgb(100, 75, 200);"></p>';
    assert.strictEqual(await minify(input), output);

    input = '<p style="font-weight: bold  ; "></p>';
    output = '<p style="font-weight: bold;"></p>';
    assert.strictEqual(await minify(input), output);
  });

  test('Cleaning URI-based attributes', async () => {
    let input, output;

    input = '<a href="   https://example.com  ">x</a>';
    output = '<a href="https://example.com">x</a>';
    assert.strictEqual(await minify(input), output);

    input = '<a href="  \t\t  \n \t  ">x</a>';
    output = '<a href="">x</a>';
    assert.strictEqual(await minify(input), output);

    input = '<img src="   https://example.com  " title="bleh   " longdesc="  https://example.com/longdesc \n\n   \t ">';
    output = '<img src="https://example.com" title="bleh   " longdesc="https://example.com/longdesc">';
    assert.strictEqual(await minify(input), output);

    input = '<img src="" usemap="   https://example.com  ">';
    output = '<img src="" usemap="https://example.com">';
    assert.strictEqual(await minify(input), output);

    input = '<form action="  somePath/someSubPath/someAction?foo=bar&baz=qux     "></form>';
    output = '<form action="somePath/someSubPath/someAction?foo=bar&baz=qux"></form>';
    assert.strictEqual(await minify(input), output);

    input = '<BLOCKQUOTE cite=" \n\n\n https://example.com/tolkien/twotowers.html     "><P>foobar</P></BLOCKQUOTE>';
    output = '<blockquote cite="https://example.com/tolkien/twotowers.html"><p>foobar</p></blockquote>';
    assert.strictEqual(await minify(input), output);

    input = '<head profile="       http://gmpg.org/xfn/11    "></head>';
    output = '<head profile="http://gmpg.org/xfn/11"></head>';
    assert.strictEqual(await minify(input), output);

    input = '<object codebase="   https://example.com  "></object>';
    output = '<object codebase="https://example.com"></object>';
    assert.strictEqual(await minify(input), output);

    input = '<span profile="   1, 2, 3  ">foo</span>';
    assert.strictEqual(await minify(input), input);

    input = '<div action="  foo-bar-baz ">blah</div>';
    assert.strictEqual(await minify(input), input);
  });

  test('Cleaning number-based attributes', async () => {
    let input, output;

    input = '<a href="#" tabindex="   1  ">x</a><button tabindex="   2  ">y</button>';
    output = '<a href="#" tabindex="1">x</a><button tabindex="2">y</button>';
    assert.strictEqual(await minify(input), output);

    input = '<input value="" maxlength="     5 ">';
    output = '<input value="" maxlength="5">';
    assert.strictEqual(await minify(input), output);

    input = '<select size="  10   \t\t "><option>x</option></select>';
    output = '<select size="10"><option>x</option></select>';
    assert.strictEqual(await minify(input), output);

    input = '<textarea rows="   20  " cols="  30      "></textarea>';
    output = '<textarea rows="20" cols="30"></textarea>';
    assert.strictEqual(await minify(input), output);

    input = '<COLGROUP span="   40  "><COL span="  39 "></COLGROUP>';
    output = '<colgroup span="40"><col span="39"></colgroup>';
    assert.strictEqual(await minify(input), output);

    input = '<tr><td colspan="    2   ">x</td><td rowspan="   3 "></td></tr>';
    output = '<tr><td colspan="2">x</td><td rowspan="3"></td></tr>';
    assert.strictEqual(await minify(input), output);
  });

  test('Cleaning other attributes', async () => {
    let input, output;

    input = '<a href="#" onclick="  window.prompt(\'boo\'); " onmouseover=" \n\n alert(123)  \t \n\t  ">blah</a>';
    output = '<a href="#" onclick="window.prompt(\'boo\');" onmouseover="alert(123)">blah</a>';
    assert.strictEqual(await minify(input), output);

    input = '<body onload="  foo();   bar() ;  "><p>x</body>';
    output = '<body onload="foo();   bar() ;"><p>x</p></body>';
    assert.strictEqual(await minify(input), output);
  });

  test('Removing redundant attributes (&lt;form method="get" …>)', async () => {
    let input;

    input = '<form method="get">hello world</form>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<form>hello world</form>');

    input = '<form method="post">hello world</form>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<form method="post">hello world</form>');
  });

  test('Removing redundant attributes (&lt;input type="text" …>)', async () => {
    let input;

    input = '<input type="text">';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<input>');

    input = '<input type="  TEXT  " value="foo">';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<input value="foo">');

    input = '<input type="checkbox">';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<input type="checkbox">');
  });

  test('Removing redundant attributes (&lt;a name="…" id="…" …>)', async () => {
    let input;

    input = '<a id="foo" name="foo">blah</a>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<a id="foo">blah</a>');

    input = '<input id="foo" name="foo">';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), input);

    input = '<a name="foo">blah</a>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), input);

    input = '<a href="…" name="  bar  " id="bar" >blah</a>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<a href="…" id="bar">blah</a>');
  });

  test('Removing redundant attributes (&lt;script src="…" charset="…">)', async () => {
    let input, output;

    input = '<script type="text/javascript" charset="UTF-8">alert(222);</script>';
    output = '<script type="text/javascript">alert(222);</script>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), output);

    input = '<script type="text/javascript" src="https://example.com" charset="UTF-8">alert(222);</script>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), input);

    input = '<script CHARSET=" … ">alert(222);</script>';
    output = '<script>alert(222);</script>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), output);
  });

  test('Removing redundant attributes (&lt;… language="javascript" …>)', async () => {
    let input;

    input = '<script language="Javascript">x=2,y=4</script>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<script>x=2,y=4</script>');

    input = '<script LANGUAGE = "  javaScript  ">x=2,y=4</script>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), '<script>x=2,y=4</script>');
  });

  test('Removing redundant attributes (&lt;area shape="rect" …>)', async () => {
    const input = '<area shape="rect" coords="696,25,958,47" href="#" title="foo">';
    const output = '<area coords="696,25,958,47" href="#" title="foo">';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true }), output);
  });

  test('Attribute value defaults', async () => {
    const input = '<!DOCTYPE html>\n' +
      '<html dir=ltr>\n' +
      '\t<title>Attribute Value Defaults</title>\n' +
      '\t<link rel=stylesheet href=example.css media=all>\n' +
      '\t<style media=all></style>\n' +
      '\t<form autocorrect=on>\n' +
      '\t\t<button type=submit>Example</button>\n' +
      '\t\t<button popovertargetaction=toggle>Example</button>\n' +
      '\t</form>\n' +
      '\t<img src=example alt=Example fetchpriority=auto loading=eager decoding=auto>\n' +
      '\t<map name=example>\n' +
      '\t\t<area coords="0,1,2,3" shape=rect>\n' +
      '\t</map>\n' +
      '\t<form enctype=application/x-www-form-urlencoded method=get></form>\n' +
      '\t<input type=color colorspace=limited-srgb>\n' +
      '\t<input type=text>\n' +
      '\t<marquee behavior=scroll direction=left></marquee>\n' +
      '\t<textarea wrap=soft></textarea>\n' +
      '\t<video>\n' +
      '\t\t<track src=example kind=subtitles>\n' +
      '\t</video>';
    const expected = '<!DOCTYPE html>\n' +
      '<html>\n' +
      '\t<title>Attribute Value Defaults</title>\n' +
      '\t<link rel=stylesheet href=example.css>\n' +
      '\t<style></style>\n' +
      '\t<form>\n' +
      '\t\t<button>Example</button>\n' +
      '\t\t<button>Example</button>\n' +
      '\t</form>\n' +
      '\t<img src=example alt=Example>\n' +
      '\t<map name=example>\n' +
      '\t\t<area coords=0,1,2,3>\n' +
      '\t</map>\n' +
      '\t<form></form>\n' +
      '\t<input type=color>\n' +
      '\t<input>\n' +
      '\t<marquee></marquee>\n' +
      '\t<textarea></textarea>\n' +
      '\t<video>\n' +
      '\t\t<track src=example>\n' +
      '\t</video></html>';
    assert.strictEqual(await minify(input, { removeRedundantAttributes: true, removeAttributeQuotes: true }), expected);
  });

  test('Removing optional tags with attribute value defaults', async () => {
    const input = '<html dir=ltr>';
    const output = '';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, removeRedundantAttributes: true }), output);
  });

  test('media="all" attribute removal and CSS minification', async () => {
    // Regression test for issue where `media="all"` was corrupted to `media="a{top:0}"` when `minifyCSS` was enabled
    const input = '<html><head>' +
      '<link rel="stylesheet" href="style.css" media="all">' +
      '<meta name="theme-color" content="#fff" media="all">' +
      '<style media="all">a { top: 0 }</style>' +
      '</head><body>' +
      '<video><source src="video.mp4" media="all"></video>' +
      '</body></html>';
    const expected = '<html><head>' +
      '<link rel=stylesheet href=style.css>' +
      '<meta name=theme-color content=#fff>' +
      '<style>a{top:0}</style>' +
      '</head><body>' +
      '<video><source src=video.mp4></video>' +
      '</body></html>';
    assert.strictEqual(
      await minify(input, {
        removeRedundantAttributes: true,
        removeAttributeQuotes: true,
        minifyCSS: true
      }),
      expected
    );
  });

  test('Media types vs. media queries minification', async () => {
    // Simple media types (`all`, `screen`, `print`) should not be minified
    // Only actual media queries with features should be minified
    let input, output;

    // Simple media types—no minification
    input = '<link rel="stylesheet" href="a.css" media="screen">';
    output = '<link rel=stylesheet href=a.css media=screen>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true, minifyCSS: true }), output);

    input = '<style media="print">body{margin:0}</style>';
    output = '<style media=print>body{margin:0}</style>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true, minifyCSS: true }), output);

    // Actual media queries—should be minified
    // Note: Lightning CSS converts `min-width` to modern range syntax (`width>=`)
    input = '<link rel="stylesheet" href="a.css" media="(min-width: 768px)">';
    output = '<link rel=stylesheet href=a.css media="(width>=768px)">';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true, minifyCSS: true }), output);

    input = '<style media="screen and (min-width: 768px)">body{margin:0}</style>';
    output = '<style media="screen and (width>=768px)">body{margin:0}</style>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true, minifyCSS: true }), output);
  });

  test('Removing redundant attributes (&lt;… = "javascript: …" …>)', async () => {
    let input;

    input = '<p onclick="javascript:alert(1)">x</p>';
    assert.strictEqual(await minify(input), '<p onclick="alert(1)">x</p>');

    input = '<p onclick="javascript:x">x</p>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<p onclick=x>x</p>');

    input = '<p onclick=" JavaScript: x">x</p>';
    assert.strictEqual(await minify(input), '<p onclick="x">x</p>');

    input = '<p title="javascript:(function() { /* some stuff here */ })()">x</p>';
    assert.strictEqual(await minify(input), input);
  });

  test('Removing javascript type attributes', async () => {
    let input, output;

    input = '<script type="">alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: false }), input);
    output = '<script>alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    // https://github.com/terser/html-minifier-terser/issues/132
    input = '<script type>alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: false }), input);
    output = '<script>alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="modules">alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: false }), input);
    output = '<script type="modules">alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="text/javascript">alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: false }), input);
    output = '<script>alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<SCRIPT TYPE="  text/javascript ">alert(1)</script>';
    output = '<script>alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="application/javascript;version=1.8">alert(1)</script>';
    output = '<script>alert(1)</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="text/vbscript">MsgBox("foo bar")</script>';
    output = '<script type="text/vbscript">MsgBox("foo bar")</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    // JSON script types should not be removed (would make them executable JS)
    input = '<script type="application/ld+json">{"foo":"bar"}</script>';
    output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="importmap">{"imports":{}}</script>';
    output = '<script type="importmap">{"imports":{}}</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="application/problem+json">{"status":404}</script>';
    output = '<script type="application/problem+json">{"status":404}</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="application/merge-patch+json">{"title":"New"}</script>';
    output = '<script type="application/merge-patch+json">{"title":"New"}</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);

    input = '<script type="application/json-patch+json">[{"op":"add"}]</script>';
    output = '<script type="application/json-patch+json">[{"op":"add"}]</script>';
    assert.strictEqual(await minify(input, { removeScriptTypeAttributes: true }), output);
  });

  test('Removing type="text/css" attributes', async () => {
    let input, output;

    input = '<style type="">.foo { color: red }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: false }), input);
    output = '<style>.foo { color: red }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), output);

    // https://github.com/terser/html-minifier-terser/issues/132
    input = '<style type>.foo { color: red }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: false }), input);
    output = '<style>.foo { color: red }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), output);

    input = '<style type="text/css">.foo { color: red }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: false }), input);
    output = '<style>.foo { color: red }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), output);

    input = '<STYLE TYPE = "  text/CSS ">body { font-size: 1.75em }</style>';
    output = '<style>body { font-size: 1.75em }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), output);

    input = '<style type="text/plain">.foo { background: green }</style>';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), input);

    input = '<link rel="stylesheet" type="text/css" href="https://example.com">';
    output = '<link rel="stylesheet" href="https://example.com">';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), output);

    // https://github.com/terser/html-minifier-terser/issues/132
    input = '<link rel="stylesheet" type href="https://example.com">';
    output = '<link rel="stylesheet" href="https://example.com">';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), output);

    input = '<link rel="alternate" type="application/atom+xml" href="data.xml">';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true }), input);
  });

  test('Removing attribute quotes—basic cases', async () => {
    let input;

    input = '<p title="blah" class="a23B-foo.bar_baz:qux" id="moo">foo</p>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<p title=blah class=a23B-foo.bar_baz:qux id=moo>foo</p>');

    input = '<input value="hello world">';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<input value="hello world">');

    input = '<script type="module">alert(1);</script>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<script type=module>alert(1);</script>');

    input = '<a href="#" title="foo#bar">x</a>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<a href=# title=foo#bar>x</a>');

    input = '<a href="https://example.com/" title="blah">\nfoo\n\n</a>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<a href=https://example.com/ title=blah>\nfoo\n\n</a>');

    input = '<a title="blah" href="https://example.com/">\nfoo\n\n</a>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<a title=blah href=https://example.com/>\nfoo\n\n</a>');

    input = '<a href="https://example.com/" title="">\nfoo\n\n</a>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true, removeEmptyAttributes: true }), '<a href=https://example.com/>\nfoo\n\n</a>');

    input = '<p class=foo|bar:baz></p>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), '<p class=foo|bar:baz></p>');
  });

  test('Removing attribute quotes—must keep quotes for special characters', async () => {
    const testCases = [
      // Whitespace characters
      { name: 'space', input: '<input value="hello world">', expected: '<input value="hello world">' },
      { name: 'tab', input: '<div data-test="a\tb">test</div>', expected: '<div data-test="a\tb">test</div>' },
      { name: 'newline', input: '<div data-test="a\nb">test</div>', expected: '<div data-test="a\nb">test</div>' },
      { name: 'form feed', input: '<div data-test="a\fb">test</div>', expected: '<div data-test="a\fb">test</div>' },
      { name: 'carriage return', input: '<div data-test="a\rb">test</div>', expected: '<div data-test="a\rb">test</div>' },
      // Special HTML characters
      { name: 'equals sign', input: '<div data-test="a=b">test</div>', expected: '<div data-test="a=b">test</div>' },
      { name: 'less than', input: '<div data-test="a<b">test</div>', expected: '<div data-test="a<b">test</div>' },
      { name: 'greater than', input: '<div data-test="a>b">test</div>', expected: '<div data-test="a>b">test</div>' },
      { name: 'backtick', input: '<div data-test="a`b">test</div>', expected: '<div data-test="a`b">test</div>' },
      // Quote characters
      { name: 'single quote in double quotes', input: '<div data-test="a\'b">test</div>', expected: '<div data-test="a\'b">test</div>' },
      { name: 'double quote in single quotes', input: "<div data-test='a\"b'>test</div>", expected: "<div data-test='a\"b'>test</div>" },
      // Complex real-world cases
      { name: 'JSON in attribute', input: '<div data-config=\'{"foo":"bar"}\'>x</div>', expected: '<div data-config=\'{"foo":"bar"}\'>x</div>' },
      { name: 'multiple classes', input: '<div class="btn btn-primary btn-lg">x</div>', expected: '<div class="btn btn-primary btn-lg">x</div>' },
      { name: 'event handler with quotes', input: '<button onclick="alert(\'Hello World\')">x</button>', expected: '<button onclick="alert(\'Hello World\')">x</button>' },
      { name: 'srcset with spaces', input: '<img srcset="image.jpg 2x, other.jpg 3x">', expected: '<img srcset="image.jpg 2x, other.jpg 3x">' }
    ];

    await Promise.all(testCases.map(async ({ name, input, expected }) => {
      const result = await minify(input, { removeAttributeQuotes: true });
      assert.strictEqual(result, expected, `Failed for: ${name}`);
    }));
  });

  test('Removing attribute quotes—can remove quotes for safe values', async () => {
    const testCases = [
      { name: 'alphanumeric', input: '<div id="test123">x</div>', expected: '<div id=test123>x</div>' },
      { name: 'underscore', input: '<div data-name="foo_bar">x</div>', expected: '<div data-name=foo_bar>x</div>' },
      { name: 'dots', input: '<div data-version="1.2.3">x</div>', expected: '<div data-version=1.2.3>x</div>' },
      { name: 'colons', input: '<div data-time="12:30:00">x</div>', expected: '<div data-time=12:30:00>x</div>' },
      { name: 'hash', input: '<a href="#section">link</a>', expected: '<a href=#section>link</a>' },
      { name: 'pipe', input: '<div class="foo|bar">x</div>', expected: '<div class=foo|bar>x</div>' },
      { name: 'forward slash', input: '<div data-path="path/to/file">x</div>', expected: '<div data-path=path/to/file>x</div>' },
      { name: 'single char', input: '<div class="x">test</div>', expected: '<div class=x>test</div>' },
      { name: 'number', input: '<div data-id="42">x</div>', expected: '<div data-id=42>x</div>' },
      { name: 'negative number', input: '<div data-value="-123">x</div>', expected: '<div data-value=-123>x</div>' },
      { name: 'single class', input: '<div class="container">x</div>', expected: '<div class=container>x</div>' }
    ];

    await Promise.all(testCases.map(async ({ name, input, expected }) => {
      const result = await minify(input, { removeAttributeQuotes: true });
      assert.strictEqual(result, expected, `Failed for: ${name}`);
    }));
  });

  test('Removing attribute quotes—URL edge cases', async () => {
    const testCases = [
      { name: 'URL with ampersand only (can remove quotes)', input: '<a href="/?foo&bar">link</a>', expected: '<a href=/?foo&bar>link</a>' },
      { name: 'URL with equals (must keep quotes)', input: '<a href="/?key=value">link</a>', expected: '<a href="/?key=value">link</a>' },
      { name: 'URL with ampersand and equals (must keep quotes)', input: '<a href="/?foo=1&bar=2">link</a>', expected: '<a href="/?foo=1&bar=2">link</a>' },
      { name: 'simple path (can remove quotes)', input: '<a href="/path/to/file">link</a>', expected: '<a href=/path/to/file>link</a>' },
      { name: 'URL with protocol (can remove quotes)', input: '<a href="https://example.com/path">link</a>', expected: '<a href=https://example.com/path>link</a>' }
    ];

    await Promise.all(testCases.map(async ({ name, input, expected }) => {
      const result = await minify(input, { removeAttributeQuotes: true });
      assert.strictEqual(result, expected, `Failed for: ${name}`);
    }));
  });

  test('Removing attribute quotes—trailing slash regression', async () => {
    // Regression test for bug where unquoted attribute values ending with “/” incorrectly added extra space before closing tag
    const testCases = [
      { name: 'single attribute ending with /', input: '<a href="/topics/html/">html</a>', options: { removeAttributeQuotes: true }, expected: '<a href=/topics/html/>html</a>' },
      { name: 'multiple attributes, last ends with /', input: '<a title="test" href="/topics/html/">html</a>', options: { removeAttributeQuotes: true }, expected: '<a title=test href=/topics/html/>html</a>' },
      { name: 'first attribute ends with /, second does not', input: '<a href="/path/" title="test">link</a>', options: { removeAttributeQuotes: true }, expected: '<a href=/path/ title=test>link</a>' },
      { name: 'simple path with trailing slash', input: '<a href="/docs/">Documentation</a>', options: { removeAttributeQuotes: true }, expected: '<a href=/docs/>Documentation</a>' },
      { name: 'with removeTagWhitespace (reported bug scenario)', input: '<a href="/topics/html/">html</a>', options: { removeAttributeQuotes: true, removeTagWhitespace: true }, expected: '<a href=/topics/html/>html</a>' }
    ];

    await Promise.all(testCases.map(async ({ name, input, options, expected }) => {
      const result = await minify(input, options);
      assert.strictEqual(result, expected, `Failed for: ${name}`);
    }));
  });

  test('Preserving custom attribute-wrapping markup', async () => {
    let input, customAttrOptions;

    // With a single rule
    customAttrOptions = {
      customAttrSurround: [[/\{\{#if\s+\w+\}\}/, /\{\{\/if\}\}/]]
    };

    input = '<input {{#if value}}checked="checked"{{/if}}>';
    assert.strictEqual(await minify(input, customAttrOptions), input);

    input = '<input checked="checked">';
    assert.strictEqual(await minify(input, customAttrOptions), input);

    // With multiple rules
    customAttrOptions = {
      customAttrSurround: [
        [/\{\{#if\s+\w+\}\}/, /\{\{\/if\}\}/],
        [/\{\{#unless\s+\w+\}\}/, /\{\{\/unless\}\}/]
      ]
    };

    input = '<input {{#if value}}checked="checked"{{/if}}>';
    assert.strictEqual(await minify(input, customAttrOptions), input);

    input = '<input {{#unless value}}checked="checked"{{/unless}}>';
    assert.strictEqual(await minify(input, customAttrOptions), input);

    input = '<input {{#if value1}}data-attr="example" {{/if}}{{#unless value2}}checked="checked"{{/unless}}>';
    assert.strictEqual(await minify(input, customAttrOptions), input);

    input = '<input checked="checked">';
    assert.strictEqual(await minify(input, customAttrOptions), input);

    // With multiple rules and richer options
    customAttrOptions = {
      customAttrSurround: [
        [/\{\{#if\s+\w+\}\}/, /\{\{\/if\}\}/],
        [/\{\{#unless\s+\w+\}\}/, /\{\{\/unless\}\}/]
      ],
      collapseBooleanAttributes: true,
      removeAttributeQuotes: true
    };

    input = '<input {{#if value}}checked="checked"{{/if}}>';
    assert.strictEqual(await minify(input, customAttrOptions), '<input {{#if value}}checked{{/if}}>');

    input = '<input {{#if value1}}checked="checked"{{/if}} {{#if value2}}data-attr="foo"{{/if}}/>';
    assert.strictEqual(await minify(input, customAttrOptions), '<input {{#if value1}}checked {{/if}}{{#if value2}}data-attr=foo{{/if}}>');

    customAttrOptions.keepClosingSlash = true;
    assert.strictEqual(await minify(input, customAttrOptions), '<input {{#if value1}}checked {{/if}}{{#if value2}}data-attr=foo {{/if}}/>');
  });

  test('Preserving custom attribute-joining markup', async () => {
    let input;
    const polymerConditionalAttributeJoin = /\?=/;
    const customAttrOptions = {
      customAttrAssign: [polymerConditionalAttributeJoin]
    };
    input = '<div flex?="{{mode != cover}}"></div>';
    assert.strictEqual(await minify(input, customAttrOptions), input);
    input = '<div flex?="{{mode != cover}}" class="foo"></div>';
    assert.strictEqual(await minify(input, customAttrOptions), input);
  });

  test('Collapsing whitespace', async () => {
    let input, output;

    input = '<script type="text/javascript">  \n\t   alert(1) \n\n\n  \t </script>';
    output = '<script type="text/javascript">alert(1)</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<p>foo</p>    <p> bar</p>\n\n   \n\t\t  <div title="quz">baz  </div>';
    output = '<p>foo</p><p>bar</p><div title="quz">baz</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<p> foo    bar</p>';
    output = '<p>foo bar</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<p>foo\nbar</p>';
    output = '<p>foo bar</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<p> foo    <span>  blah     <i>   22</i>    </span> bar <img src=""></p>';
    output = '<p>foo <span>blah <i>22</i> </span>bar <img src=""></p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<textarea> foo bar     baz \n\n   x \t    y </textarea>';
    output = '<textarea> foo bar     baz \n\n   x \t    y </textarea>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<div><textarea></textarea>    </div>';
    output = '<div><textarea></textarea></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<div><pRe> $foo = "baz"; </pRe>    </div>';
    output = '<div><pre> $foo = "baz"; </pre></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<div><pRe>$foo = "baz";</pRe></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, caseSensitive: true }), output);

    input = '<script type="text/javascript">var = "hello";</script>\r\n\r\n\r\n' +
      '<style type="text/css">#foo { color: red;        }          </style>\r\n\r\n\r\n' +
      '<div>\r\n  <div>\r\n    <div><!-- hello -->\r\n      <div>' +
      '<!--! hello -->\r\n        <div>\r\n          <div class="">\r\n\r\n            ' +
      '<textarea disabled="disabled">     this is a textarea </textarea>\r\n          ' +
      '</div>\r\n        </div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>' +
      '<pre>       \r\nxxxx</pre><span>x</span> <span>Hello</span> <b>billy</b>     \r\n' +
      '<input type="text">\r\n<textarea></textarea>\r\n<pre></pre>';
    output = '<script type="text/javascript">var = "hello";</script>' +
      '<style type="text/css">#foo { color: red;        }</style>' +
      '<div><div><div>' +
      '<!-- hello --><div><!--! hello --><div><div class="">' +
      '<textarea disabled="disabled">     this is a textarea </textarea>' +
      '</div></div></div></div></div></div>' +
      '<pre>       \r\nxxxx</pre><span>x</span> <span>Hello</span> <b>billy</b> ' +
      '<input type="text"> <textarea></textarea><pre></pre>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<pre title="some title…">   hello     world </pre>';
    output = '<pre title="some title…">   hello     world </pre>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<pre title="some title…"><code>   hello     world </code></pre>';
    output = '<pre title="some title…"><code>   hello     world </code></pre>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<script>alert("foo     bar")    </script>';
    output = '<script>alert("foo     bar")</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<style>alert("foo     bar")    </style>';
    output = '<style>alert("foo     bar")</style>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('Removing empty elements', async () => {
    let input, output;

    assert.strictEqual(await minify('<p>x</p>', { removeEmptyElements: true }), '<p>x</p>');
    assert.strictEqual(await minify('<p></p>', { removeEmptyElements: true }), '');

    input = '<p>foo<span>bar</span><span></span></p>';
    output = '<p>foo<span>bar</span></p>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<a href="http://example/com" title="hello world"></a>';
    output = '';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<iframe></iframe>';
    output = '';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<iframe src="page.html"></iframe>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<iframe srcdoc="<h1>Foo</h1>"></iframe>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<video></video>';
    output = '';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<video src="preview.ogg"></video>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<audio autoplay></audio>';
    output = '';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<audio src="startup.mp3" autoplay></audio>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<object type="application/x-shockwave-flash"></object>';
    output = '';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<object data="game.swf" type="application/x-shockwave-flash"></object>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<applet archive="game.zip" width="250" height="150"></applet>';
    output = '';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<applet code="game.class" archive="game.zip" width="250" height="150"></applet>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<textarea cols="10" rows="10"></textarea>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<div>hello<span>world</span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<p>x<span title="<" class="blah-moo"></span></p>';
    output = '<p>x</p>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<div>x<div>y <div>blah</div><div></div>foo</div>z</div>';
    output = '<div>x<div>y <div>blah</div>foo</div>z</div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<img src="">';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    input = '<p><!-- x --></p>';
    output = '';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);

    input = '<script src="foo.js"></script>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);
    input = '<script></script>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), '');

    input = '<div>after<span></span> </div>';
    output = '<div>after </div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);
    output = '<div>after</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeEmptyElements: true }), output);

    input = '<div>before <span></span></div>';
    output = '<div>before </div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);
    output = '<div>before</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeEmptyElements: true }), output);

    input = '<div>both <span></span> </div>';
    output = '<div>both  </div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);
    output = '<div>both</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeEmptyElements: true }), output);

    input = '<div>unary <span></span><link></div>';
    output = '<div>unary <link></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), output);
    output = '<div>unary<link></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeEmptyElements: true }), output);

    input = '<div>Empty <!-- NOT --> </div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);
    output = '<div>Empty<!-- NOT --></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeEmptyElements: true }), output);
  });

  test('removeEmptyElementsExcept option', async () => {
    let input, output;

    // removeEmptyElementsExcept has no effect without removeEmptyElements
    input = '<p></p><span></span>';
    assert.strictEqual(await minify(input, { removeEmptyElementsExcept: ['p', 'span'] }), input);

    // Simple tag name preservation
    input = '<table><tr><td>Name</td><td>Age</td><td></td></tr></table>';
    output = '<table><tr><td>Name</td><td>Age</td><td></td></tr></table>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['td'] }), output);

    // Multiple tag names
    input = '<div><span></span><td></td><th></th></div>';
    output = '<div><td></td><th></th></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['td', 'th'] }), output);

    // HTML-like markup with double quotes
    input = '<div><span aria-hidden="true"></span><span class="other"></span></div>';
    output = '<div><span aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden="true">'] }), output);

    // HTML-like markup with single quotes
    input = '<div><span aria-hidden="true"></span><span class="other"></span></div>';
    output = '<div><span aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ["<span aria-hidden='true'>"] }), output);

    // HTML-like markup with unquoted attribute
    input = '<div><span aria-hidden="true"></span><span class="other"></span></div>';
    output = '<div><span aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden=true>'] }), output);

    // Closing tag in markup (should work the same)
    input = '<div><td></td><span></span></div>';
    output = '<div><td></td></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<td></td>'] }), output);

    // Element with matching tag but different attribute value should be removed
    input = '<div><span aria-hidden="true"></span><span aria-hidden="false"></span></div>';
    output = '<div><span aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden="true">'] }), output);

    // Multiple attributes must all match
    input = '<div><span class="icon" aria-hidden="true"></span><span class="icon"></span></div>';
    output = '<div><span class="icon" aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span class="icon" aria-hidden="true">'] }), output);

    // Additional attributes are allowed
    input = '<div><span class="icon" aria-hidden="true" data-test="x"></span></div>';
    output = '<div><span class="icon" aria-hidden="true" data-test="x"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden="true">'] }), output);

    // Mixed formats in array
    input = '<div><td></td><span aria-hidden="true"></span><div></div></div>';
    output = '<div><td></td><span aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['td', '<span aria-hidden="true">'] }), output);

    // Case insensitivity (tags are normalized via options.name)
    input = '<div><TD></TD><Span></Span></div>';
    output = '<div><td></td></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['td'], caseSensitive: false }), output);

    // Bulma burger example from issue #94
    input = '<a role="button" class="navbar-burger"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></a>';
    output = '<a role="button" class="navbar-burger"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></a>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden="true">'] }), output);

    // Empty table cell example from issue #94
    input = '<table><tr><td>Kira</td><td>Goddess</td><td></td></tr></table>';
    output = '<table><tr><td>Kira</td><td>Goddess</td><td></td></tr></table>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['td'] }), output);

    // Non-matching elements still get removed
    input = '<div><td></td><span></span><p></p></div>';
    output = '<div><td></td></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['td'] }), output);

    // Case sensitivity: lowercase spec does not preserve uppercase element
    input = '<div><TD></TD><td></td></div>';
    output = '<div><td></td></div>';
    assert.strictEqual(await minify(input, { caseSensitive: true, removeEmptyElements: true, removeEmptyElementsExcept: ['td'] }), output);

    // Case sensitivity: exact-case spec preserves matching element
    input = '<div><TD></TD><td></td></div>';
    output = '<div><TD></TD></div>';
    assert.strictEqual(await minify(input, { caseSensitive: true, removeEmptyElements: true, removeEmptyElementsExcept: ['TD'] }), output);

    // Attribute order invariance
    input = '<div><span aria-hidden="true" class="icon"></span></div>';
    output = '<div><span aria-hidden="true" class="icon"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span class="icon" aria-hidden="true">'] }), output);

    // Unquoted attribute value matches quoted spec
    input = '<div><span aria-hidden=true></span></div>';
    output = '<div><span aria-hidden=true></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden="true">'] }), output);

    // Case-insensitive attribute name matching (uppercase HTML attribute)
    input = '<div><span ARIA-HIDDEN="true"></span></div>';
    output = '<div><span aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden="true">'] }), output);

    // Case-insensitive attribute name matching (mixed case HTML attribute)
    input = '<div><span Aria-Hidden="true"></span></div>';
    output = '<div><span aria-hidden="true"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span aria-hidden="true">'] }), output);

    // Boolean attribute matching—element with boolean attribute is preserved
    input = '<div><button disabled></button><button></button></div>';
    output = '<div><button disabled=disabled></button></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<button disabled>'] }), output);

    // Boolean attribute matching—element without boolean attribute is removed
    input = '<div><span></span><span hidden="hidden"></span></div>';
    output = '<div><span hidden="hidden"></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span hidden>'] }), output);

    // Boolean attribute with valued attribute—both must match
    input = '<div><button type="button" disabled></button><button type="button"></button><button disabled></button></div>';
    output = '<div><button type="button" disabled=disabled></button></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<button type="button" disabled>'] }), output);

    // Multiple boolean attributes in spec
    input = '<div><button disabled hidden></button><button disabled></button><button></button></div>';
    output = '<div><button disabled=disabled hidden></button></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<button disabled hidden>'] }), output);

    // Boolean attribute matches regardless of how it appears in HTML (preserves original format)
    input = '<div><span hidden></span><span hidden="hidden"></span><span hidden=""></span></div>';
    output = '<div><span hidden></span><span hidden="hidden"></span><span hidden=""></span></div>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true, removeEmptyElementsExcept: ['<span hidden>'] }), output);
  });

  test('Collapsing boolean attributes', async () => {
    let input, output;

    input = '<input disabled="disabled">';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true }), '<input disabled>');

    input = '<input CHECKED = "checked" readonly="readonly">';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true }), '<input checked readonly>');

    input = '<option name="blah" selected="selected">moo</option>';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true }), '<option name="blah" selected>moo</option>');

    input = '<input autofocus="autofocus">';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true }), '<input autofocus>');

    input = '<input required="required">';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true }), '<input required>');

    input = '<input multiple="multiple">';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true }), '<input multiple>');

    input = '<div Allowfullscreen=foo Async=foo Autofocus=foo Autoplay=foo Checked=foo Compact=foo Controls=foo ' +
      'Declare=foo Default=foo Defaultchecked=foo Defaultmuted=foo Defaultselected=foo Defer=foo Disabled=foo ' +
      'Enabled=foo Formnovalidate=foo Hidden=foo Indeterminate=foo Inert=foo Ismap=foo Itemscope=foo ' +
      'Loop=foo Multiple=foo Muted=foo Nohref=foo Noresize=foo Noshade=foo Novalidate=foo Nowrap=foo Open=foo ' +
      'Pauseonexit=foo Readonly=foo Required=foo Reversed=foo Scoped=foo Seamless=foo Selected=foo Sortable=foo ' +
      'Truespeed=foo Typemustmatch=foo Visible=foo></div>';
    output = '<div allowfullscreen async autofocus autoplay checked compact controls declare default defaultchecked ' +
      'defaultmuted defaultselected defer disabled enabled formnovalidate hidden indeterminate inert ' +
      'ismap itemscope loop multiple muted nohref noresize noshade novalidate nowrap open pauseonexit readonly ' +
      'required reversed scoped seamless selected sortable truespeed typemustmatch visible></div>';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true }), output);
    output = '<div Allowfullscreen Async Autofocus Autoplay Checked Compact Controls Declare Default Defaultchecked ' +
      'Defaultmuted Defaultselected Defer Disabled Enabled Formnovalidate Hidden Indeterminate Inert ' +
      'Ismap Itemscope Loop Multiple Muted Nohref Noresize Noshade Novalidate Nowrap Open Pauseonexit Readonly ' +
      'Required Reversed Scoped Seamless Selected Sortable Truespeed Typemustmatch Visible></div>';
    assert.strictEqual(await minify(input, { collapseBooleanAttributes: true, caseSensitive: true }), output);
  });

  test('Collapsing enumerated attributes', async () => {
    assert.strictEqual(await minify('<div draggable="auto"></div>', { collapseBooleanAttributes: true }), '<div draggable></div>');
    assert.strictEqual(await minify('<div draggable="true"></div>', { collapseBooleanAttributes: true }), '<div draggable="true"></div>');
    assert.strictEqual(await minify('<div draggable="false"></div>', { collapseBooleanAttributes: true }), '<div draggable="false"></div>');
    assert.strictEqual(await minify('<div draggable="foo"></div>', { collapseBooleanAttributes: true }), '<div draggable></div>');
    assert.strictEqual(await minify('<div draggable></div>', { collapseBooleanAttributes: true }), '<div draggable></div>');
    assert.strictEqual(await minify('<div Draggable="auto"></div>', { collapseBooleanAttributes: true }), '<div draggable></div>');
    assert.strictEqual(await minify('<div Draggable="true"></div>', { collapseBooleanAttributes: true }), '<div draggable="true"></div>');
    assert.strictEqual(await minify('<div Draggable="false"></div>', { collapseBooleanAttributes: true }), '<div draggable="false"></div>');
    assert.strictEqual(await minify('<div Draggable="foo"></div>', { collapseBooleanAttributes: true }), '<div draggable></div>');
    assert.strictEqual(await minify('<div Draggable></div>', { collapseBooleanAttributes: true }), '<div draggable></div>');
    assert.strictEqual(await minify('<div draggable="Auto"></div>', { collapseBooleanAttributes: true }), '<div draggable></div>');
  });

  test('Keeping trailing slashes in tags', async () => {
    assert.strictEqual(await minify('<img src="test"/>', { keepClosingSlash: true }), '<img src="test"/>');
    // https://github.com/kangax/html-minifier/issues/233
    assert.strictEqual(await minify('<img src="test"/>', { keepClosingSlash: true, removeAttributeQuotes: true }), '<img src=test />');
    assert.strictEqual(await minify('<img src="test" id=""/>', { keepClosingSlash: true, removeAttributeQuotes: true, removeEmptyAttributes: true }), '<img src=test />');
    assert.strictEqual(await minify('<img title="foo" src="test"/>', { keepClosingSlash: true, removeAttributeQuotes: true }), '<img title=foo src=test />');
  });

  test('Removing optional tags', async () => {
    let input, output;

    input = '<p>foo';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), input);

    input = '</p>';
    output = '<p>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    input = '<body></body>';
    output = '';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    assert.strictEqual(await minify(input, { removeOptionalTags: true, removeEmptyElements: true }), output);

    input = '<html><head></head><body></body></html>';
    output = '';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    assert.strictEqual(await minify(input, { removeOptionalTags: true, removeEmptyElements: true }), output);

    input = ' <html></html>';
    output = ' ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<html> </html>';
    output = ' ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<html></html> ';
    output = ' ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = ' <html><body></body></html>';
    output = ' ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<html> <body></body></html>';
    output = ' ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<html><body> </body></html>';
    output = '<body> ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<html><body></body> </html>';
    output = ' ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<html><body></body></html> ';
    output = ' ';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<html><head><title>hello</title></head><body><p>foo<span>bar</span></p></body></html>';
    assert.strictEqual(await minify(input), input);
    output = '<title>hello</title><p>foo<span>bar</span>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    input = '<html lang=""><head><title>hello</title></head><body style=""><p>foo<span>bar</span></p></body></html>';
    output = '<html lang=""><title>hello</title><body style=""><p>foo<span>bar</span>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '<title>hello</title><p>foo<span>bar</span>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, removeEmptyAttributes: true }), output);

    input = '<html><head><title>a</title><link href="b.css" rel="stylesheet"/></head><body><a href="c.html"></a><div class="d"><input value="e"/></div></body></html>';
    output = '<title>a</title><link href="b.css" rel="stylesheet"><a href="c.html"></a><div class="d"><input value="e"></div>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    input = '<!DOCTYPE html><html><head><title>Blah</title></head><body><div><p>This is some text in a div</p><details>Followed by some details</details></div><div><p>This is some more text in a div</p></div></body></html>';
    output = '<!DOCTYPE html><title>Blah</title><div><p>This is some text in a div<details>Followed by some details</details></div><div><p>This is some more text in a div</div>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    input = '<!DOCTYPE html><html><head><title>Blah</title></head><body><noscript><p>This is some text in a noscript</p><details>Followed by some details</details></noscript><noscript><p>This is some more text in a noscript</p></noscript></body></html>';
    output = '<!DOCTYPE html><title>Blah</title><body><noscript><p>This is some text in a noscript<details>Followed by some details</details></noscript><noscript><p>This is some more text in a noscript</p></noscript>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    input = '<md-list-item ui-sref=".app-config"><md-icon md-font-icon="mdi-settings"></md-icon><p translate>Configure</p></md-list-item>';
    output = '<md-list-item ui-sref=".app-config"><md-icon md-font-icon="mdi-settings"></md-icon><p translate>Configure</md-list-item>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Optional tags should work inside custom elements
    input = '<my-card><p>First paragraph</p><p>Second paragraph</p></my-card>';
    output = '<my-card><p>First paragraph<p>Second paragraph</my-card>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // List items inside custom elements
    input = '<my-list><ul><li>Item 1</li><li>Item 2</li></ul></my-list>';
    output = '<my-list><ul><li>Item 1<li>Item 2</ul></my-list>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
  });

  test('Removing optional tags in tables', async () => {
    let input, output;

    input = '<table>' +
      '<thead><tr><th>foo</th><th>bar</th> <th>baz</th></tr></thead> ' +
      '<tbody><tr><td>boo</td><td>moo</td><td>loo</td></tr> </tbody>' +
      '<tfoot><tr><th>baz</th> <th>qux</th><td>boo</td></tr></tfoot>' +
      '</table>';
    assert.strictEqual(await minify(input), input);

    output = '<table>' +
      '<thead><tr><th>foo<th>bar</th> <th>baz</thead> ' +
      '<tr><td>boo<td>moo<td>loo</tr> ' +
      '<tfoot><tr><th>baz</th> <th>qux<td>boo' +
      '</table>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    output = '<table>' +
      '<thead><tr><th>foo<th>bar<th>baz' +
      '<tbody><tr><td>boo<td>moo<td>loo' +
      '<tfoot><tr><th>baz<th>qux<td>boo' +
      '</table>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeOptionalTags: true }), output);
    assert.strictEqual(await minify(output, { collapseWhitespace: true, removeOptionalTags: true }), output);

    input = '<table>' +
      '<caption>foo</caption>' +
      '<!-- blah -->' +
      '<colgroup><col span="2"><col></colgroup>' +
      '<!-- blah -->' +
      '<tbody><tr><th>bar</th><td>baz</td><th>qux</th></tr></tbody>' +
      '</table>';
    assert.strictEqual(await minify(input), input);

    output = '<table>' +
      '<caption>foo</caption>' +
      '<!-- blah -->' +
      '<col span="2"><col></colgroup>' +
      '<!-- blah -->' +
      '<tr><th>bar<td>baz<th>qux' +
      '</table>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    assert.strictEqual(await minify(output, { removeOptionalTags: true }), output);

    output = '<table>' +
      '<caption>foo' +
      '<col span="2"><col>' +
      '<tr><th>bar<td>baz<th>qux' +
      '</table>';
    assert.strictEqual(await minify(input, { removeComments: true, removeOptionalTags: true }), output);

    input = '<table>' +
      '<tbody></tbody>' +
      '</table>';
    assert.strictEqual(await minify(input), input);

    output = '<table><tbody></table>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
  });

  test('Removing optional tags in definition lists', async () => {
    let input, output;

    // `dt` and `dd` with closing tags
    input = '<dl><dt>Term 1</dt><dd>Definition 1</dd><dt>Term 2</dt><dd>Definition 2</dd><dt>Term 3</dt><dd>Definition 3</dd></dl>';
    output = '<dl><dt>Term 1<dd>Definition 1<dt>Term 2<dd>Definition 2<dt>Term 3<dd>Definition 3</dl>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // `dt` and `dd` with already-omitted closing tags (should not accumulate closing tags)
    input = '<dl><dt>Term 1<dd>Definition 1<dt>Term 2<dd>Definition 2<dt>Term 3<dd>Definition 3</dl>';
    output = '<dl><dt>Term 1<dd>Definition 1<dt>Term 2<dd>Definition 2<dt>Term 3<dd>Definition 3</dl>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Mixed `dt` and `dd` with whitespace (closing tags remain due to whitespace)
    input = '<dl>\n  <dt>Term</dt>\n  <dd>Definition</dd>\n</dl>';
    output = '<dl>\n  <dt>Term</dt>\n  <dd>Definition</dd>\n</dl>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
    output = '<dl><dt>Term<dd>Definition</dl>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, collapseWhitespace: true }), output);

    // Already-omitted tags with whitespace collapsed
    input = '<dl>\n  <dt>Term\n  <dd>Definition\n</dl>';
    output = '<dl><dt>Term<dd>Definition</dl>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, collapseWhitespace: true }), output);
  });

  test('Removing optional tags in options', async () => {
    let input, output;

    input = '<select><option>foo</option><option>bar</option></select>';
    output = '<select><option>foo<option>bar</select>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    input = '<select>\n' +
      '  <option>foo</option>\n' +
      '  <option>bar</option>\n' +
      '</select>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), input);
    output = '<select><option>foo<option>bar</select>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, collapseWhitespace: true }), output);
    output = '<select> <option>foo</option> <option>bar</option> </select>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, collapseWhitespace: true, conservativeCollapse: true }), output);

    // Example from htmldog.com
    input = '<select name="catsndogs">' +
      '<optgroup label="Cats">' +
      '<option>Tiger</option><option>Leopard</option><option>Lynx</option>' +
      '</optgroup>' +
      '<optgroup label="Dogs">' +
      '<option>Grey Wolf</option><option>Red Fox</option><option>Fennec</option>' +
      '</optgroup>' +
      '</select>';

    output = '<select name="catsndogs">' +
      '<optgroup label="Cats">' +
      '<option>Tiger<option>Leopard<option>Lynx' +
      '<optgroup label="Dogs">' +
      '<option>Grey Wolf<option>Red Fox<option>Fennec' +
      '</select>';

    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
  });

  test('Custom components', async () => {
    const input = '<custom-component>Oh, my.</custom-component>';
    const output = '<custom-component>Oh, my.</custom-component>';
    assert.strictEqual(await minify(input), output);
  });

  test('HTML 4: Anchor with inline elements', async () => {
    const input = '<a href="#"><span>Well, look at me! I\'m a span!</span></a>';
    assert.strictEqual(await minify(input, { html5: false }), input);
  });

  test('HTML 5: Anchor with inline elements', async () => {
    const input = '<a href="#"><span>Well, look at me! I\'m a span!</span></a>';
    assert.strictEqual(await minify(input, { html5: true }), input);
  });

  test('HTML 4: Anchor with block elements', async () => {
    const input = '<a href="#"><div>Well, look at me! I\'m a div!</div></a>';
    const output = '<a href="#"></a><div>Well, look at me! I\'m a div!</div>';
    assert.strictEqual(await minify(input, { html5: false }), output);
  });

  test('HTML 5: Anchor with block elements', async () => {
    const input = '<a href="#"><div>Well, look at me! I\'m a div!</div></a>';
    const output = '<a href="#"><div>Well, look at me! I\'m a div!</div></a>';
    assert.strictEqual(await minify(input, { html5: true }), output);
  });

  test('HTML 5: Enabled by default', async () => {
    const input = '<a href="#"><div>Well, look at me! I\'m a div!</div></a>';
    assert.strictEqual(await minify(input, { html5: true }), await minify(input));
  });

  test('Phrasing content', async () => {
    let input, output;

    input = '<p>a<div>b</div>';
    output = '<p>a</p><div>b</div>';
    assert.strictEqual(await minify(input, { html5: true }), output);
    output = '<p>a<div>b</div></p>';
    assert.strictEqual(await minify(input, { html5: false }), output);

    input = '<label>a<div>b</div>c</label>';
    assert.strictEqual(await minify(input, { html5: true }), input);
  });

  // https://github.com/kangax/html-minifier/issues/888
  test('ul/ol should be phrasing content', async () => {
    let input, output;

    input = '<p>a<ul><li>item</li></ul>';
    output = '<p>a</p><ul><li>item</li></ul>';
    assert.strictEqual(await minify(input, { html5: true }), output);

    output = '<p>a<ul><li>item</ul>';
    assert.strictEqual(await minify(input, { html5: true, removeOptionalTags: true }), output);

    output = '<p>a<ul><li>item</li></ul></p>';
    assert.strictEqual(await minify(input, { html5: false }), output);

    input = '<p>a<ol><li>item</li></ol></p>';
    output = '<p>a</p><ol><li>item</li></ol><p></p>';
    assert.strictEqual(await minify(input, { html5: true }), output);

    output = '<p>a<ol><li>item</ol><p>';
    assert.strictEqual(await minify(input, { html5: true, removeOptionalTags: true }), output);

    output = '<p>a</p><ol><li>item</li></ol>';
    assert.strictEqual(await minify(input, { html5: true, removeEmptyElements: true }), output);
  });

  test('Phrasing content with web components', async () => {
    const input = '<span><phrasing-element></phrasing-element></span>';
    const output = '<span><phrasing-element></phrasing-element></span>';
    assert.strictEqual(await minify(input, { html5: true }), output);
  });

  // https://github.com/kangax/html-minifier/issues/10
  test('Ignoring custom fragments', async () => {
    let input, output;
    const reFragments = [/<\?[^?]+\?>/, /<%[^%]+%>/, /\{\{[^}]*\}\}/];

    input = 'This is the start. <% … %>\r\n<%= … %>\r\n<? … ?>\r\n<!-- This is the middle, and a comment. -->\r\nNo comment, but middle.\r\n{{ … }}\r\n<?php … ?>\r\n<?xml … ?>\r\nHello, this is the end!';
    output = 'This is the start. <% … %> <%= … %> <? … ?> No comment, but middle. {{ … }} <?php … ?> <?xml … ?> Hello, this is the end!';
    assert.strictEqual(await minify(input, {}), input);
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, ignoreCustomFragments: reFragments }), output);

    output = 'This is the start. <% … %>\n<%= … %>\n<? … ?>\nNo comment, but middle. {{ … }}\n<?php … ?>\n<?xml … ?>\nHello, this is the end!';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, preserveLineBreaks: true }), output);

    output = 'This is the start. <% … %>\n<%= … %>\n<? … ?>\nNo comment, but middle.\n{{ … }}\n<?php … ?>\n<?xml … ?>\nHello, this is the end!';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, preserveLineBreaks: true, ignoreCustomFragments: reFragments }), output);

    input = '{{ if foo? }}\r\n  <div class="bar">\r\n    …\r\n  </div>\r\n{{ end \n}}';
    output = '{{ if foo? }}<div class="bar">…</div>{{ end }}';
    assert.strictEqual(await minify(input, {}), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: [] }), output);

    output = '{{ if foo? }} <div class="bar">…</div> {{ end \n}}';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: reFragments }), output);

    output = '{{ if foo? }}\n<div class="bar">\n…\n</div>\n{{ end \n}}';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true, ignoreCustomFragments: reFragments }), output);

    input = '<a class="<% if foo? %>bar<% end %> {{ … }}"></a>';
    assert.strictEqual(await minify(input, {}), input);
    assert.strictEqual(await minify(input, { ignoreCustomFragments: reFragments }), input);

    input = '<img src="{% static "images/logo.png" %}">';
    output = '<img src="{% static "images/logo.png" %}">';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/\{%[^%]*?%\}/g] }), output);

    input = '<p{% if form.name.errors %}class=\'error\'{% endif %}>' +
      '{{ form.name.label_tag }}' +
      '{{ form.name }}' +
      ' <label>{{ label }}</label> ' +
      '{% if form.name.errors %}' +
      '{% for error in form.name.errors %}' +
      '<span class=\'error_msg\' style=\'color:#ff0000\'>{{ error }}</span>' +
      '{% endfor %}' +
      '{% endif %}' +
      '</p>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/\{%[\s\S]*?%\}/g, /\{\{[\s\S]*?\}\}/g], quoteCharacter: '\'' }), input);
    output = '<p {% if form.name.errors %} class=\'error\' {% endif %}>' +
      '{{ form.name.label_tag }}' +
      '{{ form.name }}' +
      ' <label>{{ label }}</label> ' +
      '{% if form.name.errors %}' +
      '{% for error in form.name.errors %}' +
      '<span class=\'error_msg\' style=\'color:#ff0000\'>{{ error }}</span>' +
      '{% endfor %}' +
      '{% endif %}' +
      '</p>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/\{%[\s\S]*?%\}/g, /\{\{[\s\S]*?\}\}/g], quoteCharacter: '\'', collapseWhitespace: true }), output);

    input = '<a href="/legal.htm"<?php echo e(Request::path() == \'/\' ? \' rel="nofollow"\':\'\'); ?>>Legal Notices</a>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<\?php[\s\S]*?\?>/g] }), input);

    input = '<input type="checkbox"<%= (model.isChecked ? \'checked="checked"\' : \'\') %>>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<%=[\s\S]*?%>/g] }), input);

    input = '<div' +
      '{{IF text}}' +
      'data-yashareDescription="{{shorted(text, 300)}}"' +
      '{{END IF}}></div>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/\{\{[\s\S]*?\}\}/g], caseSensitive: true }), input);

    input = '<img class="{% foo %} {% bar %}">';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/\{%[^%]*?%\}/g] }), input);
    // `trimCustomFragments` withOUT `collapseWhitespace`, does not break the “{% foo %} {% bar %}” test
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/\{%[^%]*?%\}/g], trimCustomFragments: true }), input);
    // `trimCustomFragments` WITH `collapseWhitespace`, changes output
    output = '<img class="{% foo %}{% bar %}">';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/\{%[^%]*?%\}/g], collapseWhitespace: true, trimCustomFragments: true }), output);

    input = '<img class="titi.<%=tsItem_[0]%>">';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);

    input = '<table id="<?php echo $this->escapeHtmlAttr($this->table_id); ?>"></table>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);

    input = '<!--{{comment}}-->{{if a}}<div>b</div>{{/if}}';
    assert.strictEqual(await minify(input), input);
    output = '{{if a}}<div>b</div>{{/if}}';
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomFragments: [/\{\{.*?\}\}/g] }), output);

    // https://github.com/kangax/html-minifier/issues/722
    input = '<? echo "foo"; ?> <span>bar</span>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);
    output = '<? echo "foo"; ?><span>bar</span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, trimCustomFragments: true }), output);

    input = ' <? echo "foo"; ?> bar';
    assert.strictEqual(await minify(input), input);
    output = '<? echo "foo"; ?> bar';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<? echo "foo"; ?>bar';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, trimCustomFragments: true }), output);

    input = '<span>foo</span> <? echo "bar"; ?> baz';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);
    output = '<span>foo</span><? echo "bar"; ?>baz';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, trimCustomFragments: true }), output);

    input = '<span>foo</span> <? echo "bar"; ?> <? echo "baz"; ?> <span>foo</span>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);
    output = '<span>foo</span><? echo "bar"; ?><? echo "baz"; ?><span>foo</span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, trimCustomFragments: true }), output);

    input = 'foo <WC@bar> baz moo </WC@bar> loo';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: [/<(WC@[\s\S]*?)>(.*?)<\/\1>/] }), input);
    output = 'foo<wc @bar>baz moo</wc>loo';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<link href="<?php echo \'http://foo/\' ?>">';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), input);

    input = '<pre>\nfoo\n<? bar ?>\nbaz\n</pre>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);

    input = '<script>var value="<?php ?>+<?php ?>0"</script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJS: true }), input);

    input = '<style>body{font-size:<%=1%>2pt}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input);
  });

  test('Bootstrap’s span > button > span', async () => {
    const input = '<span class="input-group-btn">' +
      '\n  <button class="btn btn-default" type="button">' +
      '\n    <span class="glyphicon glyphicon-search"></span>' +
      '\n  </button>' +
      '</span>';
    const output = '<span class=input-group-btn><button class="btn btn-default" type=button><span class="glyphicon glyphicon-search"></span></button></span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeAttributeQuotes: true }), output);
  });

  test('caseSensitive', async () => {
    const input = '<div mixedCaseAttribute="value"></div>';
    const caseSensitiveOutput = '<div mixedCaseAttribute="value"></div>';
    const caseInSensitiveOutput = '<div mixedcaseattribute="value"></div>';
    assert.strictEqual(await minify(input), caseInSensitiveOutput);
    assert.strictEqual(await minify(input, { caseSensitive: true }), caseSensitiveOutput);
  });

  test('source and track', async () => {
    const input = '<audio controls="controls">' +
      '<source src="foo.wav">' +
      '<source src="far.wav">' +
      '<source src="foobar.wav">' +
      '<track kind="captions" src="sampleCaptions.vtt" srclang="en">' +
      '</audio>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), input);
  });

  test('Mixed HTML and SVG', async () => {
    const input = '<html><body>\n' +
      '  <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"\n' +
      '     width="612px" height="502.174px" viewBox="0 65.326 612 502.174" enable-background="new 0 65.326 612 502.174"\n' +
      '     xml:space="preserve" class="logo">' +
      '' +
      '    <ellipse class="ground" cx="283.5" cy="487.5" rx="259" ry="80"/>' +
      '    <polygon points="100,10 40,198 190,78 10,78 160,198"\n' +
      '      style="fill:lime;stroke:purple;stroke-width:5;fill-rule:evenodd;" />\n' +
      '    <filter id="pictureFilter">\n' +
      '      <feGaussianBlur stdDeviation="15" />\n' +
      '    </filter>\n' +
      '  </svg>\n' +
      '</body></html>';
    const output = '<html><body>' +
      '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="612px" height="502.174px" viewBox="0 65.326 612 502.174" enable-background="new 0 65.326 612 502.174" xml:space="preserve" class="logo">' +
      '<ellipse class="ground" cx="283.5" cy="487.5" rx="259" ry="80"/>' +
      '<polygon points="100,10 40,198 190,78 10,78 160,198" style="fill:lime;stroke:purple;stroke-width:5;fill-rule:evenodd;"/>' +
      '<filter id="pictureFilter"><feGaussianBlur stdDeviation="15"/></filter>' +
      '</svg>' +
      '</body></html>';
    // Should preserve case-sensitivity and closing slashes within SVG tags
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('SVG and MathML self-closing elements (kangax/html-minifier issue #1156)', async () => {
    // SVG self-closing elements should preserve their slashes even when `keepClosingSlash` is false
    const svgInput = '<div><img src="test.jpg"/><svg><path d="M 0 0"/><circle cx="5" cy="5" r="2"/></svg><br/></div>';
    const svgOutput = '<div><img src="test.jpg"><svg><path d="M 0 0"/><circle cx="5" cy="5" r="2"/></svg><br></div>';
    assert.strictEqual(await minify(svgInput, { collapseWhitespace: true, keepClosingSlash: false }), svgOutput);

    // MathML self-closing elements should preserve their slashes even when `keepClosingSlash` is false
    const mathInput = '<div><math><mrow><mi>x</mi></mrow><mspace width="1em"/><mrow><mi>y</mi></mrow></math></div>';
    const mathOutput = '<div><math><mrow><mi>x</mi></mrow><mspace width="1em"/><mrow><mi>y</mi></mrow></math></div>';
    assert.strictEqual(await minify(mathInput, { collapseWhitespace: true, keepClosingSlash: false }), mathOutput);

    // MathML case-sensitivity: Mixed-case elements and attributes should be preserved even with `caseSensitive: false`
    const mathCaseInput = '<math><mRow><mI mathvariant="bold">x</mI></mRow></math>';
    const mathCaseOutput = '<math><mRow><mI mathvariant="bold">x</mI></mRow></math>';
    assert.strictEqual(await minify(mathCaseInput, { caseSensitive: false, collapseWhitespace: true }), mathCaseOutput);

    // Nested SVG elements should all preserve slashes
    const nestedInput = '<svg><g><path d="M 0 0"/><g><circle cx="5" cy="5" r="2"/></g></g></svg>';
    const nestedOutput = '<svg><g><path d="M 0 0"/><g><circle cx="5" cy="5" r="2"/></g></g></svg>';
    assert.strictEqual(await minify(nestedInput, { collapseWhitespace: true }), nestedOutput);

    // Various SVG void elements
    const variousInput = '<svg><line x1="0" y1="0" x2="1" y2="1"/><rect x="0" y="0" width="10" height="10"/><use href="#x"/></svg>';
    const variousOutput = '<svg><line x1="0" y1="0" x2="1" y2="1"/><rect x="0" y="0" width="10" height="10"/><use href="#x"/></svg>';
    assert.strictEqual(await minify(variousInput, { collapseWhitespace: true }), variousOutput);
  });

  test('Nested quotes', async () => {
    const input = '<div data=\'{"test":"\\"test\\""}\'></div>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { quoteCharacter: '\'' }), input);

    const output = '<div data="{&#34;test&#34;:&#34;\\&#34;test\\&#34;&#34;}"></div>';
    assert.strictEqual(await minify(input, { quoteCharacter: '"' }), output);
  });

  test('Script minification', async () => {
    let input, output;

    input = '<script></script>(function(){ var foo = 1; var bar = 2; alert(foo + " " + bar); })()';

    assert.strictEqual(await minify(input, { minifyJS: true }), input);

    input = '<script>(function(){ var foo = 1; var bar = 2; alert(foo + " " + bar); })()</script>';
    output = '<script>alert("1 2")</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="text/JavaScript">(function(){ var foo = 1; var bar = 2; alert(foo + " " + bar); })()</script>';
    output = '<script type="text/JavaScript">alert("1 2")</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="application/javascript;version=1.8">(function(){ var foo = 1; var bar = 2; alert(foo + " " + bar); })()</script>';
    output = '<script type="application/javascript;version=1.8">alert("1 2")</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type=" application/javascript  ; charset=utf-8 ">(function(){ var foo = 1; var bar = 2; alert(foo + " " + bar); })()</script>';
    output = '<script type="application/javascript;charset=utf-8">alert("1 2")</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({\'gtm.start\':new Date().getTime(),event:\'gtm.js\'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!=\'dataLayer\'?\'&l=\'+l:\'\';j.async=true;j.src=\'//www.googletagmanager.com/gtm.js?id=\'+i+dl;f.parentNode.insertBefore(j,f);})(window,document,\'script\',\'dataLayer\',\'GTM-67NT\');</script>';
    output = '<script>!function(w,d,s,l){w[l]=w[l]||[],w[l].push({"gtm.start":(new Date).getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=!0,j.src="//www.googletagmanager.com/gtm.js?id=GTM-67NT",f.parentNode.insertBefore(j,f)}(window,document,"script","dataLayer")</script>';

    assert.strictEqual(await minify(input, { minifyJS: { mangle: false } }), output);

    input = '<script>\n' +
      '  <!--\n' +
      '    Platform.Mobile.Bootstrap.init(function () {\n' +
      '      Platform.Mobile.Core.Navigation.go("Login", {\n' +
      '        "error": ""\n' +
      '      });\n' +
      '    });\n' +
      '  //-->\n' +
      '</script>';
    output = '<script>Platform.Mobile.Bootstrap.init(function(){Platform.Mobile.Core.Navigation.go("Login",{error:""})})</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('Minification of scripts with different MIME types', async () => {
    let input, output;

    input = '<script type="">function f(){  return 1  }</script>';
    output = '<script type="">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="text/javascript">function f(){  return 1  }</script>';
    output = '<script type="text/javascript">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script foo="bar">function f(){  return 1  }</script>';
    output = '<script foo="bar">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="text/ecmascript">function f(){  return 1  }</script>';
    output = '<script type="text/ecmascript">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="application/javascript">function f(){  return 1  }</script>';
    output = '<script type="application/javascript">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="boo">function f(){  return 1  }</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);

    input = '<script type="text/html"><!-- ko if: true -->\n\n\n<div></div>\n\n\n<!-- /ko --></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
  });

  test('Minification of scripts with custom fragments', async () => {
    let input, output;

    input = '<script><?php ?></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), input);

    input = '<script>\n<?php ?></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    output = '<script> <?php ?></script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), input);

    input = '<script><?php ?>\n</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    output = '<script><?php ?> </script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), input);

    input = '<script>\n<?php ?>\n</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
    output = '<script> <?php ?> </script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), input);

    input = '<script>// <% … %></script>';
    output = '<script></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), output);

    input = '<script>// \n<% … %></script>';
    output = '<script> \n<% … %></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    output = '<script> <% … %></script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
    output = '<script>\n<% … %></script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), output);

    input = '<script>// <% … %>\n</script>';
    output = '<script></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), output);

    input = '<script>// \n<% … %>\n</script>';
    output = '<script> \n<% … %>\n</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    output = '<script> <% … %> </script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
    output = '<script>\n<% … %>\n</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true, preserveLineBreaks: true }), output);

    input = '<script>function f(){  return <?php ?>  }</script>';
    output = '<script>function f(){return <?php ?>  }</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    output = '<script>function f(){return <?php ?> }</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);

    input = '<script>function f(){  return "<?php ?>"  }</script>';
    output = '<script>function f(){return"<?php ?>"}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);
  });

  test('Event minification', async () => {
    let input, output;

    input = '<div only="alert(a + b)" one=";return false;"></div>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);

    input = '<div onclick="alert(a + b)"></div>';
    output = '<div onclick="alert(a+b)"></div>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<a href="/" onclick="this.href = getUpdatedURL (this.href);return true;">test</a>';
    output = '<a href="/" onclick="return this.href=getUpdatedURL(this.href),!0">test</a>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<a onclick="try{ dcsMultiTrack(\'DCS.dcsuri\',\'USPS\',\'WT.ti\') }catch(e){}"> foobar</a>';
    output = '<a onclick=\'try{dcsMultiTrack("DCS.dcsuri","USPS","WT.ti")}catch(e){}\'> foobar</a>';
    assert.strictEqual(await minify(input, { minifyJS: { mangle: false } }), output);
    assert.strictEqual(await minify(input, { minifyJS: { mangle: false }, quoteCharacter: '\'' }), output);

    input = '<a onclick="try{ dcsMultiTrack(\'DCS.dcsuri\',\'USPS\',\'WT.ti\') }catch(e){}"> foobar</a>';
    output = '<a onclick="try{dcsMultiTrack(&#34;DCS.dcsuri&#34;,&#34;USPS&#34;,&#34;WT.ti&#34;)}catch(e){}"> foobar</a>';
    assert.strictEqual(await minify(input, { minifyJS: { mangle: false }, quoteCharacter: '"' }), output);

    input = '<a onClick="_gaq.push([\'_trackEvent\', \'FGF\', \'banner_click\']);"></a>';
    output = '<a onclick=\'_gaq.push(["_trackEvent","FGF","banner_click"])\'></a>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    assert.strictEqual(await minify(input, { minifyJS: true, quoteCharacter: '\'' }), output);

    input = '<a onClick="_gaq.push([\'_trackEvent\', \'FGF\', \'banner_click\']);"></a>';
    output = '<a onclick="_gaq.push([&#34;_trackEvent&#34;,&#34;FGF&#34;,&#34;banner_click&#34;])"></a>';
    assert.strictEqual(await minify(input, { minifyJS: true, quoteCharacter: '"' }), output);

    input = '<button type="button" onclick=";return false;" id="appbar-guide-button"></button>';
    output = '<button type="button" onclick="return!1" id="appbar-guide-button"></button>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<button type="button" onclick=";return false;" ng-click="a(1 + 2)" data-click="a(1 + 2)"></button>';
    output = '<button type="button" onclick="return!1" ng-click="a(1 + 2)" data-click="a(1 + 2)"></button>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    assert.strictEqual(await minify(input, { minifyJS: true, customEventAttributes: [] }), input);
    output = '<button type="button" onclick=";return false;" ng-click="a(3)" data-click="a(1 + 2)"></button>';
    assert.strictEqual(await minify(input, { minifyJS: true, customEventAttributes: [/^ng-/] }), output);
    output = '<button type="button" onclick="return!1" ng-click="a(3)" data-click="a(1 + 2)"></button>';
    assert.strictEqual(await minify(input, { minifyJS: true, customEventAttributes: [/^on/, /^ng-/] }), output);

    input = '<div onclick="<?= b ?>"></div>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);

    input = '<div onclick="alert(a + <?= b ?>)"></div>';
    output = '<div onclick="alert(a+ <?= b ?>)"></div>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<div onclick="alert(a + \'<?= b ?>\')"></div>';
    output = '<div onclick=\'alert(a+"<?= b ?>")\'></div>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('Bare returns with customEventAttributes', async () => {
    // Ensures compatibility with future JS minifiers (oxc-minify, @swc/core)
    // that may handle bare returns differently. Critical requirement: support
    // for `module:false` or `bare_returns:true` equivalent option.
    let input, output;

    // Return with function call (common pattern)
    input = '<a href="#" onclick="return confirm(\'Delete?\');">Delete</a>';
    output = '<a href="#" onclick=\'return confirm("Delete?")\'>Delete</a>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Conditional bare return (control flow)
    input = '<button onclick="if (valid) return true; alert(\'Invalid\');">Submit</button>';
    output = '<button onclick=\'if(valid)return!0;alert("Invalid")\'>Submit</button>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Conditional bare return when `minifyJS.engine = 'swc'` (hybrid path keeps event handlers on Terser)
    input = '<button onclick="if (valid) return true; alert(\'Invalid\');">Submit</button>';
    output = '<button onclick=\'if(valid)return!0;alert("Invalid")\'>Submit</button>';
    assert.strictEqual(await minify(input, { minifyJS: { engine: 'swc' } }), output);

    // Multiple statements with bare return
    input = '<a onclick="event.preventDefault(); return false;">Link</a>';
    output = '<a onclick="return event.preventDefault(),!1">Link</a>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Early return guard pattern
    input = '<button onclick="if (!valid) return; process();">Process</button>';
    output = '<button onclick="if(!valid)return;process()">Process</button>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Complex boolean expression (parser stress test)
    input = '<a onclick="return someObject.method() && checkCondition();">Link</a>';
    output = '<a onclick="return someObject.method()&&checkCondition()">Link</a>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Ternary operator (important edge case for expression parsing)
    input = '<button onclick="return isValid ? true : false;">Check</button>';
    output = '<button onclick="return!!isValid">Check</button>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Object literal return (edge case, less common but valid)
    input = '<button onclick="return {success: true};">Data</button>';
    output = '<button onclick="return{success:!0}">Data</button>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Framework-specific attributes: Angular, Vue, Alpine.js
    input = '<div ng-click="if (x) return;" @click="return false;" x-on:click="return confirm(\'OK?\')">Button</div>';
    // Without patterns, only standard attributes minified
    output = '<div ng-click="if (x) return;" @click="return false;" x-on:click="return confirm(\'OK?\')">Button</div>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
    // With patterns, all framework attributes minified including bare returns
    output = '<div ng-click="if(x)return" @click="return!1" x-on:click=\'return confirm("OK?")\'>Button</div>';
    assert.strictEqual(await minify(input, { minifyJS: true, customEventAttributes: [/^ng-/, /^@/, /^x-on:/] }), output);
  });

  test('Escaping closing script tag', async () => {
    const input = '<script>window.jQuery || document.write(\'<script src="jquery.js"><\\/script>\')</script>';
    const output = '<script>window.jQuery||document.write(\'<script src="jquery.js"><\\/script>\')</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('Minification of style with custom fragments', async () => {
    let input, output;

    // Lightning CSS with `errorRecovery` removes invalid CSS fragments and returns empty or partial CSS
    input = '<style><?foo?></style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // Template syntax preserved
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style>\t<?foo?>\t</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // Template syntax preserved
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style><?foo?>{color:red}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    input = '<style>\t<?foo?>\t{color:red}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    input = '<style>body{<?foo?>}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    // ReDoS protection only preserves template syntax if Lightning CSS succeeds
    // With `continueOnMinifyError: false`, parse errors are thrown before the protection check
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style>body{\t<?foo?>\t}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    // ReDoS protection only preserves template syntax if Lightning CSS succeeds
    // With `continueOnMinifyError: false`, parse errors are thrown before the protection check
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style><?foo?>body{color:red}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    input = '<style>\t<?foo?>\tbody{color:red}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    input = '<style>body{<?foo?>color:red}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    input = '<style>body{\t<?foo?>\tcolor:red}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    // ReDoS protection only preserves template syntax if Lightning CSS succeeds
    // With `continueOnMinifyError: false`, parse errors are thrown before the protection check
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected token/ }
    );

    input = '<style>body{color:red<?foo?>}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    input = '<style>body{color:red\t<?foo?>\t}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    input = '<style>body{color:red;<?foo?>}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    // ReDoS protection only preserves template syntax if Lightning CSS succeeds
    // With `continueOnMinifyError: false`, parse errors are thrown before the protection check
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style>body{color:red;\t<?foo?>\t}</style>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), input); // ReDoS protection skips minification
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    // ReDoS protection only preserves template syntax if Lightning CSS succeeds
    // With `continueOnMinifyError: false`, parse errors are thrown before the protection check
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style>body{color:red}<?foo?></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>body{color:red}</style>'; // Lightning CSS keeps valid CSS, removes custom fragment
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    input = '<style>body{color:red}\t<?foo?>\t</style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>body{color:red}</style>'; // Lightning CSS keeps valid CSS, removes custom fragment
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );
  });

  test('URL attribute minification', async () => {
    let input, output;

    input = '<link rel="stylesheet" href="https://example.com/style.css"><form action="https://example.com/folder/folder2/index.html"><a href="https://example.com/folder/file.html">link</a></form>';
    output = '<link rel="stylesheet" href="/style.css"><form action="folder2/"><a href="file.html">link</a></form>';
    assert.strictEqual(await minify(input, { minifyURLs: 'https://example.com/folder/' }), output);
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/folder/' } }), output);

    input = '<a class="test"   href="https://example.com/foo/bar">Test</a>';
    output = '<a class=test href=foo/bar>Test</a>';
    assert.strictEqual(await minify(input, { minifyURLs: 'https://example.com', removeAttributeQuotes: true, collapseWhitespace: true }), output);

    input = '<link rel="canonical" href="https://example.com/">';
    assert.strictEqual(await minify(input, { minifyURLs: 'https://example.com/' }), input);
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/' } }), input);

    input = '<style>body { background: url(\'https://example.com/bg.png\') }</style>';
    assert.strictEqual(await minify(input, { minifyURLs: 'https://example.com/' }), input);
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/' } }), input);
    output = '<style>body{background:url(https://example.com/bg.png)}</style>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    output = '<style>body{background:url(bg.png)}</style>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: 'https://example.com/' }), output);
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: { site: 'https://example.com/' } }), output);

    input = '<style>body { background: url("https://example.com/foo bar/bg.png") }</style>';
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/foo bar/' } }), input);
    output = '<style>body{background:url("https://example.com/foo bar/bg.png")}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    output = '<style>body{background:url(bg.png)}</style>'; // Lightning CSS removes quotes when URL no longer has spaces
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: { site: 'https://example.com/foo bar/' } }), output);

    input = '<style>body { background: url("https://example.com/foo bar/(baz)/bg.png") }</style>';
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/' } }), input);
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/foo%20bar/' } }), input);
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/foo%20bar/(baz)/' } }), input);
    output = '<style>body{background:url(foo%20bar/\\(baz\\)/bg.png)}</style>'; // Lightning CSS encodes space, escapes parentheses
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: { site: 'https://example.com/' } }), output);
    output = '<style>body{background:url(\\(baz\\)/bg.png)}</style>'; // Lightning CSS escapes parentheses
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: { site: 'https://example.com/foo%20bar/' } }), output);
    output = '<style>body{background:url(bg.png)}</style>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: { site: 'https://example.com/foo%20bar/(baz)/' } }), output);

    input = '<img src="http://cdn.example.com/foo.png">';
    output = '<img src="//cdn.example.com/foo.png">';
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'http://example.com/' } }), output);
  });

  test('srcset attribute minification', async () => {
    let output;
    const input = '<source srcset="https://example.com/foo.gif ,https://example.com/bar.jpg 1x, baz moo 42w,' +
      '\n\n\n\n\n\t    https://example.com/zo om.png 1.00x">';
    output = '<source srcset="https://example.com/foo.gif, https://example.com/bar.jpg, baz moo 42w, https://example.com/zo om.png">';
    assert.strictEqual(await minify(input), output);
    output = '<source srcset="foo.gif, bar.jpg, baz%20moo 42w, zo%20om.png">';
    assert.strictEqual(await minify(input, { minifyURLs: { site: 'https://example.com/' } }), output);
  });

  test('Async minifyURLs support', async () => {
    let input, output;

    // Test async function for `href` attributes
    const asyncUrlMinifier = async (url) => {
      await Promise.resolve(); // Simulate async boundary
      return url.replace('https://example.com/', '');
    };

    input = '<a href="https://example.com/page.html">link</a>';
    output = '<a href="page.html">link</a>';
    assert.strictEqual(await minify(input, { minifyURLs: asyncUrlMinifier }), output);

    // Test async function with `srcset`
    input = '<img srcset="https://example.com/img1.jpg, https://example.com/img2.jpg 2x">';
    output = '<img srcset="img1.jpg, img2.jpg 2x">';
    assert.strictEqual(await minify(input, { minifyURLs: asyncUrlMinifier }), output);

    // Test async function with CSS `url()`
    input = '<style>body { background: url("https://example.com/bg.png") }</style>';
    output = '<style>body{background:url(bg.png)}</style>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: asyncUrlMinifier }), output);

    // Test promise-returning function
    const promiseUrlMinifier = (url) => Promise.resolve(url.toUpperCase());

    input = '<a href="https://example.com/test">link</a>';
    output = '<a href="HTTPS://EXAMPLE.COM/TEST">link</a>';
    assert.strictEqual(await minify(input, { minifyURLs: promiseUrlMinifier }), output);

    // Test backwards compatibility—sync function should still work
    const syncUrlMinifier = (url) => url.replace('example.com', 'test.com');

    input = '<a href="https://example.com/page">link</a>';
    output = '<a href="https://test.com/page">link</a>';
    assert.strictEqual(await minify(input, { minifyURLs: syncUrlMinifier }), output);

    // Canonical URLs must not be minified even with async minifier
    input = '<link rel="canonical" href="https://example.com/">';
    assert.strictEqual(await minify(input, { minifyURLs: asyncUrlMinifier }), input);
  });

  test('Async minifyURLs error handling', async () => {
    let input, output;

    // Test error handling—should fall back to original URL when async function throws
    const faultyAsyncMinifier = async (url) => {
      if (url.includes('error')) {
        throw new Error('Minification failed');
      }
      return url.replace('https://example.com/', '');
    };

    input = '<a href="https://example.com/good.html">good</a><a href="https://example.com/error.html">bad</a>';
    output = '<a href="good.html">good</a><a href="https://example.com/error.html">bad</a>';
    assert.strictEqual(await minify(input, { minifyURLs: faultyAsyncMinifier }), output);
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyURLs: faultyAsyncMinifier }),
      { message: 'Minification failed' }
    );

    // Test rejected promise handling
    const rejectingMinifier = (url) => {
      if (url.includes('reject')) {
        return Promise.reject(new Error('Rejected'));
      }
      return Promise.resolve(url.replace('https://example.com/', ''));
    };

    input = '<a href="https://example.com/good.html">good</a><a href="https://example.com/reject.html">bad</a>';
    output = '<a href="good.html">good</a><a href="https://example.com/reject.html">bad</a>';
    assert.strictEqual(await minify(input, { minifyURLs: rejectingMinifier }), output);
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyURLs: rejectingMinifier }),
      { message: 'Rejected' }
    );

    // Test error in `srcset` processing
    input = '<img srcset="https://example.com/good.jpg, https://example.com/error.jpg 2x">';
    output = '<img srcset="good.jpg, https://example.com/error.jpg 2x">';
    assert.strictEqual(await minify(input, { minifyURLs: faultyAsyncMinifier }), output);
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyURLs: faultyAsyncMinifier }),
      { message: 'Minification failed' }
    );

    // Test error in CSS `url()` processing
    input = '<style>body { background: url("https://example.com/error.png") }</style>';
    output = '<style>body{background:url(https://example.com/error.png)}</style>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: faultyAsyncMinifier }), output);
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true, minifyURLs: faultyAsyncMinifier }),
      { message: 'Minification failed' }
    );

    // Test CSS URLs with parentheses in file name (regression test for CSS URL regex bug)
    const urlWithParens = async (url) => url.replace('https://example.com/', '');
    input = '<style>body { background: url("https://example.com/foo(bar).png") }</style>';
    output = '<style>body{background:url(foo\\(bar\\).png)}</style>'; // Lightning CSS escapes parentheses when removing quotes
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyURLs: urlWithParens }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true, minifyURLs: urlWithParens }));
  });

  test('Value-less attributes', async () => {
    const input = '<br foo>';
    assert.strictEqual(await minify(input), input);
  });

  test('Newlines becoming whitespaces', async () => {
    const input = 'test\n\n<input>\n\ntest';
    const output = 'test <input> test';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('Conservative collapse', async () => {
    let input, output;

    input = '<b>   foo \n\n</b>';
    output = '<b> foo </b>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<html>\n\n<!--test-->\n\n</html>';
    output = '<html> </html>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p>\u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), input);

    input = '<p> \u00A0</p>';
    output = '<p>\u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p>\u00A0 </p>';
    output = '<p>\u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p> \u00A0 </p>';
    output = '<p>\u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p>  \u00A0\u00A0  \u00A0  </p>';
    output = '<p>\u00A0\u00A0 \u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p>foo  \u00A0\u00A0  \u00A0  </p>';
    output = '<p>foo \u00A0\u00A0 \u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p>  \u00A0\u00A0  \u00A0  bar</p>';
    output = '<p>\u00A0\u00A0 \u00A0 bar</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p>foo  \u00A0\u00A0  \u00A0  bar</p>';
    output = '<p>foo \u00A0\u00A0 \u00A0 bar</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p> \u00A0foo\u00A0\t</p>';
    output = '<p>\u00A0foo\u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p> \u00A0\nfoo\u00A0\t</p>';
    output = '<p>\u00A0 foo\u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p> \u00A0foo \u00A0\t</p>';
    output = '<p>\u00A0foo \u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    input = '<p> \u00A0\nfoo \u00A0\t</p>';
    output = '<p>\u00A0 foo \u00A0</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);
  });

  test('Collapse preserving a line break', async () => {
    let input, output;

    input = '\n\n\n<!DOCTYPE html>   \n<html lang="en" class="no-js">\n' +
      '  <head>\n    <meta charset="utf-8">\n    <meta http-equiv="X-UA-Compatible" content="IE=edge">\n\n\n\n' +
      '\t<!-- Copyright Notice -->\n' +
      '    <title>Carbon</title>\n\n\t<meta name="title" content="Carbon">\n\t\n\n' +
      '\t<meta name="description" content="A front-end framework.">\n' +
      '    <meta name="apple-mobile-web-app-capable" content="yes">\n' +
      '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
      '    <meta name="viewport" content="width=device-width, initial-scale=1">\n\n' +
      '<link href="stylesheets/application.css" rel="stylesheet">\n' +
      '    <script src="scripts/application.js"></script>\n' +
      '    <link href="images/icn-32x32.png" rel="shortcut icon">\n' +
      '    <link href="images/icn-152x152.png" rel="apple-touch-icon">\n  </head>\n  <body><p>\n   test test\n\ttest\n\n</p></body>\n</html>';
    output = '\n<!DOCTYPE html>\n<html lang="en" class="no-js">\n' +
      '<head>\n<meta charset="utf-8">\n<meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
      '<!-- Copyright Notice -->\n' +
      '<title>Carbon</title>\n<meta name="title" content="Carbon">\n' +
      '<meta name="description" content="A front-end framework.">\n' +
      '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<link href="stylesheets/application.css" rel="stylesheet">\n' +
      '<script src="scripts/application.js"></script>\n' +
      '<link href="images/icn-32x32.png" rel="shortcut icon">\n' +
      '<link href="images/icn-152x152.png" rel="apple-touch-icon">\n</head>\n<body><p>\ntest test test\n</p></body>\n</html>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true, preserveLineBreaks: true }), output);
    output = '\n<!DOCTYPE html>\n<html lang="en" class="no-js">\n' +
      '<head>\n<meta charset="utf-8">\n<meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
      '<title>Carbon</title>\n<meta name="title" content="Carbon">\n' +
      '<meta name="description" content="A front-end framework.">\n' +
      '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<link href="stylesheets/application.css" rel="stylesheet">\n' +
      '<script src="scripts/application.js"></script>\n' +
      '<link href="images/icn-32x32.png" rel="shortcut icon">\n' +
      '<link href="images/icn-152x152.png" rel="apple-touch-icon">\n</head>\n<body><p>\ntest test test\n</p></body>\n</html>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true, preserveLineBreaks: true, removeComments: true }), output);

    input = '<div> text <span>\n text</span> \n</div>';
    output = '<div>text <span>\ntext</span>\n</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true }), output);

    input = '<div>  text \n </div>';
    output = '<div>text\n</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true }), output);
    output = '<div> text\n</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true, preserveLineBreaks: true }), output);

    input = '<div>\ntext  </div>';
    output = '<div>\ntext</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true }), output);
    output = '<div>\ntext </div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true, preserveLineBreaks: true
    }), output);

    input = 'This is the start. <% … %>\r\n<%= … %>\r\n<? … ?>\r\n<!-- This is the middle, and a comment. -->\r\nNo comment, but middle.\r\n<?= … ?>\r\n<?php … ?>\r\n<?xml … ?>\r\nHello, this is the end!';
    output = 'This is the start. <% … %>\n<%= … %>\n<? … ?>\nNo comment, but middle.\n<?= … ?>\n<?php … ?>\n<?xml … ?>\nHello, this is the end!';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, preserveLineBreaks: true }), output);
  });

  test('Collapse inline tag whitespace', async () => {
    let input, output;

    input = '<button>a</button> <button>b</button>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);

    output = '<button>a</button><button>b</button>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    input = '<p>where <math> <mi>R</mi> </math> is the Rici tensor.</p>';
    output = '<p>where <math><mi>R</mi></math> is the Rici tensor.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    output = '<p>where<math><mi>R</mi></math>is the Rici tensor.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);
  });

  test('Preserve whitespace around inline text elements with collapseInlineTagWhitespace', async () => {
    let input, output;

    // Links should preserve surrounding whitespace
    input = '<p>This is <a href="test.html">a link</a> in text.</p>';
    output = '<p>This is <a href=test.html>a link</a> in text.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true, removeAttributeQuotes: true }), output);

    // Multiple links with spaces
    input = '<p>Code Responsibly von den <a href="https://webkrauts.de/">Webkrauts</a> und <a href="https://meiert.com/de/">Jens Oliver Meiert</a>.</p>';
    output = '<p>Code Responsibly von den <a href=https://webkrauts.de/>Webkrauts</a> und <a href=https://meiert.com/de/>Jens Oliver Meiert</a>.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true, removeAttributeQuotes: true }), output);

    // `strong`, `em`, and other inline text elements
    input = '<p>This is <strong>important</strong> and <em>emphasized</em> text.</p>';
    output = '<p>This is <strong>important</strong> and <em>emphasized</em> text.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Nested inline text elements
    input = '<p>This has <span>a <strong>nested</strong> structure</span> here.</p>';
    output = '<p>This has <span>a <strong>nested</strong> structure</span> here.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Multiple inline text elements: `abbr`, `b`, `i`, `u`, `s`, `small`
    input = '<p>Text with <abbr>abbr</abbr> and <b>bold</b> and <i>italic</i> and <u>underline</u> and <s>strike</s> and <small>small</small> elements.</p>';
    output = '<p>Text with <abbr>abbr</abbr> and <b>bold</b> and <i>italic</i> and <u>underline</u> and <s>strike</s> and <small>small</small> elements.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Test with “comprehensive” preset
    input = '<div>That’s not <a href="../">the whole story</a>!</div>';
    output = '<div>That’s not <a href=../>the whole story</a>!</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true, removeAttributeQuotes: true }), output);

    // Whitespace should be preserved inside custom elements
    input = '<my-button><span>Click</span> here</my-button>';
    output = '<my-button><span>Click</span> here</my-button>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Whitespace collapsing inside custom elements
    input = '<user-card  class="active"  >\n  <h2>Name</h2>\n  <p>Bio with <strong>bold</strong> text</p>  \n</user-card>';
    output = '<user-card class=active><h2>Name</h2><p>Bio with <strong>bold</strong> text</p></user-card>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeAttributeQuotes: true }), output);
  });

  test('Collapse whitespace between form controls with collapseInlineTagWhitespace', async () => {
    let input, output;

    // Form controls: `button`
    input = '<form> <button>Buy now</button> </form>';
    output = '<form><button>Buy now</button></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Form controls: `input` and `button`
    input = '<form><input type="hidden" name="tag" value="example"> <button>Buy now</button></form>';
    output = '<form><input type="hidden" name="tag" value="example"><button>Buy now</button></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<form><input type="hidden" name="tag" value="example"><button>Buy now</button></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Form controls: `input` without quotes and `button`
    input = '<form><input type=hidden name=tag value=example> <button>Buy now</button></form>';
    output = '<form><input type=hidden name=tag value=example><button>Buy now</button></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<form><input type=hidden name=tag value=example><button>Buy now</button></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Multiple `input` elements
    input = '<form><input type="text"> <input type="radio"></form>';
    output = '<form><input type="text"> <input type="radio"></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<form><input type="text"><input type="radio"></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Input with `textarea`
    input = '<form><input type="text"> <textarea></textarea></form>';
    output = '<form><input type="text"> <textarea></textarea></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<form><input type="text"><textarea></textarea></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Input with `select`
    input = '<form><input> <select><option>A</option></select></form>';
    output = '<form><input> <select><option>A</option></select></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<form><input><select><option>A</option></select></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Input with other form controls: `output`, `meter`, `progress`
    input = '<form><input> <output>Result</output> <meter value="0.6">60%</meter> <progress value="70" max="100">70%</progress></form>';
    output = '<form><input> <output>Result</output> <meter value="0.6">60%</meter> <progress value="70" max="100">70%</progress></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<form><input><output>Result</output><meter value="0.6">60%</meter><progress value="70" max="100">70%</progress></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Preserve whitespace when input is in text flow (not between form controls)
    input = '<p>Enter name: <input> here</p>';
    output = '<p>Enter name: <input> here</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    // Should still preserve space in text flow even with aggressive option
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Text adjacent to `input`
    input = '<div>a <input> c</div>';
    output = '<div>a <input> c</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    // Should still preserve space in text flow even with aggressive option
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Input with non-form-control inline elements (`a`, `span`, etc.)
    input = '<div><input> <span>text</span></div>';
    output = '<div><input> <span>text</span></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    // Should preserve space when not between form controls
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Preserve meaningful text content between form controls
    input = '<form>Name: <input type="text"> Email: <input type="email"> Age: <input type="number"></form>';
    output = '<form>Name: <input type="text"> Email: <input type="email"> Age: <input type="number"></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    // Text content like “ Email: ” must be preserved even with aggressive option
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // Multiple inputs with only whitespace (no text) should collapse
    input = '<form><input type="text"> <input type="text"> <input type="text"></form>';
    output = '<form><input type="text"> <input type="text"> <input type="text"></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
    output = '<form><input type="text"><input type="text"><input type="text"></form>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true }), output);

    // `datalist` with `option` elements
    input = '<datalist> <option label="A" value="1"> <option label="B" value="2"> </datalist>';
    output = '<datalist><option label="A" value="1"><option label="B" value="2"></datalist>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, includeAutoGeneratedTags: false }), output);
  });

  test('Ignoring custom comments', async () => {
    let input;

    input = '<!--! test -->';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { removeComments: true }), input);
    assert.strictEqual(await minify(input, { ignoreCustomComments: false }), input);
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomComments: [] }), '');
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomComments: false }), '');

    input = '<!-- htmlmin:ignore -->test<!-- htmlmin:ignore -->';
    const output = 'test';
    assert.strictEqual(await minify(input), output);
    assert.strictEqual(await minify(input, { removeComments: true }), output);
    assert.strictEqual(await minify(input, { ignoreCustomComments: false }), output);
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomComments: [] }), output);
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomComments: false }), output);

    input = '<!-- ko if: someExpressionGoesHere --><li>test</li><!-- /ko -->';
    // Ignore knockout comments
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomComments: [/^\s+ko/, /\/ko\s+$/] }), input);

    input = '<!--#include virtual="/cgi-bin/counter.pl" -->';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { removeComments: true }), input);
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomComments: false }), '');
    assert.strictEqual(await minify(input, { removeComments: true, ignoreCustomComments: [] }), '');
  });

  test('processScripts', async () => {
    const input = '<script type="text/ng-template"><!--test--><div>   <span> foobar </span> \n\n</div></script>';
    const output = '<script type="text/ng-template"><div><span>foobar</span></div></script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeComments: true, processScripts: ['text/ng-template'] }), output);
  });

  test('processScripts matching semantics (raw value) vs. JSON detection (normalized value)', async () => {
    // processScripts should match against RAW value (case-sensitive, exact match)
    let input = '<script type="Text/NG-Template"><div> test </div></script>';
    // Must match exact case
    let result = await minify(input, { collapseWhitespace: true, processScripts: ['Text/NG-Template'] });
    assert.ok(result.includes('<div>test</div>'), 'processScripts should match raw case-sensitive value');

    // processScripts should not match if case differs
    // Different case
    result = await minify(input, { collapseWhitespace: true, processScripts: ['text/ng-template']
    });
    assert.ok(result.includes('<div> test </div>'), 'processScripts should not match different case');

    // JSON detection should use normalized value (case-insensitive)
    input = '<script type="Application/LD+JSON">{"foo": "bar"}</script>';
    result = await minify(input, { collapseWhitespace: true });
    assert.strictEqual(result, '<script type="Application/LD+JSON">{"foo":"bar"}</script>', 'JSON detection should be case-insensitive');

    // JSON detection should strip parameters
    input = '<script type="application/json; charset=utf-8">{"foo": "bar"}</script>';
    result = await minify(input, { collapseWhitespace: true });
    assert.ok(result.includes('{"foo":"bar"}'), 'JSON detection should strip parameters');
  });

  test('JSON script minification for application/ld+json', async () => {
    const input = '<script type="application/ld+json">{"foo":  "bar"}\n\n</script>';
    const output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/ld+json (invalid/malformed)', async () => {
    const input = '<script type="application/ld+json">{"foo:  "bar"}\n\n</script>';
    const output = '<script type="application/ld+json">{"foo:  "bar"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for importmap', async () => {
    const input = '<script type="importmap">\n{\n  "imports": {\n    "lodash": "/js/lodash.js",\n    "vue": "https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js"\n  }\n}\n</script>';
    const output = '<script type="importmap">{"imports":{"lodash":"/js/lodash.js","vue":"https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js"}}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/json', async () => {
    const input = '<script type="application/json">{\n  "data": {\n    "name": "test",\n    "value": 123\n  }\n}</script>';
    const output = '<script type="application/json">{"data":{"name":"test","value":123}}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for speculationrules', async () => {
    const input = '<script type="speculationrules">{\n  "prerender": [\n    {\n      "source": "list",\n      "urls": ["/page1", "/page2"]\n    }\n  ]\n}</script>';
    const output = '<script type="speculationrules">{"prerender":[{"source":"list","urls":["/page1","/page2"]}]}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/manifest+json', async () => {
    const input = '<script type="application/manifest+json">{\n  "name": "App",\n  "version": "1.0"\n}</script>';
    const output = '<script type="application/manifest+json">{"name":"App","version":"1.0"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/manifest+json (invalid/malformed)', async () => {
    const input = '<script type="application/manifest+json">{"name": invalid}\n</script>';
    const output = '<script type="application/manifest+json">{"name": invalid}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/vnd.geo+json', async () => {
    const input = '<script type="application/vnd.geo+json">{\n  "type": "Point",\n  "coordinates": [100.0, 0.0]\n}</script>';
    const output = '<script type="application/vnd.geo+json">{"type":"Point","coordinates":[100,0]}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/vnd.geo+json (invalid/malformed)', async () => {
    const input = '<script type="application/vnd.geo+json">{"type": Point}\n</script>';
    const output = '<script type="application/vnd.geo+json">{"type": Point}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for case-insensitive type attribute', async () => {
    const input = '<script type="Application/JSON">{\n  "test": "value"\n}</script>';
    const output = '<script type="Application/JSON">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for type attribute with whitespace', async () => {
    const input = '<script type=" application/json ">{\n  "test": "value"\n}</script>';
    const output = '<script type="application/json">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for type attribute with charset parameter', async () => {
    const input = '<script type="application/json; charset=utf-8">{\n  "test": "value"\n}</script>';
    const output = '<script type="application/json;charset=utf-8">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/problem+json', async () => {
    const input = '<script type="application/problem+json">{\n  "type": "about:blank",\n  "status": 404\n}</script>';
    const output = '<script type="application/problem+json">{"type":"about:blank","status":404}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/merge-patch+json', async () => {
    const input = '<script type="application/merge-patch+json">{\n  "title": "New Title"\n}</script>';
    const output = '<script type="application/merge-patch+json">{"title":"New Title"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/json-patch+json', async () => {
    const input = '<script type="application/json-patch+json">[\n  {\n    "op": "replace",\n    "path": "/title",\n    "value": "New"\n  }\n]</script>';
    const output = '<script type="application/json-patch+json">[{"op":"replace","path":"/title","value":"New"}]</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for application/merge-patch+json (invalid/malformed)', async () => {
    const input = '<script type="application/merge-patch+json">{"title": invalid value}\n</script>';
    const output = '<script type="application/merge-patch+json">{"title": invalid value}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON script minification for error handling', async () => {
    // Malformed JSON should be preserved with default `continueOnMinifyError: true`
    let input = '<script type="application/ld+json">{"foo:  "bar"}</script>';
    let result = await minify(input, { collapseWhitespace: true });
    assert.strictEqual(result, input);

    // Malformed JSON should throw with `continueOnMinifyError: false`
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, collapseWhitespace: true }),
      SyntaxError
    );

    // Valid JSON should work fine with `continueOnMinifyError: false`
    input = '<script type="application/ld+json">{"foo": "bar"}</script>';
    const output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, collapseWhitespace: true }));
    result = await minify(input, { continueOnMinifyError: false, collapseWhitespace: true });
    assert.strictEqual(result, output);
  });

  test('JSON script minification with presets', async () => {
    const { getPreset } = await import('../src/presets.js');

    // Test with conservative preset
    let input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html>\n  <head>\n    <!-- Comment -->\n    <script type="application/ld+json">\n{\n  "name": "Test",\n  "url": "https://example.com/page"\n}\n    </script>\n  </head>\n</html>';
    let conservativeResult = await minify(input, getPreset('conservative'));
    // Conservative preset should: remove comments, collapse whitespace, minify JSON, use short doctype
    assert.ok(!conservativeResult.includes('<!-- Comment -->'), 'Conservative: should remove comments');
    assert.ok(conservativeResult.includes('<!doctype html>'), 'Conservative: should use short doctype');
    assert.ok(conservativeResult.includes('{"name":"Test","url":"https://example.com/page"}'), 'Conservative: should minify JSON');
    assert.ok(!conservativeResult.includes('\n{\n'), 'Conservative: should collapse whitespace in script content');

    // Test with comprehensive preset
    input = '<script type="importmap">\n{\n  "imports": {\n    "vue": "https://cdn.example.com/vue.js"\n  }\n}\n</script>';
    let comprehensiveResult = await minify(input, getPreset('comprehensive'));
    // Comprehensive preset should: minify JSON, collapse whitespace, remove quotes from attributes where possible
    assert.ok(comprehensiveResult.includes('{"imports":{"vue":"https://cdn.example.com/vue.js"}}'), 'Comprehensive: should minify JSON');
    assert.ok(comprehensiveResult.includes('type=importmap'), 'Comprehensive: should remove attribute quotes');

    // Verify JSON minification works even with no options (automatic behavior)
    input = '<script type="application/json">{\n  "test": "value"\n}</script>';
    const noOptionsResult = await minify(input, {});
    assert.strictEqual(noOptionsResult, '<script type="application/json">{"test":"value"}</script>', 'No options: should still minify JSON automatically');
  });

  test('Ignore', async () => {
    let input, output;

    input = '<!-- htmlmin:ignore --><div class="blah" style="color: red">\n   test   <span> <input disabled/>  foo </span>\n\n   </div><!-- htmlmin:ignore -->' +
      '<div class="blah" style="color: red">\n   test   <span> <input disabled/>  foo </span>\n\n   </div>';
    output = '<div class="blah" style="color: red">\n   test   <span> <input disabled/>  foo </span>\n\n   </div>' +
      '<div class="blah" style="color: red">test <span><input disabled=disabled> foo</span></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<!-- htmlmin:ignore --><!-- htmlmin:ignore -->';
    assert.strictEqual(await minify(input), '');

    input = '<p>…..</p><!-- htmlmin:ignore -->' +
      '@for( $i = 0 ; $i < $criterions->count() ; $i++ )' +
      '<h1>{{ $criterions[$i]->value }}</h1>' +
      '@endfor' +
      '<!-- htmlmin:ignore --><p>….</p>';
    output = '<p>…..</p>' +
      '@for( $i = 0 ; $i < $criterions->count() ; $i++ )' +
      '<h1>{{ $criterions[$i]->value }}</h1>' +
      '@endfor' +
      '<p>….</p>';
    assert.strictEqual(await minify(input, { removeComments: true }), output);

    input = '<!-- htmlmin:ignore --> <p class="logged"|cond="$is_logged === true" id="foo"> bar</p> <!-- htmlmin:ignore -->';
    output = ' <p class="logged"|cond="$is_logged === true" id="foo"> bar</p> ';
    assert.strictEqual(await minify(input), output);

    input = '<!-- htmlmin:ignore --><body <?php body_class(); ?>><!-- htmlmin:ignore -->';
    output = '<body <?php body_class(); ?>>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<\?php[\s\S]*?\?>/] }), output);

    input = 'a\n<!-- htmlmin:ignore -->b<!-- htmlmin:ignore -->';
    output = 'a b';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<p>foo <!-- htmlmin:ignore --><span>\n\tbar\n</span><!-- htmlmin:ignore -->.</p>';
    output = '<p>foo <span>\n\tbar\n</span>.</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    input = '<!-- htmlmin:ignore -->+<!-- htmlmin:ignore -->0';
    assert.strictEqual(await minify(input), '+0');
  });

  test('Whitespace-collapsing between consecutive htmlmin:ignore blocks (issue #145)', async () => {
    let input, output;

    // Simple consecutive ignore blocks with HTML elements
    input = '<!-- htmlmin:ignore --><p>foo</p><!-- htmlmin:ignore --><p>bar</p>';
    output = '<p>foo</p><p>bar</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Multiple consecutive ignore blocks with newlines
    input = '<!-- htmlmin:ignore --><p>foo</p><!-- htmlmin:ignore -->\n<!-- htmlmin:ignore --><p>bar</p><!-- htmlmin:ignore -->\n<p>baz</p>';
    output = '<p>foo</p><p>bar</p><p>baz</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Multiple ignore blocks with various whitespace (spaces, tabs, newlines)
    input = '<!-- htmlmin:ignore --><p>foo</p><!-- htmlmin:ignore -->  \n\t  <!-- htmlmin:ignore --><p>bar</p><!-- htmlmin:ignore -->';
    output = '<p>foo</p><p>bar</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Conservative collapse mode should keep single space
    input = '<!-- htmlmin:ignore --><span>foo</span><!-- htmlmin:ignore -->   <!-- htmlmin:ignore --><span>bar</span><!-- htmlmin:ignore -->';
    output = '<span>foo</span> <span>bar</span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, conservativeCollapse: true }), output);

    // Without `collapseWhitespace`, whitespace should remain
    input = '<!-- htmlmin:ignore --><p>foo</p><!-- htmlmin:ignore -->\n<!-- htmlmin:ignore --><p>bar</p><!-- htmlmin:ignore -->';
    output = '<p>foo</p>\n<p>bar</p>';
    assert.strictEqual(await minify(input), output);

    // Text content inside paragraph should preserve whitespace
    input = '<p><!-- htmlmin:ignore -->text<!-- htmlmin:ignore -->\n  <!-- htmlmin:ignore -->more<!-- htmlmin:ignore --></p>';
    output = '<p>text more</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Text content should preserve whitespace (not HTML)
    input = '<!-- htmlmin:ignore -->a<!-- htmlmin:ignore --> <!-- htmlmin:ignore -->b<!-- htmlmin:ignore -->';
    output = 'a b';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Mixed HTML and text—only collapse between HTML blocks
    input = '<!-- htmlmin:ignore --><div>x</div><!-- htmlmin:ignore --> <!-- htmlmin:ignore -->text<!-- htmlmin:ignore -->';
    output = '<div>x</div> text';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Inline elements should preserve whitespace
    input = '<!-- htmlmin:ignore --><span>foo</span><!-- htmlmin:ignore --> <!-- htmlmin:ignore --><span>bar</span><!-- htmlmin:ignore -->';
    output = '<span>foo</span> <span>bar</span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Other inline elements should preserve whitespace
    input = '<!-- htmlmin:ignore --><b>foo</b><!-- htmlmin:ignore --> <!-- htmlmin:ignore --><b>bar</b><!-- htmlmin:ignore --> <b>baz</b>';
    output = '<b>foo</b> <b>bar</b> <b>baz</b>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Block elements should collapse whitespace
    input = '<!-- htmlmin:ignore --><div>foo</div><!-- htmlmin:ignore -->\n  <!-- htmlmin:ignore --><div>bar</div><!-- htmlmin:ignore -->';
    output = '<div>foo</div><div>bar</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // `pre` elements should preserve whitespace (no trimming/collapsing inside pre)
    input = '<pre><!-- htmlmin:ignore --><div>foo</div><!-- htmlmin:ignore -->\n  <!-- htmlmin:ignore --><div>bar</div><!-- htmlmin:ignore --></pre>';
    output = '<pre><div>foo</div>\n  <div>bar</div></pre>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // `preserveLineBreaks` should keep newlines between blocks
    input = '<!-- htmlmin:ignore --><div>foo</div><!-- htmlmin:ignore -->\n<!-- htmlmin:ignore --><div>bar</div><!-- htmlmin:ignore -->';
    output = '<div>foo</div>\n<div>bar</div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, preserveLineBreaks: true }), output);
  });

  test('meta viewport', async () => {
    let input, output;

    input = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
    output = '<meta name="viewport" content="width=device-width,initial-scale=1">';
    assert.strictEqual(await minify(input), output);

    input = '<meta name="viewport" content="initial-scale=1, maximum-scale=1.0">';
    output = '<meta name="viewport" content="initial-scale=1,maximum-scale=1">';
    assert.strictEqual(await minify(input), output);

    input = '<meta name="viewport" content="width= 500 ,  initial-scale=1">';
    output = '<meta name="viewport" content="width=500,initial-scale=1">';
    assert.strictEqual(await minify(input), output);

    input = '<meta name="viewport" content="width=device-width, initial-scale=1.0001, maximum-scale=3.140000">';
    output = '<meta name="viewport" content="width=device-width,initial-scale=1.0001,maximum-scale=3.14">';
    assert.strictEqual(await minify(input), output);
  });

  test('Downlevel-revealed conditional comments', async () => {
    const input = '<![if !IE]><link href="non-ie.css" rel="stylesheet"><![endif]>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { removeComments: true }), input);
  });

  test('noscript', async () => {
    let input;

    input = '<SCRIPT SRC="x"></SCRIPT><NOSCRIPT>x</NOSCRIPT>';
    assert.strictEqual(await minify(input), '<script src="x"></script><noscript>x</noscript>');

    input = '<noscript>\n<!-- anchor linking to external file -->\n' +
      '<a href="#" onclick="javascript:">External Link</a>\n</noscript>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, removeEmptyAttributes: true }),
      '<noscript><a href="#">External Link</a></noscript>');
  });

  test('Max line length', async () => {
    let input;
    const options = { maxLineLength: 25 };

    input = '123456789012345678901234567890';
    assert.strictEqual(await minify(input, options), input);

    input = '<div data-attr="foo"></div>';
    assert.strictEqual(await minify(input, options), '<div data-attr="foo">\n</div>');

    input = [
      '<code>    hello   world   ',
      '    world   hello  </code>'
    ].join('\n');
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, options), [
      '<code>',
      '    hello   world   ',
      '    world   hello  ',
      '</code>'
    ].join('\n'));

    assert.strictEqual(await minify('<p title="</p>">x</p>'), '<p title="</p>">x</p>');
    assert.strictEqual(await minify('<p title=" <!-- hello world --> ">x</p>'), '<p title=" <!-- hello world --> ">x</p>');
    assert.strictEqual(await minify('<p title=" <![CDATA[ \n\n foobar baz ]]> ">x</p>'), '<p title=" <![CDATA[ \n\n foobar baz ]]> ">x</p>');
    assert.strictEqual(await minify('<p foo-bar=baz>xxx</p>'), '<p foo-bar=baz>xxx</p>');
    assert.strictEqual(await minify('<p foo:bar=baz>xxx</p>'), '<p foo:bar=baz>xxx</p>');

    input = [
      '<div><div><div><div><div>',
      '<div><div><div><div><div>',
      'i\'m 10 levels deep</div>',
      '</div></div></div></div>',
      '</div></div></div></div>',
      '</div>'
    ];
    assert.strictEqual(await minify(input.join('')), input.join(''));
    assert.strictEqual(await minify(input.join(''), options), input.join('\n'));

    input = [
      '<div><div><?foo?><div>',
      '<div><div><?bar?><div>',
      '<div><div>',
      'i\'m 9 levels deep</div>',
      '</div></div><%baz%></div>',
      '</div></div><%moo%></div>',
      '</div>'
    ];
    assert.strictEqual(await minify(input.join('')), input.join(''));
    assert.strictEqual(await minify(input.join(''), options), input.join('\n'));

    assert.strictEqual(await minify('<script>alert(\'<!--\')</script>', options), '<script>alert(\'<!--\')\n</script>');
    input = '<script>\nalert(\'<!-- foo -->\')\n</script>';
    assert.strictEqual(await minify('<script>alert(\'<!-- foo -->\')</script>', options), input);
    assert.strictEqual(await minify(input, options), input);
    assert.strictEqual(await minify('<script>alert(\'-->\')</script>', options), '<script>alert(\'-->\')\n</script>');

    assert.strictEqual(await minify('<a title="x"href=" ">foo</a>', options), '<a title="x" href="">foo\n</a>');
    assert.strictEqual(await minify('<p id=""class=""title="">x', options), '<p id="" class="" \ntitle="">x</p>');
    assert.strictEqual(await minify('<p x="x\'"">x</p>', options), '<p x="x\'">x</p>', 'trailing quote should be ignored');
    assert.strictEqual(await minify('<a href="#"><p>Click me</p></a>', options), '<a href="#"><p>Click me\n</p></a>');
    input = '<span><button>Hit me\n</button></span>';
    assert.strictEqual(await minify('<span><button>Hit me</button></span>', options), input);
    assert.strictEqual(await minify(input, options), input);
    assert.strictEqual(await minify('<object type="image/svg+xml" data="image.svg"><div>[fallback image]</div></object>', options),
      '<object \ntype="image/svg+xml" \ndata="image.svg"><div>\n[fallback image]</div>\n</object>'
    );

    assert.strictEqual(await minify('<ng-include src="x"></ng-include>', options), '<ng-include src="x">\n</ng-include>');
    assert.strictEqual(await minify('<ng:include src="x"></ng:include>', options), '<ng:include src="x">\n</ng:include>');
    assert.strictEqual(await minify('<ng-include src="\'views/partial-notification.html\'"></ng-include><div ng-view=""></div>', options),
      '<ng-include \nsrc="\'views/partial-notification.html\'">\n</ng-include><div \nng-view=""></div>'
    );

    input = [
      '<some-tag-1></some-tag-1>',
      '<some-tag-2></some-tag-2>',
      '<some-tag-3>4',
      '</some-tag-3>'
    ];
    assert.strictEqual(await minify(input.join('')), input.join(''));
    assert.strictEqual(await minify(input.join(''), options), input.join('\n'));

    assert.strictEqual(await minify('[\']["]', options), '[\']["]');
    assert.strictEqual(await minify('<a href="/test.html"><div>hey</div></a>', options), '<a href="/test.html">\n<div>hey</div></a>');
    assert.strictEqual(await minify(':) <a href="https://example.com">link</a>', options), ':) <a \nhref="https://example.com">\nlink</a>');
    assert.strictEqual(await minify(':) <a href="https://example.com">\nlink</a>', options), ':) <a \nhref="https://example.com">\nlink</a>');
    assert.strictEqual(await minify(':) <a href="https://example.com">\n\nlink</a>', options), ':) <a \nhref="https://example.com">\n\nlink</a>');

    assert.strictEqual(await minify('<a href>ok</a>', options), '<a href>ok</a>');

    options.noNewlinesBeforeTagClose = true;
    assert.strictEqual(await minify('<a title="x"href=" ">foo</a>', options), '<a title="x" href="">foo</a>');
  });

  test('Custom attribute collapse', async () => {
    let input, output;

    input = '<div data-bind="\n' +
      'css: {\n' +
      'fadeIn: selected(),\n' +
      'fadeOut: !selected()\n' +
      '},\n' +
      'visible: function () {\n' +
      'return pageWeAreOn() == \'home\';\n' +
      '}\n' +
      '">foo</div>';
    output = '<div data-bind="css: {fadeIn: selected(),fadeOut: !selected()},visible: function () {return pageWeAreOn() == \'home\';}">foo</div>';

    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { customAttrCollapse: /data-bind/ }), output);

    input = '<div style="' +
      'color: red;' +
      'font-size: 100em;' +
      '">bar</div>';
    output = '<div style="color: red;font-size: 100em;">bar</div>';
    assert.strictEqual(await minify(input, { customAttrCollapse: /style/ }), output);

    input = '<div ' +
      'class="fragment square" ' +
      'ng-hide="square1.hide" ' +
      'ng-class="{ \n\n' +
      '\'bounceInDown\': !square1.hide, ' +
      '\'bounceOutDown\': square1.hide ' +
      '}" ' +
      '> ' +
      '</div>';
    output = '<div class="fragment square" ng-hide="square1.hide" ng-class="{\'bounceInDown\': !square1.hide, \'bounceOutDown\': square1.hide }"> </div>';
    assert.strictEqual(await minify(input, { customAttrCollapse: /ng-class/ }), output);
  });

  test('Custom attribute collapse with empty attribute value', async () => {
    const input = '<div ng-some\n\n></div>';
    const output = '<div ng-some></div>';
    assert.strictEqual(await minify(input, { customAttrCollapse: /.+/ }), output);
  });

  test('Custom attribute collapse with newlines, whitespace, and carriage returns', async () => {
    const input = '<div ng-class="{ \n\r' +
      '               value:true, \n\r' +
      '               value2:false \n\r' +
      '               }"></div>';
    const output = '<div ng-class="{value:true,value2:false}"></div>';
    assert.strictEqual(await minify(input, { customAttrCollapse: /ng-class/ }), output);
  });

  test('Do not escape attribute value', async () => {
    let input;

    input = '<div data=\'{\n' +
      '\t"element": "<div class=\\"test\\"></div>\n"' +
      '}\'></div>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { preventAttributesEscaping: true }), input);

    input = '<div foo bar=\'\' baz="" moo=1 loo=\'2\' haa="3"></div>';
    assert.strictEqual(await minify(input, { preventAttributesEscaping: true }), input);
    const output = '<div foo bar=\'\' baz="" moo=1 loo=\'2\' haa="3"></div>';
    assert.strictEqual(await minify(input), output);
  });

  test('preventAttributesEscaping: Choose safe quote when decoded value contains double quotes', async () => {
    // When `decodeEntities` is used with `preventAttributesEscaping`, the minifier should
    // choose a safe quote character (opposite of what’s in the value) to avoid invalid HTML
    const entityInput = '<a data-rid-relay="{&quot;299&quot;: &quot;itsct&quot;}">Example</a>';
    const result1 = await minify(entityInput, { decodeEntities: true, preventAttributesEscaping: true });
    assert.strictEqual(result1, '<a data-rid-relay=\'{"299": "itsct"}\'>Example</a>',
      'Should switch to single quotes when value contains double quotes');

    // Original quotes should be preserved when they are safe
    const safeInput = '<a data-rid-relay=\'{"299": "itsct"}\'>Example</a>';
    const result2 = await minify(safeInput, { preventAttributesEscaping: true });
    assert.strictEqual(result2, '<a data-rid-relay=\'{"299": "itsct"}\'>Example</a>',
      'Should preserve single quotes when they are safe');

    // Edge case: `preventAttributesEscaping` with `removeTagWhitespace` and unquoted attributes should add quotes to avoid ambiguity
    const unquotedInput = '<br a=foo b=bar>';
    const result3 = await minify(unquotedInput, { preventAttributesEscaping: true, removeTagWhitespace: true });
    assert.strictEqual(result3, '<br a="foo"b=bar>',
      'Should add quotes to non-last unquoted attributes with removeTagWhitespace to prevent ambiguity');
  });

  test('preventAttributesEscaping with quoteCharacter: Handle quote conflicts safely', async () => {
    // When `quoteCharacter` is set but conflicts with attribute value content,
    // the minifier should switch to the opposite quote type to avoid invalid HTML

    // Test 1: `quoteCharacter: '\''` but value contains single quote—should switch to double quotes
    const input1 = '<p data="it\'s fine">text</p>';
    const result1 = await minify(input1, { preventAttributesEscaping: true, quoteCharacter: '\'' });
    assert.strictEqual(result1, '<p data="it\'s fine">text</p>',
      'Should switch to double quotes when single quoteCharacter conflicts with value content');

    // Test 2: `quoteCharacter: '"'` but value contains double quote—should switch to single quotes
    const input2 = '<p data=\'has "quotes"\'>text</p>';
    const result2 = await minify(input2, { preventAttributesEscaping: true, quoteCharacter: '"' });
    assert.strictEqual(result2, '<p data=\'has "quotes"\'>text</p>',
      'Should switch to single quotes when double quoteCharacter conflicts with value content');

    // Test 3: No conflict—should use preferred `quoteCharacter`
    const input3 = '<p data="safe value">text</p>';
    const result3 = await minify(input3, { preventAttributesEscaping: true, quoteCharacter: '\'' });
    assert.strictEqual(result3, '<p data=\'safe value\'>text</p>',
      'Should use preferred quoteCharacter when there is no conflict');
  });

  test('preventAttributesEscaping: Real-world Apple TV snippet with benchmark config', async () => {
    // Real-world example from Apple TV website with JSON data in `data-rid-relay` attribute
    const input = '<a id="media-gallery-item-1-link" class="media-gallery-wrapper-link fam-media-gallery-wrapper-link" href="https://tv.apple.com/us/movie/f1-the-movie/umc.cmc.3t6dvnnr87zwd4wmvpdx5came?l=en-US?itscg=10000&itsct=atv-apl_hp-stream_now--220622" data-analytics-title="stream now" data-rid-relay=\'{"289":"itsct"}\' data-analytics-exit-link data-analytics-activitymap-region-id="tv-plus-gallery-f1 the movie" aria-label="Stream now, F1 The Movie - Action - Now streaming on Apple TV.">Example</a>';

    // Benchmark config similar to current benchmarks/html-minifier.json
    const benchmarkConfig = {
      caseSensitive: false,
      collapseAttributeWhitespace: true,
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: true,
      collapseWhitespace: true,
      conservativeCollapse: false,
      continueOnMinifyError: true,
      continueOnParseError: true,
      decodeEntities: true,
      html5: true,
      includeAutoGeneratedTags: false,
      keepClosingSlash: false,
      minifyCSS: true,
      minifyJS: true,
      noNewlinesBeforeTagClose: true,
      preventAttributesEscaping: false,
      processConditionalComments: true,
      removeAttributeQuotes: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeEmptyElements: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      removeTagWhitespace: true,
      sortAttributes: false,
      sortClassName: false,
      trimCustomFragments: true,
      useShortDoctype: true
    };

    const result = await minify(input, benchmarkConfig);
    // Should successfully minify without parse errors
    assert.ok(result.length > 0, 'Should produce non-empty output');
    assert.ok(result.includes('data-rid-relay'), 'Should preserve data-rid-relay attribute');
    assert.ok(result.includes('{"289":"itsct"}'), 'Should preserve JSON data in attribute');
  });

  test('preventAttributesEscaping: Both quote types present forces escaping', async () => {
    // When an attribute value contains both single and double quotes,
    // `preventAttributesEscaping` is ignored to ensure valid HTML output.
    // The quote type with fewer occurrences is chosen and the other is escaped.

    // Test with `decodeEntities`: entities decoded, then escaping forced
    let result = await minify('<div title="He said &#34;hello&#34; and she said &#39;hi&#39;">Text</div>', {
      preventAttributesEscaping: true,
      decodeEntities: true
    });
    // When both quote types are present, at least one must be escaped to ensure valid HTML
    assert.ok(result.includes('&#34;') || result.includes('&#39;'),
      'Should escape quotes when both types are present');

    // Test choosing quote with fewer occurrences (fewer single quotes—use single quotes as delimiter)
    result = await minify('<p data-text="This has &#34;many&#34; &#34;double&#34; quotes and one &#39;single&#39;">Text</p>', {
      preventAttributesEscaping: true,
      decodeEntities: true
    });
    // Should use single quotes as delimiter (fewer occurrences) and escape the single quote in value
    assert.ok(result.includes("data-text='"), 'Should use single quotes as delimiter');
    assert.ok(result.includes('&#39;'), 'Should escape single quotes in value');
    // Double quotes don’t need escaping when attribute is delimited with single quotes
    assert.ok(result.includes('"many"'), 'Double quotes are valid inside single-quoted attribute');

    // Test with explicit `quoteCharacter`
    result = await minify('<span data-x="Has &#34;double&#34; and &#39;single&#39;">Text</span>', {
      preventAttributesEscaping: true,
      decodeEntities: true,
      quoteCharacter: '"'
    });
    assert.ok(result.includes('&#34;'), 'Should escape double quotes even with explicit quoteCharacter');

    // Test with `removeAttributeQuotes` (should not remove quotes when both types present)
    result = await minify('<div data-msg="Text with &#34;double&#34; and &#39;single&#39; quotes">Content</div>', {
      preventAttributesEscaping: true,
      decodeEntities: true,
      removeAttributeQuotes: true
    });
    // Quotes must remain because value contains spaces and special chars
    assert.ok(result.includes('data-msg='), 'Should have data-msg attribute');
    assert.ok(result.match(/data-msg=["']/), 'Should keep quotes on attribute with complex value');
    assert.ok(result.includes('&#34;') || result.includes('&#39;'), 'Should escape quotes');

    // Test with `quoteCharacter` and `removeAttributeQuotes` together
    result = await minify('<a href="test.html" data-safe="value" data-both="Has &#34;quotes&#34; and &#39;apostrophes&#39;">Link</a>', {
      preventAttributesEscaping: true,
      decodeEntities: true,
      removeAttributeQuotes: true,
      quoteCharacter: '\''
    });
    // Simple values can have quotes removed
    assert.ok(result.includes('href=test.html') || result.includes("href='test.html'"), 'href should be processed');
    assert.ok(result.includes('data-safe=value') || result.includes("data-safe='value'"), 'data-safe should be processed');
    // Complex value with both quotes must keep quotes and escape
    assert.ok(result.match(/data-both=["']/), 'data-both must keep quotes');
    assert.ok(result.includes('&#34;') || result.includes('&#39;'), 'Should escape quotes in data-both');
  });

  test('quoteCharacter is single quote', async () => {
    assert.strictEqual(await minify('<div class=\'bar\'>foo</div>', { quoteCharacter: '\'' }), '<div class=\'bar\'>foo</div>');
    assert.strictEqual(await minify('<div class="bar">foo</div>', { quoteCharacter: '\'' }), '<div class=\'bar\'>foo</div>');
  });

  test('quoteCharacter is not single quote or double quote', async () => {
    assert.strictEqual(await minify('<div class=\'bar\'>foo</div>', { quoteCharacter: 'm' }), '<div class="bar">foo</div>');
    assert.strictEqual(await minify('<div class="bar">foo</div>', { quoteCharacter: 'm' }), '<div class="bar">foo</div>');
  });

  test('Removing space between attributes', async () => {
    let input, output;
    const options = {
      collapseBooleanAttributes: true,
      keepClosingSlash: true,
      removeAttributeQuotes: true,
      removeTagWhitespace: true
    };

    input = '<input data-attr="example" value="hello world!" checked="checked">';
    output = '<input data-attr=example value="hello world!"checked>';
    assert.strictEqual(await minify(input, options), output);

    input = '<input checked="checked" value="hello world!" data-attr="example">';
    output = '<input checked value="hello world!"data-attr=example>';
    assert.strictEqual(await minify(input, options), output);

    input = '<input checked="checked" data-attr="example" value="hello world!">';
    output = '<input checked data-attr=example value="hello world!">';
    assert.strictEqual(await minify(input, options), output);

    input = '<input data-attr="example" value="hello world!" checked="checked"/>';
    output = '<input data-attr=example value="hello world!"checked/>';
    assert.strictEqual(await minify(input, options), output);

    input = '<input checked="checked" value="hello world!" data-attr="example"/>';
    output = '<input checked value="hello world!"data-attr=example />';
    assert.strictEqual(await minify(input, options), output);

    input = '<input checked="checked" data-attr="example" value="hello world!"/>';
    output = '<input checked data-attr=example value="hello world!"/>';
    assert.strictEqual(await minify(input, options), output);
  });

  test('Markup from Angular 2', async () => {
    let output;
    const input = '<template ngFor #hero [ngForOf]="heroes">\n' +
      '  <hero-detail *ngIf="hero" [hero]="hero"></hero-detail>\n' +
      '</template>\n' +
      '<form (ngSubmit)="onSubmit(theForm)" #theForm="ngForm">\n' +
      '  <div class="form-group">\n' +
      '    <label for="name">Name</label>\n' +
      '    <input class="form-control" required ngControl="firstName"\n' +
      '      [(ngModel)]="currentHero.firstName">\n' +
      '  </div>\n' +
      '  <button type="submit" [disabled]="!theForm.form.valid">Submit</button>\n' +
      '</form>';
    output = '<template ngFor #hero [ngForOf]="heroes">\n' +
      '  <hero-detail *ngIf="hero" [hero]="hero"></hero-detail>\n' +
      '</template>\n' +
      '<form (ngSubmit)="onSubmit(theForm)" #theForm="ngForm">\n' +
      '  <div class="form-group">\n' +
      '    <label for="name">Name</label>\n' +
      '    <input class="form-control" required ngControl="firstName" [(ngModel)]="currentHero.firstName">\n' +
      '  </div>\n' +
      '  <button type="submit" [disabled]="!theForm.form.valid">Submit</button>\n' +
      '</form>';
    assert.strictEqual(await minify(input, { caseSensitive: true }), output);
    output = '<template ngFor #hero [ngForOf]=heroes>' +
      '<hero-detail *ngIf=hero [hero]=hero></hero-detail>' +
      '</template>' +
      '<form (ngSubmit)=onSubmit(theForm) #theForm=ngForm>' +
      '<div class=form-group>' +
      '<label for=name>Name</label>' +
      ' <input class=form-control required ngControl=firstName [(ngModel)]=currentHero.firstName>' +
      '</div>' +
      '<button [disabled]=!theForm.form.valid>Submit</button>' +
      '</form>';
    assert.strictEqual(await minify(input, { caseSensitive: true, collapseBooleanAttributes: true, collapseWhitespace: true, removeAttributeQuotes: true, removeComments: true, removeEmptyAttributes: true, removeOptionalTags: true, removeRedundantAttributes: true, removeScriptTypeAttributes: true, removeStyleLinkTypeAttributes: true, removeTagWhitespace: true, useShortDoctype: true }), output);
  });

  test('Auto-generated tags', async () => {
    let input, output;

    input = '</p>';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false }), input);

    input = '<p id=""class=""title="">x';
    output = '<p id="" class="" title="">x';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false }), output);
    output = '<p id="" class="" title="">x</p>';
    assert.strictEqual(await minify(input), output);
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: true }), output);

    input = '<body onload="  foo();   bar() ;  "><p>x</body>';
    output = '<body onload="foo();   bar() ;"><p>x</body>';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false }), output);

    input = '<a href="#"><div>Well, look at me! I\'m a div!</div></a>';
    output = '<a href="#"><div>Well, look at me! I\'m a div!</div>';
    assert.strictEqual(await minify(input, { html5: false, includeAutoGeneratedTags: false }), output);
    assert.strictEqual(await minify('<p id=""class=""title="">x', {
      maxLineLength: 25,
      includeAutoGeneratedTags: false
    }), '<p id="" class="" \ntitle="">x');

    input = '<p>foo';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false }), input);
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false, removeOptionalTags: true }), input);

    input = '</p>';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false }), input);
    output = '';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false, removeOptionalTags: true }), output);

    input = '<select><option>foo<option>bar</select>';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false }), input);
    output = '<select><option>foo</option><option>bar</option></select>';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: true }), output);

    input = '<datalist><option label="A" value="1"><option label="B" value="2"></datalist>';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: false }), input);
    output = '<datalist><option label="A" value="1"></option><option label="B" value="2"></option></datalist>';
    assert.strictEqual(await minify(input, { includeAutoGeneratedTags: true }), output);
  });

  test('Sort attributes', async () => {
    let input, output;

    input = '<link href="foo">' +
      '<link rel="bar" href="baz">' +
      '<link type="text/css" href="app.css" rel="stylesheet" async>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { sortAttributes: false }), input);
    output = '<link href="foo">' +
      '<link href="baz" rel="bar">' +
      '<link href="app.css" rel="stylesheet" async type="text/css">';
    assert.strictEqual(await minify(input, { sortAttributes: true }), output);

    input = '<link href="foo">' +
      '<link rel="bar" href="baz">' +
      '<script type="text/html"><link type="text/css" href="app.css" rel="stylesheet" async></script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { sortAttributes: false }), input);
    output = '<link href="foo">' +
      '<link href="baz" rel="bar">' +
      '<script type="text/html"><link type="text/css" href="app.css" rel="stylesheet" async></script>';
    assert.strictEqual(await minify(input, { sortAttributes: true }), output);
    output = '<link href="foo">' +
      '<link href="baz" rel="bar">' +
      '<script type="text/html"><link href="app.css" rel="stylesheet" async type="text/css"></script>';
    assert.strictEqual(await minify(input, { processScripts: ['text/html'], sortAttributes: true }), output);

    input = '<link type="text/css" href="foo.css">' +
      '<link rel="stylesheet" type="text/abc" href="bar.css">' +
      '<link href="baz.css">';
    output = '<link href="foo.css" type="text/css">' +
      '<link href="bar.css" type="text/abc" rel="stylesheet">' +
      '<link href="baz.css">';
    assert.strictEqual(await minify(input, { sortAttributes: true }), output);
    output = '<link href="foo.css">' +
      '<link href="bar.css" rel="stylesheet" type="text/abc">' +
      '<link href="baz.css">';
    assert.strictEqual(await minify(input, { removeStyleLinkTypeAttributes: true, sortAttributes: true }), output);

    input = '<a foo moo></a>' +
      '<a bar foo></a>' +
      '<a baz bar foo></a>' +
      '<a baz foo moo></a>' +
      '<a moo baz></a>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { sortAttributes: false }), input);
    output = '<a foo moo></a>' +
      '<a foo bar></a>' +
      '<a foo bar baz></a>' +
      '<a foo baz moo></a>' +
      '<a baz moo></a>';
    assert.strictEqual(await minify(input, { sortAttributes: true }), output);

    input = '<span nav_sv_fo_v_column <#=(j === 0) ? \'nav_sv_fo_v_first\' : \'\' #> foo_bar></span>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<#[\s\S]*?#>/] }), input);
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<#[\s\S]*?#>/], sortAttributes: false }), input);
    output = '<span foo_bar nav_sv_fo_v_column <#=(j === 0) ? \'nav_sv_fo_v_first\' : \'\' #> ></span>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<#[\s\S]*?#>/], sortAttributes: true }), output);

    input = '<a 0 1 2 3 4 5 6 7 8 9 a b c d e f g h i j k l m n o p q r s t u v w x y z></a>';
    assert.strictEqual(await minify(input, { sortAttributes: true }), input);
  });

  test('Sort style classes', async () => {
    let input, output;

    input = '<a class="foo moo"></a>' +
      '<b class="bar foo"></b>' +
      '<i class="baz bar foo"></i>' +
      '<s class="baz foo moo"></s>' +
      '<u class="moo baz"></u>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { sortClassName: false }), input);
    output = '<a class="foo moo"></a>' +
      '<b class="foo bar"></b>' +
      '<i class="foo bar baz"></i>' +
      '<s class="foo baz moo"></s>' +
      '<u class="baz moo"></u>';
    assert.strictEqual(await minify(input, { sortClassName: true }), output);

    input = '<a class="moo <!-- htmlmin:ignore -->bar<!-- htmlmin:ignore --> foo baz"></a>';
    output = '<a class="moo bar foo baz"></a>';
    assert.strictEqual(await minify(input), output);
    assert.strictEqual(await minify(input, { sortClassName: false }), output);
    // When all classes have equal frequency, alphabetical order is used
    output = '<a class="bar baz foo moo"></a>';
    assert.strictEqual(await minify(input, { sortClassName: true }), output);

    input = '<div class="nav_sv_fo_v_column <#=(j === 0) ? \'nav_sv_fo_v_first\' : \'\' #> foo_bar"></div>';
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<#[\s\S]*?#>/] }), input);
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<#[\s\S]*?#>/], sortClassName: false }), input);
    assert.strictEqual(await minify(input, { ignoreCustomFragments: [/<#[\s\S]*?#>/], sortClassName: true }), input);

    input = '<a class="0 1 2 3 4 5 6 7 8 9 a b c d e f g h i j k l m n o p q r s t u v w x y z"></a>';
    assert.strictEqual(await minify(input, { sortClassName: false }), input);
    assert.strictEqual(await minify(input, { sortClassName: true }), input);

    input = '<a class="add sort keys createSorter"></a>';
    assert.strictEqual(await minify(input, { sortClassName: false }), input);
    output = '<a class="add createSorter keys sort"></a>';
    assert.strictEqual(await minify(input, { sortClassName: true }), output);

    input = '<span class="sprite sprite-{{sprite}}"></span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: [/{{.*?}}/], removeAttributeQuotes: true, sortClassName: true }), input);

    input = '<span class="{{sprite}}-sprite sprite"></span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: [/{{.*?}}/], removeAttributeQuotes: true, sortClassName: true }), input);

    input = '<span class="sprite-{{sprite}}-sprite"></span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: [/{{.*?}}/], removeAttributeQuotes: true, sortClassName: true }), input);

    input = '<span class="{{sprite}}"></span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: [/{{.*?}}/], removeAttributeQuotes: true, sortClassName: true }), input);

    input = '<span class={{sprite}}></span>';
    output = '<span class="{{sprite}}"></span>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, ignoreCustomFragments: [/{{.*?}}/], removeAttributeQuotes: true, sortClassName: true }), output);

    input = '<div class></div>';
    assert.strictEqual(await minify(input, { sortClassName: false }), input);
    assert.strictEqual(await minify(input, { sortClassName: true }), input);
  });

  test('Collapse attribute whitespace', async () => {
    let input, output;

    // Should not collapse by default (note: `class` attribute values always collapse, so test with other attributes)
    input = '<article title="foo  bar" data-selector="teaser-object parent-image-label picture-article" data-external-selector="\n      teaser-object parent-image-label \n        \n    "></article>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: false }), input);

    // Should collapse with `collapseAttributeWhitespace: true`
    output = '<article title="foo bar" data-selector="teaser-object parent-image-label picture-article" data-external-selector="teaser-object parent-image-label"></article>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), output);

    // Multiple spaces in `alt` attribute
    input = '<img src="example" alt="Dieser Blick könnte Rückschlüsse auf Jane Austens Skepsis nahelegen, doch das Miniaturbild  ist  postum entstanden, Ende des neunzehnten Jahrhunderts.">';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), input);
    output = '<img src="example" alt="Dieser Blick könnte Rückschlüsse auf Jane Austens Skepsis nahelegen, doch das Miniaturbild ist postum entstanden, Ende des neunzehnten Jahrhunderts.">';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), output);

    // Multiple spaces in `media` attribute
    input = '<source media="(min-width:  768px)">';
    assert.strictEqual(await minify(input, { minifyCSS: true }), input);
    output = '<source media="(min-width: 768px)">';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), output);
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true, minifyCSS: true }), output);

    // Leading and trailing whitespace
    input = '<div title="  hello world  "></div>';
    assert.strictEqual(await minify(input), input);
    output = '<div title="hello world"></div>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), output);

    // Should work with `sortClassName` (correct alphabetical expectation)
    input = '<article class="lg:border-grey-700 lg:dark:border-grey-700-dark mb-[40px] cursor-pointer sm:mx-[40px] lg:flex lg:flex-row lg:border-[1px] lg:border-solid" data-selector="teaser-object parent-image-label picture-article" data-external-selector="\n      teaser-object parent-image-label \n        \n    "></article>';
    output = '<article class="cursor-pointer lg:border-[1px] lg:border-grey-700 lg:border-solid lg:dark:border-grey-700-dark lg:flex lg:flex-row mb-[40px] sm:mx-[40px]" data-selector="teaser-object parent-image-label picture-article" data-external-selector="teaser-object parent-image-label"></article>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true, sortClassName: true }), output);

    // Complex script/div example with whitespace
    input = '<script>  avenga.snacks.init()</script><div id="personalisation" data-snacks-3:custom="_plugins [full-bleed], _tracking.inview = null">  <div data-snacks-3:filterslider="_tracking.inview { type = \'Filterslider\', subType = \'faz.net Startseite\', action = \'View\', label = \'Meine FAZ\' }, _tracking.click { type = \'Filterslider\', subType = \'faz.net Startseite\', action = \'Click\', label = \'Meine FAZ\' }, register_button { text = \'Kostenfrei aktivieren\'}, _load { type = auth, loggedin = false }, id = \'no-reload\', criteria { groupids [1] }, headline = \'Meine F.A.Z.\', introtext = \'Wählen Sie Ihre Lieblingsthemen und wir zeigen Ihnen an dieser Stelle passende Beiträge.\', count = 35, client_title = \'faznet\', _plugins [login-reload, [auth-track, { regtype = \'Filterslider\', regsubtype = \'faz.net Startseite\', logintype = \'Filterslider\', loginsubtype = \'faz.net Startseite\'}]], shape = square"></div></div>';
    output = '<script>avenga.snacks.init()</script><div id="personalisation" data-snacks-3:custom="_plugins [full-bleed], _tracking.inview = null"><div data-snacks-3:filterslider="_tracking.inview { type = \'Filterslider\', subType = \'faz.net Startseite\', action = \'View\', label = \'Meine FAZ\' }, _tracking.click { type = \'Filterslider\', subType = \'faz.net Startseite\', action = \'Click\', label = \'Meine FAZ\' }, register_button { text = \'Kostenfrei aktivieren\'}, _load { type = auth, loggedin = false }, id = \'no-reload\', criteria { groupids [1] }, headline = \'Meine F.A.Z.\', introtext = \'Wählen Sie Ihre Lieblingsthemen und wir zeigen Ihnen an dieser Stelle passende Beiträge.\', count = 35, client_title = \'faznet\', _plugins [login-reload, [auth-track, { regtype = \'Filterslider\', regsubtype = \'faz.net Startseite\', logintype = \'Filterslider\', loginsubtype = \'faz.net Startseite\'}]], shape = square"></div></div>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJS: true }), output);

    // Tabs and newlines should also be collapsed
    input = '<div data-value="hello\t\tworld\n\ntest"></div>';
    output = '<div data-value="hello world test"></div>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), output);

    // Should preserve single spaces
    input = '<p class="foo bar baz"></p>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), input);

    // Should work with `removeAttributeQuotes`
    input = '<p class=  foo title="  hello  world  "></p>';
    output = '<p class=foo title="hello world"></p>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true, removeAttributeQuotes: true }), output);

    // Should work together with `collapseWhitespace` for both text nodes and attributes
    input = '<p title="  foo   bar  ">\n  Hello   \n  world  \n</p>';
    output = '<p title="foo bar">Hello world</p>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseAttributeWhitespace: true }), output);

    // Special Unicode whitespace (hair space, non-breaking space) is preserved for consistency with `collapseWhitespace`
    input = '<div title="foo\u200Abar  baz"></div>';
    output = '<div title="foo\u200Abar baz"></div>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), output);

    // Non-breaking space is preserved (consistent with `collapseWhitespace` behavior in text nodes)
    input = '<div title="foo\u00A0\u00A0bar"></div>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true }), input);

    // Special Unicode whitespace (hair space, non-breaking space) is preserved for consistency with `collapseWhitespace`
    input = '<div title="foo\u200Abar  baz &nbsp; @&#8202;test"></div>';
    output = '<div title="foo bar baz   @ test"></div>';
    assert.strictEqual(await minify(input, { collapseAttributeWhitespace: true, decodeEntities: true }), output);
  });

  test('Decode entity characters', async () => {
    let input, output;

    input = '<!-- &ne; -->';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { decodeEntities: false }), input);
    assert.strictEqual(await minify(input, { decodeEntities: true }), input);

    // https://github.com/kangax/html-minifier/issues/964
    input = '&amp;xxx; &amp;xxx &ampthorn; &ampthorn &ampcurren;t &ampcurrent';
    output = '&ampxxx; &xxx &ampthorn; &ampthorn &ampcurren;t &ampcurrent';
    assert.strictEqual(await minify(input, { decodeEntities: true }), output);

    input = '<script type="text/html">&colon;</script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { decodeEntities: false }), input);
    assert.strictEqual(await minify(input, { decodeEntities: true }), input);
    output = '<script type="text/html">:</script>';
    assert.strictEqual(await minify(input, { decodeEntities: true, processScripts: ['text/html'] }), output);

    input = '<div style="font: &quot;monospace&#34;">foo&dollar;</div>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { decodeEntities: false }), input);
    output = '<div style=\'font: "monospace"\'>foo$</div>';
    assert.strictEqual(await minify(input, { decodeEntities: true }), output);
    output = '<div style="">foo&dollar;</div>'; // Lightning CSS rejects invalid CSS with HTML entities
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    assert.strictEqual(await minify(input, { decodeEntities: false, minifyCSS: true }), output);
    output = '<div style=\'font:"monospace"\'>foo$</div>'; // With `decodeEntities`, CSS becomes valid
    assert.strictEqual(await minify(input, { decodeEntities: true, minifyCSS: true }), output);
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, decodeEntities: false }));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, decodeEntities: true }));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected token/ },
    );
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, decodeEntities: false, minifyCSS: true }),
      { message: /Unexpected token/ },
    );
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, decodeEntities: true, minifyCSS: true }));

    input = '<a href="/?foo=1&amp;bar=&lt;2&gt;">baz&lt;moo&gt;&copy;</a>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { decodeEntities: false }), input);
    output = '<a href="/?foo=1&bar=<2>">baz&lt;moo>\u00a9</a>';
    assert.strictEqual(await minify(input, { decodeEntities: true }), output);

    input = '<? &amp; ?>&amp;<pre><? &amp; ?>&amp;</pre>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: false, decodeEntities: false }), input);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, decodeEntities: false }), input);
    output = '<? &amp; ?>&<pre><? &amp; ?>&</pre>';
    assert.strictEqual(await minify(input, { collapseWhitespace: false, decodeEntities: true }), output);
    assert.strictEqual(await minify(input, { collapseWhitespace: true, decodeEntities: true }), output);
  });

  test('Tests from PHPTAL', async () => {
    await Promise.all([
      // Trailing `</p>` removed by minifier, but not by PHPTAL
      ['<p>foo bar baz', '<p>foo     \t bar\n\n\n baz</p>'],
      ['<p>foo bar<pre>  \tfoo\t   \nbar   </pre>', '<p>foo   \t\n bar</p><pre>  \tfoo\t   \nbar   </pre>'],
      ['<p>foo <a href="">bar </a>baz', '<p>foo <a href=""> bar </a> baz  </p>'],
      ['<p>foo <a href="">bar </a>baz', ' <p>foo <a href=""> bar </a>baz </p>'],
      ['<p>foo<a href=""> bar </a>baz', ' <p> foo<a href=""> bar </a>baz </p>  '],
      ['<p>foo <a href="">bar</a> baz', ' <p> foo <a href="">bar</a> baz</p>'],
      ['<p>foo<br>', '<p>foo <br/></p>'],
      // PHPTAL remove whitespace after “foo”—problematic if `<span>` is used as icon font
      ['<p>foo <span></span>', '<p>foo <span></span></p>'],
      ['<p>foo <span></span>', '<p>foo <span></span> </p>'],
      // Comments removed by minifier, but not by PHPTAL
      ['<p>foo', '<p>foo <!-- --> </p>'],
      ['<div>a<div>b</div>c<div>d</div>e</div>', '<div>a <div>b</div> c <div> d </div> e </div>'],
      // Unary slashes removed by minifier, but not by PHPTAL
      ['<div><img></div>', '<div> <img/> </div>'],
      ['<div>x <img></div>', '<div> x <img/> </div>'],
      ['<div>x <img> y</div>', '<div> x <img/> y </div>'],
      ['<div><img> y</div>', '<div><img/> y </div>'],
      ['<div><button>Z</button></div>', '<div> <button>Z</button> </div>'],
      ['<div>x <button>Z</button></div>', '<div> x <button>Z</button> </div>'],
      ['<div>x <button>Z</button> y</div>', '<div> x <button>Z</button> y </div>'],
      ['<div><button>Z</button> y</div>', '<div><button>Z</button> y </div>'],
      ['<div><button>Z</button></div>', '<div> <button> Z </button> </div>'],
      ['<div>x <button>Z</button></div>', '<div> x <button> Z </button> </div>'],
      ['<div>x <button>Z</button> y</div>', '<div> x <button> Z </button> y </div>'],
      ['<div><button>Z</button> y</div>', '<div><button> Z </button> y </div>'],
      ['<script>//foo\nbar()</script>', '<script>//foo\nbar()</script>'],
      // Optional tags removed by minifier, but not by PHPTAL
      // Parser cannot handle `<script/>`
      [
        '<title></title><link><script>" ";</script><script></script><meta><style></style>',
        '<html >\n' +
        '<head > <title > </title > <link /> <script >" ";</script> <script>\n</script>\n' +
        ' <meta /> <style\n' +
        '  > </style >\n' +
        '   </head > </html>'
      ],
      ['<div><p>test 123<p>456<ul><li>x</ul></div>', '<div> <p> test 123 </p> <p> 456 </p> <ul> <li>x</li> </ul> </div>'],
      ['<div><p>test 123<pre> 456 </pre><p>x</div>', '<div> <p> test 123 </p> <pre> 456 </pre> <p> x </p> </div>'],
      /* minifier does not assume <li> as "display: inline"
      ['<div><ul><li><a>a </a></li><li>b </li><li>c</li></ul></div>', '<div> <ul> <li> <a> a </a> </li> <li> b </li> <li> c </li> </ul> </div>'], */
      ['<table>x<tr>x<td>foo</td>x</tr>x</table>', '<table> x <tr> x <td> foo </td> x </tr> x </table>'],
      ['<select>x<option></option>x<optgroup>x<option></option>x</optgroup>x</select>', '<select> x <option> </option> x <optgroup> x <option> </option> x </optgroup> x </select> '],
      // Closing slash and optional attribute quotes removed by minifier, but not by PHPTAL
      // Attribute ordering differences between minifier and PHPTAL
      ['<img alt=x height=5 src=foo width=10>', '<img width="10" height="5" src="foo" alt="x" />'],
      ['<img alpha=1 beta=2 gamma=3>', '<img gamma="3" alpha="1" beta="2" />'],
      ['<pre>\n\n\ntest</pre>', '<pre>\n\n\ntest</pre>'],
      /* single line-break preceding <pre> is redundant, assuming <pre> is block element
      ['<pre>test</pre>', '<pre>\ntest</pre>'], */
      // Closing slash and optional attribute quotes removed by minifier, but not by PHPTAL
      // Attribute ordering differences between minifier and PHPTAL
      // Redundant inter-attribute spacing removed by minifier, but not by PHPTAL
      ['<meta content="text/plain;charset=UTF-8"http-equiv=Content-Type>', '<meta http-equiv=\'Content-Type\' content=\'text/plain;charset=UTF-8\'/>'],
      /* minifier does not optimise <meta/> in HTML5 mode
      ['<meta charset=utf-8>', '<meta http-equiv=\'Content-Type\' content=\'text/plain;charset=UTF-8\'/>'], */
      /* minifier does not optimise <script/> in HTML5 mode
      [
        '<script></script><style></style>',
        '<script type=\'text/javascript ;charset=utf-8\'\n' +
        'language=\'javascript\'></script><style type=\'text/css\'></style>'
      ], */
      // Minifier removes more JavaScript `type` attributes than PHPTAL
      ['<script></script><script type=text/hack></script>', '<script type="text/javascript;e4x=1"></script><script type="text/hack"></script>']
      /* trim "title" attribute value in <a>
      [
        '<title>Foo</title><p><a title="x"href=test>x </a>xu</p><br>foo',
        '<html> <head> <title> Foo </title> </head>\n' +
        '<body>\n' +
        '<p>\n' +
        '<a title="   x " href=" test "> x </a> xu\n' +
        '</p>\n' +
        '<br/>\n' +
        'foo</body> </html>  <!-- bla -->'
      ] */
    ].map(async function (tokens) {
      assert.strictEqual(await minify(tokens[1], {
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true,
        removeComments: true,
        removeEmptyAttributes: true,
        removeOptionalTags: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        removeTagWhitespace: true,
        sortAttributes: true,
        useShortDoctype: true
      }), tokens[0]);
    }));
  });

  test('canCollapseWhitespace and canTrimWhitespace hooks', async () => {
    function canCollapseAndTrimWhitespace(tagName, attrs, defaultFn) {
      if ((attrs || []).some(function (attr) { return attr.name === 'class' && attr.value === 'leaveAlone'; })) {
        return false;
      }
      return defaultFn(tagName, attrs);
    }

    let input = '<div class="leaveAlone"><span> </span> foo  bar</div>';
    let output = '<div class="leaveAlone"><span> </span> foo  bar</div>';

    assert.strictEqual(await minify(input, { collapseWhitespace: true, canTrimWhitespace: canCollapseAndTrimWhitespace, canCollapseWhitespace: canCollapseAndTrimWhitespace }), output);

    // Regression test: Previously the first `</div>` would clear the internal
    // stackNo{Collapse,Trim}Whitespace, so that “ foo  bar” turned into “ foo bar”
    input = '<div class="leaveAlone"><div></div><span> </span> foo  bar</div>';
    output = '<div class="leaveAlone"><div></div><span> </span> foo  bar</div>';

    assert.strictEqual(await minify(input, { collapseWhitespace: true, canTrimWhitespace: canCollapseAndTrimWhitespace, canCollapseWhitespace: canCollapseAndTrimWhitespace }), output);

    // Make sure that the stack does get reset when leaving the element for which the hooks returned false
    input = '<div class="leaveAlone"></div><div> foo  bar </div>';
    output = '<div class="leaveAlone"></div><div>foo bar</div>';

    assert.strictEqual(await minify(input, { collapseWhitespace: true, canTrimWhitespace: canCollapseAndTrimWhitespace, canCollapseWhitespace: canCollapseAndTrimWhitespace }), output);
  });

  test('Minify Content-Security-Policy', async () => {
    let input, output;

    input = '<meta Http-Equiv="Content-Security-Policy"\t\t\t\tContent="default-src \'self\';\n\n\t\timg-src https://*;">';
    output = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; img-src https://*;">';
    assert.strictEqual(await minify(input), output);

    input = '<meta http-equiv="content-security-policy"\t\t\t\tcontent="default-src \'self\';\n\n\t\timg-src https://*;">';
    output = '<meta http-equiv="content-security-policy" content="default-src \'self\'; img-src https://*;">';
    assert.strictEqual(await minify(input), output);

    input = '<meta http-equiv="content-security-policy" content="default-src \'self\'; img-src https://*;">';
    assert.strictEqual(await minify(input), input);
  });

  test('ReDoS prevention in custom fragments processing', async () => {
    // Test long sequences of whitespace that could trigger ReDoS
    // If ReDoS occurs, the test runner’s timeout will catch it
    const longWhitespace = ' '.repeat(10000);
    const phpFragments = [/<%[\s\S]*?%>/g, /<\?[\s\S]*?\?>/g];

    // Long whitespace before custom fragment
    let result = await minify(`<div>${longWhitespace}<?php echo "test"; ?></div>`, {
      ignoreCustomFragments: phpFragments,
      collapseWhitespace: true
    });
    assert.ok(result.includes('<?php echo "test"; ?>'));

    // Multiple consecutive fragments with long whitespace
    result = await minify(`<div>${longWhitespace}<?php echo "test1"; ?>${longWhitespace}<?php echo "test2"; ?>${longWhitespace}</div>`, {
      ignoreCustomFragments: phpFragments,
      collapseWhitespace: true
    });
    assert.ok(result.includes('<?php echo "test1"; ?>'));
    assert.ok(result.includes('<?php echo "test2"; ?>'));
  });

  test('Inline custom elements', async () => {
    let input, output;

    // Test with `inlineCustomElements` option
    input = '<custom-element>A</custom-element> <custom-element>B</custom-element>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, inlineCustomElements: ['custom-element'] }), input);

    // Test without `inlineCustomElements`—spacing should collapse for custom elements
    output = '<custom-element>A</custom-element><custom-element>B</custom-element>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // Test multiple custom elements
    input = '<tag-a>X</tag-a> <tag-b>Y</tag-b>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, inlineCustomElements: ['tag-a', 'tag-b'] }), input);

    // Test mixed custom and standard inline elements
    input = '<span>Standard</span> <custom-inline>Custom</custom-inline> <em>More</em>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, inlineCustomElements: ['custom-inline'] }), input);

    // Test custom elements not in `inlineCustomElements` still collapse
    input = '<included-tag>A</included-tag> <excluded-tag>B</excluded-tag> <included-tag>C</included-tag>';
    output = '<included-tag>A</included-tag><excluded-tag>B</excluded-tag><included-tag>C</included-tag>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, inlineCustomElements: ['included-tag'] }), output);

    // Test empty `inlineCustomElements` array (default behavior)
    input = '<web-component>A</web-component> <web-component>B</web-component>';
    output = '<web-component>A</web-component><web-component>B</web-component>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, inlineCustomElements: [] }), output);

    // Test with `collapseInlineTagWhitespace` option
    input = '<custom-tag>A</custom-tag> <custom-tag>B</custom-tag>';
    output = '<custom-tag>A</custom-tag><custom-tag>B</custom-tag>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, collapseInlineTagWhitespace: true, inlineCustomElements: ['custom-tag'] }), output);
  });

  test('srcdoc attribute minification', async () => {
    let input, output;

    // Basic `srcdoc` minification, https://github.com/kangax/html-minifier/issues/762
    input = '<iframe srcdoc="<p>hello<!-- comment -->         </p>"></iframe>';
    output = '<iframe srcdoc="<p>hello</p>"></iframe>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), output);

    // Complex HTML document in `srcdoc`
    input = '<iframe srcdoc="<!DOCTYPE html><html><head><style>  body { margin: 0; }  </style></head><body><h1>  Title  </h1><!-- Test comment --><script>  console.log(\'test\');  </script></body></html>"></iframe>';
    output = '<iframe srcdoc=\'<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body><h1>Title</h1><script>console.log("test")</script></body></html>\'></iframe>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true, minifyCSS: true, minifyJS: true }), output);

    // `srcdoc` with nested quotes and escaping
    input = '<iframe srcdoc="<p title=\'quoted text\'>Content<!-- comment --></p>"></iframe>';
    output = '<iframe srcdoc="<p title=\'quoted text\'>Content</p>"></iframe>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), output);

    // `srcdoc` with both `src` and `srcdoc` attributes (`srcdoc` takes precedence)
    input = '<iframe src="page.html" srcdoc="<p>  Content with spaces  <!-- comment --></p>"></iframe>';
    output = '<iframe src="page.html" srcdoc="<p>Content with spaces</p>"></iframe>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), output);

    // Empty `srcdoc` should remain empty
    input = '<iframe srcdoc=""></iframe>';
    output = '<iframe srcdoc=""></iframe>';
    assert.strictEqual(await minify(input), output);

    // `srcdoc` with only whitespace
    input = '<iframe srcdoc="   \n\t   "></iframe>';
    output = '<iframe srcdoc=""></iframe>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // `srcdoc` should not be removed even with `removeEmptyElements`
    input = '<iframe srcdoc="<h1>Foo</h1>"></iframe>';
    assert.strictEqual(await minify(input, { removeEmptyElements: true }), input);

    // Multiple iframes with `srcdoc`
    input = '<iframe srcdoc="<h1>  First  </h1>"></iframe><iframe srcdoc="<h2><!-- comment -->Second</h2>"></iframe>';
    output = '<iframe srcdoc="<h1>First</h1>"></iframe><iframe srcdoc="<h2>Second</h2>"></iframe>';
    assert.strictEqual(await minify(input, { removeComments: true, collapseWhitespace: true }), output);

    // `srcdoc` with inline styles and scripts
    input = '<iframe srcdoc="<div style=\'  color: red;  \' onclick=\'  alert(&quot;Hello&quot;);  \'>Test</div>"></iframe>';
    output = '<iframe srcdoc="<div style=\'color:red\' onclick=\'alert(&quot;Hello&quot;);\'>Test</div>"></iframe>';
    assert.strictEqual(await minify(input, { minifyCSS: true, minifyJS: true, collapseWhitespace: true }), output);
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true, minifyJS: true, collapseWhitespace: true }),
      { message: /Unexpected token/ },
    );

    // Nested iframe `srcdoc` should recurse
    input = '<iframe srcdoc="<iframe srcdoc=\'<p>  Hi  </p>\'></iframe>"></iframe>';
    output = '<iframe srcdoc="<iframe srcdoc=\'<p>Hi</p>\'></iframe>"></iframe>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);

    // `decodeEntities` should decode inner markup
    input = '<iframe srcdoc="&lt;p&gt;a&amp;b&lt;/p&gt;"></iframe>';
    output = '<iframe srcdoc="<p>a&b</p>"></iframe>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, decodeEntities: true }), output);

    // Fast-path: no minification options should leave `srcdoc` unchanged
    input = '<iframe srcdoc="<p>hello<!-- comment -->         </p>"></iframe>';
    output = '<iframe srcdoc="<p>hello<!-- comment -->         </p>"></iframe>';
    assert.strictEqual(await minify(input, {}), output);

    // Quotes around `srcdoc` must be preserved even when allowing quote removal
    input = '<iframe srcdoc="<p>hello world</p>"></iframe>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true }), input);

    // `minifyURLs` should apply inside `srcdoc` content
    input = '<iframe srcdoc="<a href=\'https://example.com/foo\'>x</a>"></iframe>';
    output = '<iframe srcdoc="<a href=\'foo\'>x</a>"></iframe>';
    assert.strictEqual(await minify(input, { minifyURLs: 'https://example.com/' }), output);

    // After collapsing whitespace to empty, iframe with empty `srcdoc` is preserved
    input = '<iframe srcdoc="   \n\t   "></iframe>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, removeEmptyElements: true }), '<iframe srcdoc=""></iframe>');
  });

  test('tfoot element in nested table', async () => {
    // `tfoot` element breaking HTML structure during minification
    const input = '<table><tbody><tr><td><table><caption>Test</caption><tbody><tr><td>Test</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table></td></tr></tbody></table>';

    // The output should preserve the correct table structure with `tfoot` properly nested
    const expected = '<table><tbody><tr><td><table><caption>Test</caption><tbody><tr><td>Test</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table></td></tr></tbody></table>';

    assert.strictEqual(await minify(input), expected);
  });

  test('tbody element in nested table', async () => {
    // `tbody` with `thead` in nested tables
    const input = '<table><thead><tr><th>Outer Header</th></tr></thead><tbody><tr><td><table><thead><tr><th>Inner Header</th></tr></thead><tbody><tr><td>Test</td></tr></tbody></table></td></tr></tbody></table>';

    // The output should preserve the correct table structure with `thead`/`tbody` properly nested
    const expected = '<table><thead><tr><th>Outer Header</th></tr></thead><tbody><tr><td><table><thead><tr><th>Inner Header</th></tr></thead><tbody><tr><td>Test</td></tr></tbody></table></td></tr></tbody></table>';

    assert.strictEqual(await minify(input), expected);
  });

  test('tfoot in nested table with optional tags', async () => {
    const input = '<table><tbody><tr><td><table><caption>Test</caption><tbody><tr><td>Test</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table></td></tr></tbody></table>';
    const expected = '<table><tr><td><table><caption>Test<tr><td>Test<tfoot><tr><td>Footer</table></table>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, collapseWhitespace: true }), expected);
  });

  test('Nested table with complete table structure', async () => {
    const input = '<table><thead><tr><th>Outer</th></tr></thead><tbody><tr><td><table><thead><tr><th>Inner</th></tr></thead><tbody><tr><td>Data</td></tr></tbody><tfoot><tr><td>Total</td></tr></tfoot></table></td></tr></tbody></table>';
    const expected = '<table><thead><tr><th>Outer</th></tr></thead><tbody><tr><td><table><thead><tr><th>Inner</th></tr></thead><tbody><tr><td>Data</td></tr></tbody><tfoot><tr><td>Total</td></tr></tfoot></table></td></tr></tbody></table>';
    assert.strictEqual(await minify(input), expected);
  });

  test('Multiple nested tables with different structures', async () => {
    const input = '<table><tbody><tr><td><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></td><td><table><tbody><tr><td>2</td></tr></tbody><tfoot><tr><td>Sum</td></tr></tfoot></table></td></tr></tbody></table>';
    const expected = '<table><tbody><tr><td><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></td><td><table><tbody><tr><td>2</td></tr></tbody><tfoot><tr><td>Sum</td></tr></tfoot></table></td></tr></tbody></table>';
    assert.strictEqual(await minify(input), expected);
  });

  test('All optional tags', async () => {
    const input = '<!DOCTYPE html>\n' +
      '<html>\n' +
      '\t<head>\n' +
      '\t\t<title>Optional Tags</title>\n' +
      '\t</head>\n' +
      '\t<body>\n' +
      '\t\t<table>\n' +
      '\t\t\t<caption></caption>\n' +
      '\t\t\t<colgroup>\n' +
      '\t\t\t\t<col>\n' +
      '\t\t\t</colgroup>\n' +
      '\t\t\t<thead>\n' +
      '\t\t\t\t<tr>\n' +
      '\t\t\t\t\t<th></th>\n' +
      '\t\t\t\t</tr>\n' +
      '\t\t\t</thead>\n' +
      '\t\t\t<tbody>\n' +
      '\t\t\t\t<tr>\n' +
      '\t\t\t\t\t<td></td>\n' +
      '\t\t\t\t</tr>\n' +
      '\t\t\t</tbody>\n' +
      '\t\t\t<tfoot>\n' +
      '\t\t\t\t<tr>\n' +
      '\t\t\t\t\t<td></td>\n' +
      '\t\t\t\t</tr>\n' +
      '\t\t\t</tfoot>\n' +
      '\t\t</table>\n' +
      '\t\t<table>\n' +
      '\t\t\t<tbody>\n' +
      '\t\t\t\t<tr>\n' +
      '\t\t\t\t\t<td></td>\n' +
      '\t\t\t\t</tr>\n' +
      '\t\t\t</tbody>\n' +
      '\t\t</table>\n' +
      '\t\t<dl>\n' +
      '\t\t\t<dt></dt>\n' +
      '\t\t\t<dd></dd>\n' +
      '\t\t</dl>\n' +
      '\t\t<ul>\n' +
      '\t\t\t<li></li>\n' +
      '\t\t</ul>\n' +
      '\t\t<select>\n' +
      '\t\t\t<optgroup label=Example>\n' +
      '\t\t\t\t<option>Example</option>\n' +
      '\t\t\t</optgroup>\n' +
      '\t\t</select>\n' +
      '\t\t<p></p>\n' +
      '\t\t<ruby>\n' +
      '\t\t\t<rp>(</rp>\n' +
      '\t\t\t<rt></rt>\n' +
      '\t\t\t<rp>)</rp>\n' +
      '\t\t</ruby>\n' +
      '\t\t<p></p>\n' +
      '\t</body>\n' +
      '</html>';
    const expected = '<!DOCTYPE html><title>Optional Tags</title><table><caption><col><thead><tr><th><tbody><tr><td><tfoot><tr><td></table><table><tr><td></table><dl><dt><dd></dl><ul><li></ul><select><optgroup label=Example><option>Example</select><p></p><ruby><rp>(<rt><rp>)</ruby><p>';
    assert.strictEqual(await minify(input, { removeAttributeQuotes: true, removeOptionalTags: true, collapseWhitespace: true }), expected);
  });

  test('Extended ruby markup with optional tags (HTML Ruby Markup Extensions)', async () => {
    let input, output;

    // Simple ruby with `rb` elements
    input = '<ruby><rb>漢</rb><rt>kan</rt></ruby>';
    output = '<ruby><rb>漢<rt>kan</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Ruby with multiple `rb`/`rt` pairs
    input = '<ruby><rb>東</rb><rt>tō</rt><rb>京</rb><rt>kyō</rt></ruby>';
    output = '<ruby><rb>東<rt>tō<rb>京<rt>kyō</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Ruby with `rtc` (ruby text container)
    input = '<ruby><rb>字</rb><rtc><rt>ji</rt></rtc></ruby>';
    output = '<ruby><rb>字<rtc><rt>ji</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Ruby with `rp` fallback and `rb` elements
    input = '<ruby><rb>漢</rb><rp> (</rp><rt>kan</rt><rp>) </rp></ruby>';
    output = '<ruby><rb>漢<rp> (<rt>kan<rp>) </ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Double-sided ruby (`rtc` followed by another `rtc`)
    input = '<ruby><rb>字</rb><rtc><rt>reading1</rt></rtc><rtc><rt>reading2</rt></rtc></ruby>';
    output = '<ruby><rb>字<rtc><rt>reading1<rtc><rt>reading2</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Complex example with whitespace collapsing
    input = '<ruby>\n' +
      '  <rb>東</rb>\n' +
      '  <rt>tō</rt>\n' +
      '  <rb>京</rb>\n' +
      '  <rt>kyō</rt>\n' +
      '</ruby>';
    output = '<ruby><rb>東<rt>tō<rb>京<rt>kyō</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, collapseWhitespace: true }), output);

    // `rtc` end tag omission rules—`rtc` can only be followed by `rb` or `rtc`
    input = '<ruby><rb>a</rb><rtc><rt>x</rt></rtc><rb>b</rb></ruby>';
    output = '<ruby><rb>a<rtc><rt>x<rb>b</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Ensuring `rtc` end tag is not omitted before `rt` (spec says `rtc` can only be followed by `rb` or `rtc`)
    input = '<ruby><rtc><rt>annotation</rt></rtc><rt>more</rt></ruby>';
    output = '<ruby><rtc><rt>annotation</rtc><rt>more</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // `rtc` end tag must be kept before `rp` (can only be omitted before `rb` or `rtc`)
    input = '<ruby><rb>字</rb><rtc><rt>reading</rt></rtc><rp>(</rp><rt>text</rt><rp>)</rp></ruby>';
    output = '<ruby><rb>字<rtc><rt>reading</rtc><rp>(<rt>text<rp>)</ruby>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);
  });

  test('maxInputLength security option', async () => {
    // Test that large inputs are rejected when `maxInputLength` is set
    const largeInput = '<p>' + 'x'.repeat(100000) + '</p>';

    await assert.rejects(
      minify(largeInput, { maxInputLength: 50000 }),
      { message: /Input length .* exceeds maximum allowed length/ }
    );

    // Test that inputs under the limit are processed normally
    const smallInput = '<p>  Normal content  </p>';
    const result = await minify(smallInput, { maxInputLength: 1000, collapseWhitespace: true });
    assert.strictEqual(result, '<p>Normal content</p>');

    // Test exact boundary (at the limit)
    const boundaryInput = '<p>' + 'x'.repeat(93) + '</p>'; // Total 100 chars: 3 + 93 + 4 = 100
    const boundaryResult = await minify(boundaryInput, { maxInputLength: 100 });
    assert.strictEqual(boundaryResult, boundaryInput);

    // Test one over the boundary
    const overBoundaryInput = '<p>' + 'x'.repeat(94) + '</p>'; // Total 101 chars: 3 + 94 + 4 = 101
    await assert.rejects(
      minify(overBoundaryInput, { maxInputLength: 100 }),
      { message: /Input length .* exceeds maximum allowed length/ }
    );

    // Test that without maxInputLength, large inputs are processed
    const result2 = await minify('<p>' + 'x'.repeat(1000) + '</p>', { collapseWhitespace: true });
    assert.ok(result2.length > 0);
    assert.ok(result2.includes('xxx'));
  });

  test('JavaScript minification error handling', async () => {
    // Test invalid JavaScript syntax
    let input = '<script>function foo( { syntax error</script>';
    let result = await minify(input, { minifyJS: true });
    // Should not crash and should contain script element
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    // Invalid JS should be preserved or partially processed
    assert.ok(result.includes('foo'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test completely malformed JavaScript
    input = '<script>{{ this is not valid javascript }} [[</script>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test JS with unclosed brackets
    input = '<script>function test() { console.log("hi");</script>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('script'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test empty `script` element
    input = '<script></script>';
    result = await minify(input, { minifyJS: true, removeEmptyElements: false });
    assert.strictEqual(result, '<script></script>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    // Test event attribute with invalid JS
    input = '<button onclick="function( { syntax">Click</button>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('button'));
    assert.ok(result.includes('Click'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test valid JS still works
    input = '<script>  console.log( "test" );  </script>';
    result = await minify(input, { minifyJS: true });
    assert.strictEqual(result, '<script>console.log("test")</script>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    // Test event attribute with valid JS (quote style may change during minification)
    input = '<button onclick="  alert( \'test\' )  ">Click</button>';
    result = await minify(input, { minifyJS: true });
    // Minifier may normalize quote styles
    assert.ok(result.includes('onclick='));
    assert.ok(result.includes('alert'));
    assert.ok(result.includes('test'));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));
  });

  test('dialog and search elements with optional p tag omission', async () => {
    // Test dialog closes preceding `p` tag
    let input = '<p>Paragraph text<dialog>Modal content</dialog>';
    let output = '<p>Paragraph text<dialog>Modal content</dialog>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Test `search` closes preceding `p` tag
    input = '<p>Paragraph text<search>Search form</search>';
    output = '<p>Paragraph text<search>Search form</search>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Test with whitespace collapsing
    input = '<p>Text  \n  <dialog>  Modal  </dialog>';
    output = '<p>Text<dialog>Modal</dialog>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true, collapseWhitespace: true }), output);

    // Test `search` with `form` content
    input = '<div><p>Before<search><form><input type="search"></form></search><p>After</div>';
    output = '<div><p>Before<search><form><input type="search"></form></search><p>After</div>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Test `dialog` with attributes
    input = '<p>Text<dialog open id="modal">Content</dialog>';
    output = '<p>Text<dialog open id="modal">Content</dialog>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Test `search` with attributes
    input = '<p>Text<search role="search" class="main">Form</search>';
    output = '<p>Text<search role="search" class="main">Form</search>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Test nested structure
    input = '<div><p>Paragraph<dialog><p>Dialog paragraph</p></dialog></div>';
    output = '<div><p>Paragraph<dialog><p>Dialog paragraph</dialog></div>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Test multiple `dialog` elements
    input = '<p>Text1<dialog>Modal1</dialog><p>Text2<dialog>Modal2</dialog>';
    output = '<p>Text1<dialog>Modal1</dialog><p>Text2<dialog>Modal2</dialog>';
    assert.strictEqual(await minify(input, { removeOptionalTags: true }), output);

    // Test `dialog` and `search` without `removeOptionalTags` (should keep closing `p` tags)
    input = '<p>Text</p><dialog>Modal</dialog>';
    assert.strictEqual(await minify(input), input);

    input = '<p>Text</p><search>Form</search>';
    assert.strictEqual(await minify(input), input);
  });

  test('partialMarkup option', async () => {
    let input, output;

    // Test stray end tags are preserved with `partialMarkup`
    input = '</div></div></div><div class="clearfix"></div>';
    assert.strictEqual(await minify(input), '<div class="clearfix"></div>',
      'without partialMarkup, stray end tags should be removed');
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'with partialMarkup, stray end tags should be preserved');

    // Test stray end tags with whitespace collapse
    input = '</div>  </div>  </div>  <div class="clearfix"></div>';
    output = '</div></div></div><div class="clearfix"></div>';
    assert.strictEqual(await minify(input, { partialMarkup: true, collapseWhitespace: true }), output,
      'partialMarkup should work with collapseWhitespace');

    // Test unclosed tags are not auto-closed at end
    input = '<div><p>Hello';
    assert.strictEqual(await minify(input), '<div><p>Hello</p></div>',
      'without partialMarkup, unclosed tags should be auto-closed');
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'with partialMarkup, unclosed tags should not be auto-closed');

    // Test mixed stray end tags and normal content
    input = '</header><main><h1>Title</h1></main>';
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'mixed stray end tags and normal content should be preserved');

    // Test multiple stray end tags of different types
    input = '</div></section></article><footer>Content</footer>';
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'multiple different stray end tags should be preserved');

    // Test stray end tags with attributes (attributes should be preserved in output)
    input = '</div><div id="test">content</div>';
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'stray end tags followed by normal tags should be preserved');

    // Test `partialMarkup` with `removeComments`
    input = '</div><!-- comment --><div>content</div>';
    output = '</div><div>content</div>';
    assert.strictEqual(await minify(input, { partialMarkup: true, removeComments: true }), output,
      'partialMarkup should work with removeComments');

    // Test empty stray end tags
    input = '</div></span></p>';
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'multiple stray end tags should all be preserved');

    // Test SSI include use case (footer fragment)
    input = '</div></div></div><footer class="site-footer"><p>&copy; 2025</p></footer>';
    assert.strictEqual(await minify(input, { partialMarkup: true, collapseWhitespace: true }), input,
      'SSI footer fragment should be preserved');

    // Test template fragment use case (header opening)
    input = '<header><nav><ul>';
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'template fragment with unclosed tags should be preserved');

    // Test `br` and `p` tags (special cases) are preserved in `partialMarkup` mode
    input = '</br></p>';
    assert.strictEqual(await minify(input), '<br><p></p>',
      'without partialMarkup, br and p tags should have special handling');
    assert.strictEqual(await minify(input, { partialMarkup: true }), '</br></p>',
      'with partialMarkup, even br and p tags should be preserved as stray end tags');

    // Test `partialMarkup` doesn’t affect normal complete documents
    input = '<html><body><div>test</div></body></html>';
    assert.strictEqual(await minify(input, { partialMarkup: true }), input,
      'partialMarkup should not affect complete documents');

    // Test that closing a parent tag auto-closes children (even with `partialMarkup`)
    input = '<div><p>Text</div>';
    assert.strictEqual(await minify(input, { partialMarkup: true }), '<div><p>Text</p></div>',
      'closing parent tag auto-closes children, even with partialMarkup');

    // Test `partialMarkup` and `removeOptionalTags` work independently
    assert.strictEqual(await minify(input, { partialMarkup: true, removeOptionalTags: true }), '<div><p>Text</div>',
      'partialMarkup and removeOptionalTags work independently (optional </p> is removed)');
  });

  test('Improved parse error messages', async () => {
    // Test that parse errors include line and column information
    const input = '<div>\n<p>\ninvalid<tag\n</p>\n</div>';

    await assert.rejects(
      async () => { await minify(input, { continueOnParseError: false }); },
      (err) => {
        // Require both positional info and an offending-markup snippet
        return /line\s+\d+.*column\s+\d+/i.test(err.message) && err.message.includes('invalid<tag');
      },
      'Error must include line/column numbers and offending markup'
    );

    // Test that `continueOnParseError` allows processing to continue
    const output = await minify(input, { continueOnParseError: true });
    assert.ok(output, 'Should produce output when continueOnParseError is true');
  });

  test('sortAttributes with processScripts should not corrupt HTML', async () => {
    const input = '<div id="test" class="foo">content</div>';
    const expected = '<div class="foo" id="test">content</div>'; // Attributes sorted, no corruption

    const result = await minify(input, {
      sortAttributes: true,
      processScripts: ['text/html', 'application/ld+json']
    });

    assert.strictEqual(result, expected, 'Should sort attributes without corrupting HTML');
    assert.ok(!result.includes('&lt;'), 'Should not contain HTML entities for angle brackets');
    assert.ok(!result.includes('\\'), 'Should not contain escaped quotes');
  });

  test('sortAttributes with benchmark config should not corrupt HTML', async () => {
    const input = '<div id="test" class="foo">content</div>';

    // Benchmark config that triggers the corruption
    const benchmarkConfig = {
      caseSensitive: false,
      collapseAttributeWhitespace: true,
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: true,
      collapseWhitespace: true,
      conservativeCollapse: false,
      continueOnMinifyError: true,
      continueOnParseError: true,
      decodeEntities: true,
      html5: true,
      ignoreCustomFragments: [
        /<#[\s\S]*?#>/,
        /<%[\s\S]*?%>/,
        /<\?[\s\S]*?\?>/
      ],
      includeAutoGeneratedTags: false,
      keepClosingSlash: false,
      minifyCSS: true,
      minifyJS: true,
      noNewlinesBeforeTagClose: true,
      preventAttributesEscaping: false,
      processConditionalComments: true,
      processScripts: ['text/html', 'application/ld+json'],
      removeAttributeQuotes: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeEmptyElements: false,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      removeTagWhitespace: true,
      sortAttributes: true,
      sortClassName: false,
      trimCustomFragments: true,
      useShortDoctype: true
    };

    const result = await minify(input, benchmarkConfig);

    // Should produce valid HTML, not corrupted output like: `&lt;divid="test"class="foo">content&lt;/div>`
    assert.ok(!result.includes('&lt;'), 'Should not contain HTML entities for angle brackets');
    assert.ok(!result.includes('&gt;'), 'Should not contain HTML entities for angle brackets');
    assert.ok(result.startsWith('<div'), 'Should start with proper opening tag');
    assert.ok(result.includes('id'), 'Should contain id attribute');
    assert.ok(result.includes('class'), 'Should contain class attribute');
  });

  test('sortAttributes with complex attributes should not cause parse errors', async () => {
    // Real-world example from FAZ.html that triggers parse errors
    const input = '<div id="personalisation" data-snacks-3:custom="_plugins [full-bleed], _tracking.inview = null">test</div>';

    const benchmarkConfig = {
      collapseWhitespace: true,
      decodeEntities: true,
      processScripts: ['text/html', 'application/ld+json'],
      removeTagWhitespace: true,
      sortAttributes: true
    };

    const result = await minify(input, benchmarkConfig);

    // Should successfully minify without parse errors showing escaped quotes and double spaces
    // Parse error would look like: <div  id=\"personalisation\"  data-snacks-3:custom=\"…
    assert.ok(!result.includes('\\"'), 'Should not contain escaped quotes');
    assert.ok(!result.includes('  '), 'Should not contain double spaces');
    assert.ok(result.includes('data-snacks-3:custom'), 'Should preserve custom attribute names');
  });

  test('sortAttributes with multiple script tags and different types', async () => {
    // Test with multiple script types including JSON-LD which is in processScripts
    const input = `
      <html>
        <head>
          <script type="application/ld+json">
            {"@context": "https://schema.org", "@type": "WebSite", "name": "Example"}
          </script>
          <script>console.log('test');</script>
        </head>
        <body>
          <div id="main" class="container" data-track="click">
            <h1 class="title heading">Test</h1>
          </div>
        </body>
      </html>
    `;

    const result = await minify(input, {
      sortAttributes: true,
      sortClassName: true,
      processScripts: ['text/html', 'application/ld+json'],
      collapseWhitespace: true,
      minifyJS: true
    });

    // Verify output is valid HTML without corruption
    assert.ok(!result.includes('&lt;'), 'Should not contain HTML entity for <');
    assert.ok(!result.includes('&gt;'), 'Should not contain HTML entity for >');
    assert.ok(!result.includes('\\"'), 'Should not contain escaped quotes');
    assert.ok(result.includes('<script'), 'Should contain script tags');
    assert.ok(result.includes('"@type"'), 'Should preserve JSON-LD content');
    assert.ok(result.includes('data-track'), 'Should preserve custom attributes');
  });

  test('sortAttributes with deeply nested complex structures', async () => {
    // Test with realistic nested HTML structure similar to FAZ
    const input = `
      <section class="content-wrapper">
        <div id="article-123" class="article-container" data-article-id="123" data-category="news">
          <header class="article-header">
            <h1 id="headline" class="headline-text" data-track="impression">Breaking News</h1>
            <div class="metadata" data-published="2025-01-01">
              <span class="author" data-author-id="456">John Doe</span>
            </div>
          </header>
          <div class="article-body" data-snacks:plugin="reader" data-track="scroll">
            <p class="lead-paragraph intro">Content here with <a href="/link" class="link inline" target="_blank">link</a>.</p>
          </div>
        </div>
      </section>
    `;

    const result = await minify(input, {
      sortAttributes: true,
      sortClassName: true,
      collapseWhitespace: true,
      removeTagWhitespace: true,
      removeAttributeQuotes: true,
      processScripts: ['text/html', 'application/ld+json']
    });

    // Verify structure integrity
    assert.ok(!result.includes('&lt;'), 'Should not corrupt angle brackets');
    assert.ok(!result.includes('\\"'), 'Should not escape quotes');
    assert.ok(!result.includes('  '), 'Should not have double spaces');
    assert.ok(result.includes('data-snacks:plugin'), 'Should preserve namespaced attributes');
    assert.ok(result.includes('article-container'), 'Should preserve classes');
    assert.ok(result.includes('data-article-id'), 'Should preserve data attributes');
  });

  test('sortAttributes output can be re-parsed without errors', async () => {
    // Critical test: Ensure output is valid parseable HTML
    const input = '<div id="test" class="foo bar" data-value="[test]">content</div>';

    const benchmarkConfig = {
      sortAttributes: true,
      sortClassName: true,
      collapseWhitespace: true,
      processScripts: ['text/html', 'application/ld+json'],
      removeTagWhitespace: true
    };

    const result = await minify(input, benchmarkConfig);

    // Try to parse the result—should not throw
    await assert.doesNotReject(
      async () => { await minify(result, {}); },
      'Minified output should be parseable HTML'
    );

    // Verify it’s valid HTML structure
    assert.ok(result.match(/<div[^>]*>.*<\/div>/), 'Should have valid div structure');
  });

  test('sortAttributes with preventAttributesEscaping and sortClassName combined', async () => {
    // Test all three sorting/escaping options together
    const input = '<div class="bar foo" id="test" data-value=\'{"key": "value"}\' data-config="[1,2,3]">content</div>';

    const result = await minify(input, {
      sortAttributes: true,
      sortClassName: true,
      preventAttributesEscaping: true,
      processScripts: ['text/html', 'application/ld+json']
    });

    // Verify all features work together
    assert.ok(result.includes('class'), 'Should contain class attribute');
    assert.ok(result.includes('id'), 'Should contain id attribute');
    assert.ok(result.includes('data-value'), 'Should contain data-value attribute');
    assert.ok(result.includes('data-config'), 'Should contain data-config attribute');
    assert.ok(result.includes('{"key": "value"}'), 'Should preserve JSON in attribute');
    assert.ok(result.includes('[1,2,3]'), 'Should preserve arrays in attribute');
    assert.ok(!result.includes('\\"'), 'Should not escape quotes with preventAttributesEscaping');
    assert.ok(!result.includes('&lt;'), 'Should not contain HTML entities');
  });

  // Check if FAZ.html exists and conditionally skip test if not available
  const fazPath = fileURLToPath(new URL('../benchmarks/sources/FAZ.html', import.meta.url));
  const fazExists = fs.existsSync(fazPath);

  (fazExists ? test : test.skip)('sortAttributes with actual FAZ.html content', async () => {
    // Test with real FAZ.html file to ensure it minifies successfully
    // This is the ultimate test—if this passes, FAZ works
    const fsPromises = await import('fs/promises');
    const fazHtml = await fsPromises.readFile(fazPath, 'utf8');

    const benchmarkConfig = {
      caseSensitive: false,
      collapseAttributeWhitespace: true,
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: true,
      collapseWhitespace: true,
      conservativeCollapse: false,
      continueOnMinifyError: true,
      continueOnParseError: false, // Must be false—we want to catch parse errors
      decodeEntities: true,
      html5: true,
      ignoreCustomFragments: [
        /<#[\s\S]*?#>/,
        /<%[\s\S]*?%>/,
        /<\?[\s\S]*?\?>/
      ],
      includeAutoGeneratedTags: false,
      keepClosingSlash: false,
      minifyCSS: true,
      minifyJS: true,
      noNewlinesBeforeTagClose: true,
      preventAttributesEscaping: true,
      processConditionalComments: true,
      processScripts: ['text/html', 'application/ld+json'],
      removeAttributeQuotes: true,
      removeComments: true,
      removeEmptyAttributes: true,
      removeEmptyElements: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      removeTagWhitespace: true,
      sortAttributes: true,
      sortClassName: true,
      trimCustomFragments: true,
      useShortDoctype: true
    };

    // Should minify without throwing parse errors
    const result = await minify(fazHtml, benchmarkConfig);

    // Verify output integrity
    assert.ok(result.length > 0, 'Should produce non-empty output');
    assert.ok(result.length < fazHtml.length, 'Should reduce file size');
    // Some escaped quotes in JS/JSON-LD content are expected (~322 in 1.5 MB is normal)
    const escapedQuoteCount = (result.match(/\\"/g) || []).length;
    assert.ok(escapedQuoteCount < 500, `Should not have excessive escaped quotes (found ${escapedQuoteCount})`);
    assert.ok(!result.includes('&lt;html'), 'Should not encode html start tag as entity');
    assert.ok(!result.includes('&lt;div'), 'Should not encode div tags as entities');
    assert.ok(result.includes('personalisation'), 'Should preserve the problematic personalisation div');
  });

  test('JSON config with string regex patterns', async () => {
    // This test verifies that string regex patterns in JSON configs are properly
    // converted to RegExp objects by the library’s `processOptions()` function.
    // Without this conversion, options like `ignoreCustomFragments` would fail silently.

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>test</body></html>';

    // Simulate loading config from JSON (strings, not RegExp objects)
    const jsonConfig = {
      html5: true,
      includeAutoGeneratedTags: false,
      removeOptionalTags: true,
      useShortDoctype: true,
      keepClosingSlash: false,
      removeAttributeQuotes: true,
      removeComments: true, // Enable comment removal to test ignoreCustomComments
      // These would be strings in JSON, not RegExp objects
      ignoreCustomFragments: [
        '<#[\\s\\S]*?#>',
        '<%[\\s\\S]*?%>',
        '<\\?[\\s\\S]*?\\?>'
      ],
      ignoreCustomComments: [
        '^!',
        '^\\s*#'
      ]
    };

    const result = await minify(html, jsonConfig);

    // Should produce properly minified output
    assert.strictEqual(result, '<!doctype html><meta charset=utf-8>test');

    // Test with custom fragments that should be preserved
    const htmlWithFragments = '<!DOCTYPE html><html><head><?php echo "test"; ?></head><body>content</body></html>';
    const resultWithFragments = await minify(htmlWithFragments, jsonConfig);

    // Should preserve PHP fragment
    assert.ok(resultWithFragments.includes('<?php echo "test"; ?>'));

    // Test with custom comments that should be preserved (matching `ignoreCustomComments` patterns)
    const htmlWithComments = `<!DOCTYPE html><html><head>
      <!--! Important comment -->
      <!-- # Config comment -->
      <!--  # Indented config comment -->
      <!-- Regular comment (should be removed) -->
    </head><body>test</body></html>`;
    const resultWithComments = await minify(htmlWithComments, jsonConfig);

    // Should preserve comments matching `ignoreCustomComments` patterns
    assert.ok(resultWithComments.includes('<!--! Important comment -->'), 'Should preserve comment starting with !');
    assert.ok(resultWithComments.includes('<!-- # Config comment -->'), 'Should preserve comment starting with # (with space)');
    assert.ok(resultWithComments.includes('<!--  # Indented config comment -->'), 'Should preserve comment starting with whitespace + #');
    assert.ok(!resultWithComments.includes('<!-- Regular comment (should be removed) -->'), 'Should remove regular comments');
  });

  test('RegExp option conversion edge cases', async () => {
    // Test that string-based RegExp options produce the same results as RegExp-based options
    // This verifies the string-to-RegExp conversion is working correctly

    const html = '<div ng-click="alert(1 + 2)">test</div>';

    // Baseline: Without `customEventAttributes`, `ng-click` should not be minified
    const baseline = await minify(html, { minifyJS: true });
    assert.strictEqual(baseline, '<div ng-click="alert(1 + 2)">test</div>');

    // With string-based customEventAttributes, ng-click SHOULD be minified
    const configWithStrings = {
      minifyJS: true,
      // String patterns that should be converted to RegExp
      customEventAttributes: ['^ng-', '^data-ng-']
    };

    const resultWithStrings = await minify(html, configWithStrings);
    // Should minify the `ng-click` attribute value (1 + 2 becomes 3)
    assert.strictEqual(resultWithStrings, '<div ng-click="alert(3)">test</div>');

    // Verify parity: RegExp-based config should produce identical output
    const configWithRegExp = {
      minifyJS: true,
      customEventAttributes: [/^ng-/, /^data-ng-/]
    };

    const resultWithRegExp = await minify(html, configWithRegExp);
    assert.strictEqual(resultWithRegExp, resultWithStrings, 'String and RegExp configs should produce identical results');

    // Test the `^data-ng-` pattern variant
    const html2 = '<div data-ng-click="alert(1 + 2)">test</div>';

    const resultWithStrings2 = await minify(html2, configWithStrings);
    // Should minify the `data-ng-click` attribute value (1 + 2 becomes 3)
    assert.strictEqual(resultWithStrings2, '<div data-ng-click="alert(3)">test</div>');

    const resultWithRegExp2 = await minify(html2, configWithRegExp);
    assert.strictEqual(resultWithRegExp2, resultWithStrings2, 'String and RegExp configs should produce identical results for data-ng-click');
  });

  test('customAttrSurround with nested string regex patterns', async () => {
    // Regression test: verify JSON config with string pairs (not RegExp objects)
    // are correctly converted for `customAttrSurround`’s nested array structure
    const html = '<input (data-attr="value")>';

    const jsonConfig = {
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      // String patterns (as from JSON config), not RegExp objects
      customAttrSurround: [
        ['\\(', '\\)'],     // Parentheses wrapper
        ['\\[', '\\]']      // Brackets wrapper
      ]
    };

    const result = await minify(html, jsonConfig);

    // Should successfully parse without throwing
    assert.ok(result);
    // Should preserve the wrapped attribute
    assert.ok(result.includes('('));
    assert.ok(result.includes('data-attr'));
    assert.strictEqual(result, '<input (data-attr=value)>');

    // Test with brackets
    const html2 = '<div [class="test"]>content</div>';
    const result2 = await minify(html2, jsonConfig);
    assert.strictEqual(result2, '<div [class=test]>content</div>');
  });

  test('customAttrSurround with complex template patterns', async () => {
    // Test with real-world Handlebars/template patterns
    const html = '<input {{#if value}}checked="checked"{{/if}}>';

    const jsonConfig = {
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      collapseBooleanAttributes: true,
      customAttrSurround: [
        ['\\{\\{#if\\s+\\w+\\}\\}', '\\{\\{\\/if\\}\\}'],
        ['\\{\\{#unless\\s+\\w+\\}\\}', '\\{\\{\\/unless\\}\\}']
      ]
    };

    const result = await minify(html, jsonConfig);
    assert.strictEqual(result, '<input {{#if value}}checked{{/if}}>');

    // Test with unless
    const html2 = '<div {{#unless hidden}}class="visible"{{/unless}}>content</div>';
    const result2 = await minify(html2, jsonConfig);
    assert.strictEqual(result2, '<div {{#unless hidden}}class=visible{{/unless}}>content</div>');
  });
});