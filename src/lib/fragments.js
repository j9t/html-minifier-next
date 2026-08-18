/**
 * Custom fragment matching
 *
 * `ignoreCustomFragments` patterns nearly always describe the same shape: a literal
 * opening delimiter, an any-character body, and a literal closing delimiter, as in
 * `<%[\s\S]*?%>`. Such a fragment can be found with `indexOf` in linear time, where
 * running the pattern as a regex costs O(n²) on input that opens fragments it never
 * closes—and can cost far more than that when the pattern itself backtracks. Patterns
 * of other shapes keep running as regexes, one per pattern, so each keeps its own flags
 */

const RE_WHITESPACE = /\s/;

// Any-character bodies; `.` counts only under the `s` flag, which decides whether it
// matches line terminators
const RE_DELIMITED = /^(.*?)(?:\[\\s\\S\]|\[\\S\\s\]|\[\^\]|(\.))(?:([*+])|\{(\d+)(?:,(\d*))?\})\?(.*)$/;

// Flags that leave literal matching alone, so a pattern carrying them can still be
// scanned for; `i` in particular cannot, since case folding moves character indexes
const FLAGS_LITERAL = /^[gds]*$/;

/**
 * @typedef {{open: string, close: string, min: number, max: number}} DelimitedFragment
 *  Literal delimiters around an any-character body, found by scanning
 * @typedef {{search: RegExp, anchored: RegExp}} PatternFragment
 *  Everything else, found by running the pattern itself
 */

/**
 * Read a regex source as a literal string, so it can be matched with `indexOf`
 * @param {string} source
 * @returns {string | null} Null when the source is more than literal characters
 */
function toLiteral(source) {
  let literal = '';

  for (let i = 0; i < source.length; i++) {
    const char = source[i] ?? '';
    if (char === '\\') {
      const escaped = source[++i] ?? '';
      // `\n` and friends are literal characters, `\s` and `\1` are not
      if (escaped === 'n') literal += '\n';
      else if (escaped === 't') literal += '\t';
      else if (escaped === 'r') literal += '\r';
      else if (escaped === 'f') literal += '\f';
      else if (escaped === 'v') literal += '\v';
      else if (/[A-Za-z0-9]/.test(escaped)) return null;
      else literal += escaped;
    } else if ('.*+?()[]{}|^$'.includes(char)) {
      return null;
    } else {
      literal += char;
    }
  }

  return literal;
}

/**
 * Describe a fragment pattern as literal delimiters around an any-character body
 * @param {RegExp} pattern
 * @returns {DelimitedFragment | null} Null when the pattern has another shape, which
 *  the caller answers by running it as a regex
 */
function toDelimitedFragment(pattern) {
  if (!FLAGS_LITERAL.test(pattern.flags)) return null;

  const match = RE_DELIMITED.exec(pattern.source);
  if (!match) return null;
  // A `.` body only spans every character under the `s` flag
  if (match[2] && !pattern.flags.includes('s')) return null;

  const open = toLiteral(match[1] ?? '');
  const close = toLiteral(match[6] ?? '');
  // Both delimiters have to be there: without them a match has no boundary to scan to
  if (!open || !close) return null;

  const [, , , simple, exact, upper] = match;
  const min = simple ? (simple === '+' ? 1 : 0) : Number(exact);
  const max = simple || upper === '' ? Infinity : Number(upper ?? exact);

  return { open, close, min, max };
}

/**
 * Prepare a fragment pattern for matching, by scanning where the shape allows it
 * @param {RegExp} pattern
 * @returns {DelimitedFragment | PatternFragment}
 */
function toFragment(pattern) {
  const delimited = toDelimitedFragment(pattern);
  if (delimited) return delimited;

  // `g` and `y` are ours to set, the rest belong to the pattern
  const flags = pattern.flags.replace(/[gy]/g, '');
  return { search: new RegExp(pattern.source, flags + 'g'), anchored: new RegExp(pattern.source, flags + 'y') };
}

/**
 * Replace runs of custom fragments, and the whitespace padding them
 * @param {string} value - Document to scan
 * @param {(DelimitedFragment | PatternFragment)[]} fragments - In the order the patterns
 *  were given, since the earliest match wins and ties go to the pattern listed first
 * @param {(match: string) => string} replacer - Called with each match, as `replace` would
 * @returns {string}
 */
