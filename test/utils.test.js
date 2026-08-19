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
      assert.strictEqual(embedSource(/[\q{ab|cd}]/vi), '[\\q{ab|cd}]'); // `\q` holds strings, which fold as strings or not at all
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

    test('Two unbounded repeats that can consume the same character are risky', () => {
      // Spelled differently, but `[a]` and `a` split a run of `a`s the same way
      assert.strictEqual(hasRiskyQuantifiers(/[a]*a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\w*\d*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/[a-z]*[a-c]*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/[^a]*b*/.source), true);
      // A multi-character escape counts as the one character it stands for
      assert.strictEqual(hasRiskyQuantifiers(/\u0041*\u0041*/.source), true);
      // Repeats that share nothing leave nothing ambiguous to split
      assert.strictEqual(hasRiskyQuantifiers(/x*y*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/\s*\S*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/\d*[a-z]*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/[^a]*a*/.source), false);
      // Without the `s` flag a source cannot carry, `.` stops at a line break
      assert.strictEqual(hasRiskyQuantifiers(/.*\n*/.source), false);
    });

    test('An escape is read as what it stands for where it stands', () => {
      // `\b` is a backspace inside a class, where outside one it is a boundary
      assert.strictEqual(hasRiskyQuantifiers('[\\b]*\\x08*'), true);
      // And a backspace is not the letter the escape is spelled with
      assert.strictEqual(hasRiskyQuantifiers('[\\b]*b*'), false);
    });

    test('A pattern is judged the way its own flags make it match', () => {
      // `s` and `S` fit into a source, and are written in before it is read
      assert.strictEqual(describeQuantifierRisk(/.*\n*/s) !== null, true);
      assert.strictEqual(describeQuantifierRisk(/.*\n*/) !== null, false);
      assert.strictEqual(describeQuantifierRisk(/[a]*A*/i) !== null, true);
      assert.strictEqual(describeQuantifierRisk(/[a]*A*/) !== null, false);
      // Folding case inflates a source; its own length is what the bound counts
      assert.strictEqual(describeQuantifierRisk(new RegExp('ab'.repeat(4000), 'i')), null);
      // The defaults keep passing whatever flags they carry
      assert.strictEqual(describeQuantifierRisk(/<%[\s\S]*?%>/i), null);
      assert.strictEqual(describeQuantifierRisk(/(?:a{4})+/i), null);
    });

    test('A `v` class is read past the `]` that only closes a nested one', () => {
      // Under `v` a class nests, so `[[a][b]]` is one atom holding `a` and `b`
      assert.strictEqual(describeQuantifierRisk(/[[a][b]]*b*/v) !== null, true);
      assert.strictEqual(describeQuantifierRisk(/[[a][b]]*c*/v) !== null, false);
      assert.strictEqual(describeQuantifierRisk(/[^[a][b]]*c*/v) !== null, true);
      assert.strictEqual(describeQuantifierRisk(/[^[a][b]]*a*/v) !== null, false);
      // Subtraction, intersection, and string literals are not unions to read
      assert.strictEqual(describeQuantifierRisk(/[[a]--[b]]*b*/v) !== null, false);
      assert.strictEqual(describeQuantifierRisk(/[[ab]&&[bc]]*b*/v) !== null, false);
      assert.strictEqual(describeQuantifierRisk(/[\q{ab}]*a*/v) !== null, false);
      // Without `v` a `[` inside a class is a member, and the first `]` closes it
      assert.strictEqual(hasRiskyQuantifiers('[[a]*a*'), true);
      // Nesting past the bound is declined rather than recursed into
      const deep = new RegExp('['.repeat(3000) + 'a' + ']'.repeat(3000) + '*a*', 'v');
      assert.strictEqual(describeQuantifierRisk(deep), null);
    });

    test('Repeats reach each other across atoms that can match empty', () => {
      // `b*` can match nothing, which leaves the two `a*` splitting the same run
      assert.strictEqual(hasRiskyQuantifiers(/a*b*a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\s*\w*\s*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*b?a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*b{0,3}a*/.source), true);
      // A lookaround consumes nothing, either
      assert.strictEqual(hasRiskyQuantifiers(/a*(?=x)a*/.source), true);
      // An atom that has to consume something separates them again
      assert.strictEqual(hasRiskyQuantifiers(/a*b+a*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/a*ba*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/a*b{1,3}a*/.source), false);
      // Repeats that never overlap stay linear however they are separated
      assert.strictEqual(hasRiskyQuantifiers(/a*b*c*/.source), false);
    });

    test('A group whose body can match empty does not separate repeats', () => {
      // A quantifier inside the group, where the group itself carries none
      assert.strictEqual(hasRiskyQuantifiers(/a*(b*)a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\s*(\w*)\s*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*(b?)a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/<%[\s\S]*?(\s*)[\s\S]*?%>/.source), true);
      // Nesting does not change what the body can match
      assert.strictEqual(hasRiskyQuantifiers(/a*(?:(b*))a*/.source), true);
      // One branch matching empty is enough for the alternation to
      assert.strictEqual(hasRiskyQuantifiers(/a*(b*|c)a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*(|c)a*/.source), true);
      // A body that has to consume something separates the repeats again
      assert.strictEqual(hasRiskyQuantifiers(/a*(b+)a*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/a*(b*c)a*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/a*(b|c)a*/.source), false);
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

    test('Repeats reach each other across a group boundary', () => {
      // A group is no wall: the repeat inside it and the one outside split the
      // same run, wherever the boundary falls between them
      assert.strictEqual(hasRiskyQuantifiers(/(a*)a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*(a*)/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/(a*)(a*)/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\{\{(\s*)[\s\S]*?\}\}/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*(b*a*)/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/(a*b*)a*/.source), true);
      // What the group has to consume separates only what stands before it
      assert.strictEqual(hasRiskyQuantifiers(/(b+a*)a*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*(b+a*)/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/(?:a*b)b*/.source), false);
      // A branch reaches out of the group on its own
      assert.strictEqual(hasRiskyQuantifiers(/a*(?:x|a*)/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/a*(?:x|b*)/.source), false);
      // Repeats that share nothing stay linear across the boundary, too
      assert.strictEqual(hasRiskyQuantifiers(/(a*)b*/.source), false);
      // A lookaround is atomic, so what it holds reaches nothing outside it
      assert.strictEqual(hasRiskyQuantifiers(/(?=a*)a*/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/a*(?!a*)/.source), false);
      // The patterns people write for real keep passing
      assert.strictEqual(hasRiskyQuantifiers(/<(WC@[\s\S]*?)>(.*?)<\/\1>/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/(\{\{)([\s\S]*?)(\}\})/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/<%[-=]?([\s\S]*?)%>/.source), false);
    });

    test('Analysis stays bounded on pathological patterns', () => {
      // Nesting past the depth limit is judged risky rather than recursed into,
      // while nesting within it is read for what it is
      assert.strictEqual(hasRiskyQuantifiers('('.repeat(60) + 'a' + ')'.repeat(60)), true);
      assert.strictEqual(hasRiskyQuantifiers('('.repeat(40) + 'a' + ')'.repeat(40)), false);

      // A pattern past the length limit is judged risky unread, whatever its shape
      assert.strictEqual(hasRiskyQuantifiers('a'.repeat(10001)), true);
      assert.strictEqual(hasRiskyQuantifiers('a'.repeat(10000)), false);

      // A pattern that is nothing but repeats compares against a bounded number
      // of them, rather than against every one that came before
      const repeats = 'a*b*'.repeat(2500);
      const started = Date.now();
      assert.strictEqual(hasRiskyQuantifiers(repeats), true);
      assert.ok(Date.now() - started < 1000, 'Expected the reach to stay bounded');

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
