import { describe, test } from 'node:test';
import assert from 'node:assert';
import { LRU, describeQuantifierRisk, embedSource } from '../src/lib/utils.js';

/** @param {string} source */
const hasRiskyQuantifiers = source => describeQuantifierRisk(source) !== null;

describe('Utils', () => {
  describe('LRU', () => {
    test('New cache reports all-zero stats', () => {
      const cache = new LRU(3);
      assert.deepStrictEqual(cache.stats(), { gets: 0, hits: 0, size: 0, limit: 3 });
    });

    test('`get()` on a missing key counts a get but not a hit', () => {
      const cache = new LRU(3);
      assert.strictEqual(cache.get('missing'), undefined);
      assert.deepStrictEqual(cache.stats(), { gets: 1, hits: 0, size: 0, limit: 3 });
    });

    test('`get()` on a present key counts both a get and a hit', () => {
      const cache = new LRU(3);
      cache.set('key', 'value');
      assert.strictEqual(cache.get('key'), 'value');
      assert.deepStrictEqual(cache.stats(), { gets: 1, hits: 1, size: 1, limit: 3 });
    });

    test('Repeated lookups accumulate gets and hits independently', () => {
      const cache = new LRU(3);
      cache.set('a', 1);

      cache.get('a'); // hit
      cache.get('b'); // miss
      cache.get('a'); // hit
      cache.get('c'); // miss

      const stats = cache.stats();
      assert.strictEqual(stats.gets, 4);
      assert.strictEqual(stats.hits, 2);
    });

    test('`set()` does not affect gets/hits counters', () => {
      const cache = new LRU(3);
      cache.set('a', 1);
      cache.set('b', 2);
      assert.deepStrictEqual(cache.stats(), { gets: 0, hits: 0, size: 2, limit: 3 });
    });

    test('`stats()` size reflects eviction once the limit is exceeded', () => {
      const cache = new LRU(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // evicts `a`—limit is 2

      assert.strictEqual(cache.stats().size, 2);
      assert.strictEqual(cache.get('a'), undefined); // miss—evicted
      assert.strictEqual(cache.get('c'), 3); // hit—still present

      const stats = cache.stats();
      assert.strictEqual(stats.gets, 2);
      assert.strictEqual(stats.hits, 1);
    });

    test('`get()` promotes a key, changing which entry is evicted', () => {
      const cache = new LRU(2);
      cache.set('a', 1);
      cache.set('b', 2);

      cache.get('a'); // promotes `a`, leaving `b` least recently used
      cache.set('c', 3); // evicts `b`, not `a`

      assert.strictEqual(cache.get('a'), 1);
      assert.strictEqual(cache.get('b'), undefined);
    });
  });

  describe('`embedSource`', () => {
    test('A pattern without flags is its own source', () => {
      assert.strictEqual(embedSource(/\{\{#if\}\}/), '\\{\\{#if\\}\\}');
      assert.strictEqual(embedSource(/a.c/), 'a.c');
    });

    test('`i` is written into the source, since the merged pattern cannot carry it', () => {
      assert.strictEqual(embedSource(/abc/i), '[aA][bB][cC]');
      assert.strictEqual(embedSource(/[a-z]/i), '[a-zA-Z]');
      assert.strictEqual(embedSource(/[^a-z0-9]/i), '[^a-zA-Z0-9]');
    });

    test('`s` becomes the class it stands for', () => {
      assert.strictEqual(embedSource(/a.c/s), 'a[\\s\\S]c');
      // Only where `.` is the wildcard, not where it is a literal
      assert.strictEqual(embedSource(/a\.[.]c/s), 'a\\.[.]c');
    });

    test('Syntax is left alone, and so is what cannot fold in place', () => {
      // Folding a group or property name would be a syntax error
      assert.strictEqual(embedSource(/(?<name>ab)/i), '(?<name>[aA][bB])');
      assert.strictEqual(embedSource(/\k<n>/i), '\\k<n>');
      // A multi-character escape is read whole, not split into letters
      assert.strictEqual(embedSource(/\x6a/i), '\\x6a');
      // Outside ASCII the two case blocks are not parallel, so the range stands
      assert.strictEqual(embedSource(/[ü-ÿ]/i), '[ü-ÿ]');
    });

    test('What `i` cannot reach is left alone, never widened', () => {
      // Each of these would need the flag itself; the source keeps its own meaning.
      // Built with `RegExp` so they read as the fixtures they are, not as patterns
      // for scanners to flag
      assert.strictEqual(embedSource(new RegExp('(a)\\1', 'i')), '([aA])\\1'); // a backreference compares literally
      assert.strictEqual(embedSource(new RegExp('[ü-ÿ]', 'i')), '[ü-ÿ]'); // `ÿ` uppercases far past the range
      assert.strictEqual(embedSource(new RegExp('[*-[]', 'i')), '[*-[]'); // spans `A`–`Z` without being a letter range
    });

    test('The rewrite never matches more than the pattern would', () => {
      const exact = [/abc/i, /[a-z]+/i, /[^a-z]/i, /a.c/s, /a.c/is, /<%[A-Z]+%>/i, /[a-z\d]/i, /(?:ab)+/i];
      const conservative = [
        new RegExp('(a)\\1', 'i'), new RegExp('[ü-ÿ]', 'i'), new RegExp('[*-[]', 'i'), new RegExp('\\x6a', 'i')
      ];
      const inputs = ['abc', 'ABC', 'aBc', 'a\nc', 'a.c', 'xyz', 'XYZ', '<%AB%>', '<%ab%>', 'ab', 'AB',
        'ABAB', 'abAB', 'aA', '0', 'ü', 'Ü', 'ÿ', 'Ÿ', 'j', 'J'];
      for (const pattern of exact.concat(conservative)) {
        const rewritten = new RegExp('^(?:' + embedSource(pattern) + ')$');
        const original = new RegExp('^(?:' + pattern.source + ')$', pattern.flags);
        for (const input of inputs) {
          const got = rewritten.exec(input);
          const want = original.exec(input);
          // Never wider than the pattern, and exact for everything `i` can reach
          if (got) {
            assert.ok(want, `${pattern} rewritten as ${rewritten} matched ${JSON.stringify(input)}, which it should not`);
            assert.deepStrictEqual([...got], [...want], `${pattern} captured differently on ${JSON.stringify(input)}`);
          } else if (exact.includes(pattern)) {
            assert.strictEqual(want, null, `${pattern} rewritten as ${rewritten} missed ${JSON.stringify(input)}`);
          }
        }
      }
    });
  });

  describe('`describeQuantifierRisk`', () => {
    test('A lazy scan up to a literal terminator is linear', () => {
      // The shipped `ignoreCustomFragments` defaults
      assert.strictEqual(hasRiskyQuantifiers(/<%[\s\S]*?%>/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/<\?[\s\S]*?\?>/.source), false);
    });

    test('Bounded quantifiers pass', () => {
      assert.strictEqual(hasRiskyQuantifiers(/\{\{[\s\S]{0,500}?\}\}/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/<!--[^-]{1,200}-->/.source), false);
    });

    test('Alternation without an unlimited quantifier over it passes', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(?:<%[\s\S]*?%>|<\?[\s\S]*?\?>)/.source), false);
    });

    test('Unlimited quantifiers nested in a group are risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(a+)+/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\{\{([^}]+)+\}\}/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/(?:\s*\w*)*/.source), true);
    });

    test('Unlimited quantifiers over an alternating group are risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(a|b)*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/<%(\s|\S)*?%>/.source), true);
      // The alternation counts however deeply it nests inside the repeated group
      assert.strictEqual(hasRiskyQuantifiers('(?:(?:a|aa))*b'), true);
    });

    test('Variable quantifiers nested in an unbounded group are risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(a?)+/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\{\{(?:[^}]{1,3})+\}\}/.source), true);
    });

    test('An exact count nested in an unbounded group passes', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(?:a{4})+/.source), false);
      // `{n,n}` is the same count, spelled with a range
      assert.strictEqual(hasRiskyQuantifiers(/(?:a{2,2})+/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/(?:a{1,1})+/.source), false);
      // A range that can actually vary still counts
      assert.strictEqual(hasRiskyQuantifiers(/(?:a{2,3})+/.source), true);
    });

    test('The same atom repeated unboundedly twice in a row is risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/.*.*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/<!--[\s\S]*[\s\S]*-->/.source), true);
    });

    test('A group wrapping the atom does not hide the repetition', () => {
      // `^(?:a)*a*$` backtracks quadratically on `aaa…b`, the way `a*a*` does
      assert.strictEqual(hasRiskyQuantifiers(/^(?:a)*a*$/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/(a)*a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/.*(?:.)*/.source), true);
      // A quantifier of exactly one is notation, not a different atom
      assert.strictEqual(hasRiskyQuantifiers(/(?:a{1})*a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/(?:a{1,1})*a*/.source), true);
      // Only matching atoms count, and lookarounds are not wrappers
      assert.strictEqual(hasRiskyQuantifiers(/(?:a)*b*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/(?=a)a*/.source), false);
    });

    test('Analysis stays bounded on pathological patterns', () => {
      // Nesting past the depth limit is judged risky rather than recursed into,
      // while nesting within it is read for what it is
      assert.strictEqual(hasRiskyQuantifiers('('.repeat(60) + 'a' + ')'.repeat(60)), true);
      assert.strictEqual(hasRiskyQuantifiers('('.repeat(40) + 'a' + ')'.repeat(40)), false);

      // A pattern past the length limit is judged risky unread, whatever its shape
      assert.strictEqual(hasRiskyQuantifiers('a'.repeat(10001)), true);
      assert.strictEqual(hasRiskyQuantifiers('a'.repeat(10000)), false);

      // Extreme nesting trips the length limit before the walk ever starts
      const nested = '('.repeat(20000) + 'a' + ')'.repeat(20000);
      const start = Date.now();
      assert.strictEqual(hasRiskyQuantifiers(nested), true);
      assert.ok(Date.now() - start < 1000, 'Expected the analysis to bail out, not to walk every level');
    });

    test('A repeated group repeating only within a bound passes', () => {
      // The shape HMN itself composes from the fragment patterns
      assert.strictEqual(hasRiskyQuantifiers(/(?:<%[\s\S]*?%>|<\?[\s\S]*?\?>){1,200}/.source), false);
    });

    test('The reason names what was found, not a shape nobody read', () => {
      // A pattern refused for its size carries no quantifier to bound
      assert.match(String(describeQuantifierRisk('a'.repeat(10001))), /too long to analyze/);
      assert.match(String(describeQuantifierRisk('('.repeat(60) + 'a' + ')'.repeat(60))), /too deep to analyze/);
      assert.match(String(describeQuantifierRisk(/(a+)+/.source)), /compounds quantifiers or alternation/);
      assert.match(String(describeQuantifierRisk(/.*.*/.source)), /compounds quantifiers or alternation/);
      assert.strictEqual(describeQuantifierRisk(/<%[\s\S]*?%>/.source), null);
    });

    test('Risk nested deeper in a group still surfaces', () => {
      assert.strictEqual(hasRiskyQuantifiers(/<%(?:x(a+)+y)?%>/.source), true);
    });
  });
});