function replaceCustomFragments(value, fragments, replacer) {
  // Where each fragment's next match may start, and its next closing delimiter may be
  // found; both only ever move forward, which is what keeps the whole scan linear
  const found = fragments.map(() => /** @type {{start: number, end: number} | null} */ (null));
  const closesAt = fragments.map(() => -1);
  const exhausted = fragments.map(() => false);

  /**
   * Earliest match of one delimited fragment at or after `from`
   * @param {DelimitedFragment} fragment
   * @param {number} index - Which fragment, for the forward-only bookkeeping
   * @param {number} from
   * @param {boolean} anchored - Whether the match has to start exactly at `from`
   * @returns {{start: number, end: number} | null}
   */
  const scan = (fragment, index, from, anchored) => {
    let openFrom = from;

    for (;;) {
      const open = anchored
        ? (value.startsWith(fragment.open, from) ? from : -1)
        : value.indexOf(fragment.open, openFrom);
      if (open === -1) {
        if (!anchored) exhausted[index] = true;
        return null;
      }

      const bodyStart = open + fragment.open.length;
      if (/** @type {number} */ (closesAt[index]) < bodyStart + fragment.min) {
        closesAt[index] = value.indexOf(fragment.close, bodyStart + fragment.min);
      }
      const close = /** @type {number} */ (closesAt[index]);
      if (close === -1) {
        exhausted[index] = true;
        return null;
      }

      if (close - bodyStart <= fragment.max) {
        return { start: open, end: close + fragment.close.length };
      }
      // The body is longer than the pattern allows, so the match has to start later
      if (anchored) return null;
      openFrom = open + 1;
    }
  };

  /**
   * Earliest match of one regex fragment at or after `from`
   * @param {PatternFragment} fragment
   * @param {number} from
   * @param {boolean} anchored
   * @returns {{start: number, end: number} | null}
   */
  const run = (fragment, from, anchored) => {
    const pattern = anchored ? fragment.anchored : fragment.search;
    pattern.lastIndex = from;

    for (;;) {
      const match = pattern.exec(value);
      if (!match) return null;
      // A pattern that matches nothing would leave the run in place forever
      if (match[0].length > 0) return { start: match.index, end: match.index + match[0].length };
      if (anchored) return null;
      pattern.lastIndex = match.index + 1;
    }
  };

  /**
   * @param {number} from
   * @param {boolean} anchored
   * @returns {{start: number, end: number} | null}
   */
  const find = (from, anchored) => {
    /** @type {{start: number, end: number} | null} */
    let earliest = null;

    for (let i = 0; i < fragments.length; i++) {
      if (exhausted[i]) continue;
      const fragment = /** @type {DelimitedFragment | PatternFragment} */ (fragments[i]);

      /** @type {{start: number, end: number} | null} */
      let match;
      if (anchored) {
        match = 'open' in fragment ? scan(fragment, i, from, true) : run(fragment, from, true);
      } else {
        // Matches only ever move forward, so the last one found still stands
        const previous = found[i];
        match = previous && previous.start >= from
          ? previous
          : ('open' in fragment ? scan(fragment, i, from, false) : run(fragment, from, false));
        found[i] = match;
        // Nothing ahead now means nothing ahead later either
        if (!match) exhausted[i] = true;
      }

      // Ties go to the fragment listed first, the way alternation would resolve them
      if (match && (!earliest || match.start < earliest.start)) earliest = match;
    }

    return earliest;
  };

  let out = '';
  let copied = 0;
  let search = 0;

  while (search <= value.length) {
    const first = find(search, false);
    if (!first) break;

    // Fragments running straight into each other are one match
    let end = first.end;
    for (;;) {
      const next = find(end, true);
      if (!next) break;
      end = next.end;
    }

    // …as is the whitespace on either side, back to where the last match left off
    let start = first.start;
    while (start > copied && RE_WHITESPACE.test(value[start - 1] ?? '')) start--;
    while (end < value.length && RE_WHITESPACE.test(value[end] ?? '')) end++;

    out += value.slice(copied, start) + replacer(value.slice(start, end));
    copied = end;
    search = end;
  }

  return copied === 0 ? value : out + value.slice(copied);
}

// Exports

export {
  toDelimitedFragment,
  toFragment,
  replaceCustomFragments
};