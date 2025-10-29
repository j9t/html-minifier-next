import {describe, test} from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';

describe('CSS and JS', () => {
  // Tests for minifyCSS configuration options
  test('minifyCSS: basic boolean true', async () => {
    const input = '<style>body { color: red; font-size: 12px; }</style>';
    const output = '<style>body{color:red;font-size:12px}</style>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('minifyCSS: level 2 optimization', async () => {
    const input = '<style>.class1 { color: red; } .class2 { color: red; }</style>';
    const result = await minify(input, {
      minifyCSS: { level: 2 }
    });

    // Level 2 optimizations may merge rules or optimize further
    assert.ok(result.includes('color:red'), 'Should minify CSS');
    assert.ok(result.length < input.length, 'Output should be shorter');
  });

  test('minifyCSS: inline style attribute', async () => {
    const input = '<div style="  color: red;  margin: 10px;  "></div>';
    const output = '<div style="color:red;margin:10px"></div>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('minifyCSS: preserve important comments', async () => {
    const input = '<style>/*! Important license */ body { color: red; }</style>';
    const result = await minify(input, { minifyCSS: true });

    // clean-css preserves /*! comments by default
    assert.ok(result.includes('Important license'), 'Important comment should be preserved');
  });

  test('minifyCSS: combined with collapseWhitespace', async () => {
    const input = `
      <style>
        body {
          color: red;
          font-size: 14px;
        }
      </style>
    `;
    const result = await minify(input, {
      minifyCSS: true,
      collapseWhitespace: true
    });

    assert.ok(result.includes('<style>body{color:red;font-size:14px}</style>'));
    assert.ok(!result.includes('\n'), 'Whitespace should be collapsed');
  });

  test('minifyCSS: media query minification', async () => {
    const input = '<link rel="stylesheet" media="  screen  and  ( min-width: 768px )  " href="style.css">';
    const result = await minify(input, { minifyCSS: true });

    // Media query should be minified
    assert.ok(!result.includes('  screen  '), 'Extra spaces should be removed from media query');
    assert.ok(result.includes('screen'), 'Media type should be preserved');
  });

  // Tests for minifyJS configuration options
  test('minifyJS: basic boolean true', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('minifyJS: mangle disabled (mangle: false)', async () => {
    // Note: Even with mangle:false, Terser still applies compress optimizations by default
    // To truly preserve variable names, need to disable both mangle and compress
    const input = '<script>function myFunction(myParam) { var myVariable = myParam + 1; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    // Function and variable names should not be mangled (shortened)
    assert.ok(result.includes('myFunction'), 'Function name should be preserved');
    assert.ok(result.includes('myParam'), 'Parameter name should be preserved');
    // Note: myVariable may still be optimized away if compress is enabled
  });

  test('minifyJS: toplevel mangling (mangle: { toplevel: true })', async () => {
    const input = '<script>function myFunction() { var myVariable = 123; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: { toplevel: true } } });

    // With toplevel mangling, function name should be mangled (shortened)
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    assert.ok(!result.includes('myFunction'), 'Function name should be mangled');
    assert.ok(result.length < input.length, 'Output should be shorter than input');
  });

  test('minifyJS: reserved names (mangle: { reserved: ["myFunction"] })', async () => {
    const input = '<script>function myFunction() { var myVariable = 123; return myVariable; }</script>';
    const result = await minify(input, {
      minifyJS: {
        mangle: {
          toplevel: true,
          reserved: ['myFunction']
        }
      }
    });

    // Function name should be preserved, but variable should be mangled
    assert.ok(result.includes('myFunction'), 'Reserved function name should be preserved');
    assert.ok(!result.includes('myVariable'), 'Variable name should be mangled');
  });

  test('minifyJS: drop console statements (compress: { drop_console: true })', async () => {
    const input = '<script>console.log("debug"); alert("keep this");</script>';
    const output = '<script>alert("keep this")</script>';

    assert.strictEqual(await minify(input, {
      minifyJS: {
        compress: { drop_console: true }
      }
    }), output);
  });

  test('minifyJS: combined mangle and compress options', async () => {
    const input = '<script>function calculate() { console.log("calculating"); var result = 10 + 20; return result; }</script>';
    const result = await minify(input, {
      minifyJS: {
        mangle: { toplevel: true },
        compress: { drop_console: true }
      }
    });

    // Should remove console.log and mangle names
    assert.ok(!result.includes('console.log'), 'Console statement should be removed');
    assert.ok(!result.includes('calculate'), 'Function name should be mangled');
    assert.ok(result.includes('30'), 'Should optimize 10 + 20 to 30');
  });

  test('minifyJS: event attribute with mangle disabled', async () => {
    const input = '<button onclick="var myVar = 42; alert(myVar);">Click</button>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    assert.ok(result.includes('myVar'), 'Variable names should not be mangled');
    assert.ok(result.includes('alert'), 'Function call should be preserved');
  });

  // Combined tests
  test('minifyJS and minifyCSS together', async () => {
    const input = `
      <style>body { color: red; }</style>
      <script>function test() { console.log("test"); }</script>
    `;
    const result = await minify(input, {
      minifyJS: { compress: { drop_console: true } },
      minifyCSS: true,
      collapseWhitespace: true
    });

    assert.ok(result.includes('body{color:red}'), 'CSS should be minified');
    assert.ok(!result.includes('console.log'), 'Console should be dropped');
    assert.ok(result.includes('function test(){}'), 'Empty function after console removal');
  });
});