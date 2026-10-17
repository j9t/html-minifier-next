/**
 * Options processing and per-document minification state
 */

import { createUrlMinifier } from './urls.js';
import { LRU, MAX_CACHE_ENTRY_SIZE, stableStringify, hashContent, identity, isThenable, lowercase, paramCase, replaceAsync, parseRegExp, describeQuantifierRisk, lostFlag, findTagEnd } from './utils.js';
import { RE_TRAILING_SEMICOLON, MISSING_DEPENDENCY, svgoPluginsInline, namespaceSVG, namespaceMathML, namespaceXLink } from './constants.js';
import { canCollapseWhitespace, canTrimWhitespace } from './whitespace.js';
import { wrapCSS, unwrapCSS } from './content.js';
import { createSelectorPruner, findUnusedSymbols, normalizeUnusedCSSOptions } from './unused-css.js';
import { getPreset, getPresetNames } from '../presets.js';
import { optionDefinitions, optionDefaults } from './option-definitions.js';

/** @import { MinifierOptions, HTMLAttribute } from '../htmlminifier.js' */

/**
 * Per-document state handed to `minifyCSS`. Its closure hangs off the memoized
 * options object that every `minify()` call with those options shares, so state
 * belonging to one document has to be passed in rather than captured.
 *
 * @typedef {{usedSymbols?: Set<string>, usedElements?: Set<string>, usedElementsKey?: string, warned: Set<string>}} CSSContext
 */

/**
 * Minified style sheet plus the warnings its transform produced, cached together
 * so that a cache hit can report what the transform reported
 *
 * @typedef {{css: string, warnings: string[]}} CSSResult
 */

/**
 * Options object produced by `processOptions` and consumed by `minifyHTML` and
 * the lib/ helpers; normalization guarantees that the function-valued options
 * below are always present (defaulting to identity/built-in functions), and
 * minification adds writable internal state on top of the public options
 * (set on prototype-chain forks during SVG/MathML namespace transitions)
 *
 * @typedef {Omit<MinifierOptions, 'preset' | 'canCollapseWhitespace' | 'canTrimWhitespace' | 'ignoreCustomComments' | 'log' | 'minifyCSS' | 'minifyJS' | 'minifyURLs' | 'minifySVG' | 'removeUnusedCSS'> & {
 *   name: (name: string) => string,
 *   log: (message: any) => unknown,
 *   ignoreCustomComments: RegExp[],
 *   canCollapseWhitespace: (tag: string, attrs: HTMLAttribute[], defaultFn: (tag: string) => boolean) => boolean,
 *   canTrimWhitespace: (tag: string, attrs: HTMLAttribute[], defaultFn: (tag: string) => boolean) => boolean,
 *   minifyCSS: (text: string, type?: string, context?: CSSContext) => string | Promise<string>,
 *   minifyJS: (text: string, inline?: boolean, isModule?: boolean) => string | Promise<string>,
 *   minifyURLs: (text: string) => string | Promise<string>,
 *   minifySVG: ((svgContent: string) => string | Promise<string>) | null,
 *   canMinifyCSS: ((text: string, type?: 'inline' | 'media') => boolean) | null,
 *   canMinifyJS: ((text: string, inline?: boolean) => boolean) | null,
 *   canMinifySVG: ((text: string) => boolean) | null,
 *   removeUnusedCSS: {safelist: Array<string | RegExp>, scripts: boolean} | null,
 *   cssContext?: CSSContext,
 *   documentState?: {hasMathML: boolean},
 *   baseState?: {hasBase: boolean | undefined, source: string},
 *   parallelJS?: boolean,
 *   nameParent?: (name: string) => string,
 *   namesAsWritten?: boolean,
 *   keepClosingSlashHTML?: boolean,
 *   insideSVG?: boolean,
 *   insideForeignContent?: boolean,
 *   namespaceForeign?: 'svg' | 'math'
 * }} ProcessedOptions
 */

const RE_SCOPE_AT_RULE = /@scope\b/i;
const RE_SVGO_EMPTY_ATTRIBUTE = / ([^\s"'<>/=]+)=""/g;
const RE_SVG_START = /^<svg(?=[\s/>])/;
const RE_QUOTED_VALUE = /"[^"]*"|'[^']*'/g;
const RE_XLINK_DECLARATION = /\sxmlns:xlink(?=[\s=/>]|$)/;
// The declaration as SVGO writes it, and where it may be, outside comments and
// CDATA sections, which SVGO writes as is (values and text escape `"`)
const XLINK_DECLARATION_SVGO = ' xmlns:xlink="' + namespaceXLink + '"';
const RE_XLINK_DECLARATION_SVGO = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>| xmlns:xlink="[^"]*"/g;

/**
 * SVGO plugin dropping the `xmlns` declarations HTML reads anyway on `svg` and `math` elements
 * (`xmlns:xlink` goes after SVGO, as each pass of `multipass` reads XML again, which needs it)
 */
const pluginNamespacesHTML = {
  name: 'removeNamespacesHTML',
  fn: () => ({
    element: {
      enter: (/** @type {{name: string, attributes: Record<string, string>}} */ node) => {
        const attrs = node.attributes;
        if (attrs.xmlns === (node.name === 'math' ? namespaceMathML : node.name === 'svg' ? namespaceSVG : undefined)) {
          delete attrs.xmlns;
        }
      }
    }
  })
};

/** @param {ProcessedOptions} options */
function shouldMinifyInnerHTML(options) {
  return Boolean(
    options.collapseWhitespace ||
    options.removeComments ||
    options.removeOptionalTags ||
    options.minifyJS !== identity ||
    options.minifyCSS !== identity ||
    options.minifyURLs !== identity ||
    options.minifySVG
  );
}

// Persistent per-site URL minification caches—results depend only on the `site`
// configuration, so entries can be shared across `minify()` calls; bounded so
// batch runs with many distinct sites can’t grow memory without limit
const MAX_URL_CACHE_SITES = 20;
/** @type {Map<string, LRU>} */
const urlMinifyCaches = new Map();

/** @param {string} site */
function getUrlMinifyCache(site) {
  let cache = urlMinifyCaches.get(site);
  if (!cache) {
    if (urlMinifyCaches.size >= MAX_URL_CACHE_SITES) {
      const oldestSite = urlMinifyCaches.keys().next().value;
      if (oldestSite !== undefined) {
        urlMinifyCaches.delete(oldestSite);
      }
    }
    cache = new LRU(500);
    urlMinifyCaches.set(site, cache);
  }
  return cache;
}

// User-facing option keys that are valid but not listed in `optionDefinitions`
const optionKeysExtra = new Set(['preset', 'log', 'canCollapseWhitespace', 'canTrimWhitespace', 'canMinifyCSS', 'canMinifyJS', 'canMinifySVG']);

// Unknown option keys and preset names already warned about—warn once per
// key per process, so repeated `minify` calls (e.g., batch runs) don’t flood STDERR
const optionKeysWarned = new Set();
const presetNamesWarned = new Set();
// Custom fragments whose shape risks ReDoS, warned about once per pattern per process
const customFragmentsWarned = new Set();
// Options set without the option they need, warned about once per message per process
const dependenciesWarned = new Set();
// Unused-CSS configuration that does not hold up, warned about once per message per process
const unusedCSSWarned = new Set();
// Object-valued options handed a string, warned about once per distinct value
const stringValuesWarned = new Set();

// Clause for options that only the built-in minifier behind `key` reads
const replacedByOwnFunction = (/** @type {string} */ key) =>
  (/** @type {Record<string, any>} */ input) => typeof input[key] === 'function' && 'which a function of your own replaces';

/**
 * Options that do nothing on their own, and the option each one needs to take effect
 *
 * Cache sizes are deliberately absent: They never change output, so they are
 * configuration for a subsystem rather than a transform that silently fails.
 *
 * @typedef {object} OptionDependency
 * @property {string} option
 * @property {string} requires
 * @property {(input: Record<string, any>) => string | false} [unusable] Clause saying why the prerequisite does not count even though it is set
 * @property {boolean} [clear] Whether to null the option out, where leaving it set would cost work downstream
 *
 * @type {OptionDependency[]}
 */
const optionDependencies = [
  { option: 'canMinifyCSS', requires: 'minifyCSS', unusable: replacedByOwnFunction('minifyCSS'), clear: true },
  { option: 'canMinifyJS', requires: 'minifyJS', unusable: replacedByOwnFunction('minifyJS'), clear: true },
  { option: 'canMinifySVG', requires: 'minifySVG', unusable: replacedByOwnFunction('minifySVG'), clear: true },
  { option: 'collapseInlineTagWhitespace', requires: 'collapseWhitespace' },
  { option: 'collapseNoBreakSpaces', requires: 'collapseWhitespace' },
  { option: 'conservativeCollapse', requires: 'collapseWhitespace' },
  { option: 'customEventAttributes', requires: 'minifyJS' },
  { option: 'inlineCustomElements', requires: 'collapseWhitespace' },
  { option: 'noNewlinesBeforeTagClose', requires: 'maxLineLength' },
  { option: 'preserveLineBreaks', requires: 'collapseWhitespace' },
  { option: 'removeEmptyElementsExcept', requires: 'removeEmptyElements' },
  {
    option: 'removeUnusedCSS',
    requires: 'minifyCSS',
    // Removal rides along with Lightning CSS, which a function of one’s own replaces
    unusable: replacedByOwnFunction('minifyCSS'),
    clear: true
  },
  { option: 'trimCustomFragments', requires: 'collapseWhitespace' }
];

// An empty array is a value the user supplied but did not populate, and so asks for
// nothing; `identity` is what a minifier that could not be loaded resolves to
/** @param {unknown} value */
function isRequested(value) {
  if (value === identity) return false;
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

// A `canMinify…` hook that returns false leaves the content as is, as does one that
// throws under `continueOnMinifyError`; hooks are synchronous, so a promise counts as an error
/**
 * @param {ProcessedOptions} options - Processed options
 * @param {'canMinifyCSS' | 'canMinifyJS' | 'canMinifySVG'} name - Hook to consult
 * @param {...any} args - Arguments for the hook
 * @returns {boolean}
 */
function declinesMinify(options, name, ...args) {
  const hook = /** @type {((...args: any[]) => unknown) | null} */ (options[name]);
  if (!hook) return false;
  try {
    const result = hook(...args);
    if (isThenable(result)) {
      // Keep a later rejection from surfacing as unhandled
      /** @type {Promise<unknown>} */ (result).catch(() => {});
      throw new TypeError(`\`${name}\` must return a boolean, not a promise`);
    }
    return !result;
  } catch (err) {
    if (!options.continueOnMinifyError) {
      throw err;
    }
    options.log && options.log(err);
    return true;
  }
}

/** @param {unknown} err - Error raised while minifying */
function isMissingDependency(err) {
  return Boolean(err) && /** @type {any} */ (err).code === MISSING_DEPENDENCY;
}

// An unset (falsy) engine takes the fallback and names match lowercase; anything else
// passes through untouched so that validation reports it instead of a type error
/**
 * @param {unknown} engine - Configured engine name
 * @param {string} fallback - Engine to use when none is configured
 */
function normalizeEngine(engine, fallback) {
  if (!engine) return fallback;
  return typeof engine === 'string' ? engine.toLowerCase() : engine;
}

/** @param {unknown} engine - Engine name as it should read in an error message */
function describeEngine(engine) {
  if (typeof engine === 'string') return engine;
  try {
    return JSON.stringify(engine) ?? String(engine);
  } catch {
    // BigInt and cyclic values do not serialize
    return String(engine);
  }
}

/**
 * @param {MinifierOptions} inputOptions - User-provided options
 * @param {{getLightningCSS?: Function | undefined, getTerser?: Function | undefined, getSwc?: Function | undefined, getSvgo?: Function | undefined, cssMinifyCache?: LRU | undefined, jsMinifyCache?: LRU | undefined, svgMinifyCache?: LRU | undefined}} [deps] - Dependencies from htmlminifier.js
 * @returns {ProcessedOptions} Normalized options with defaults applied
 */
const processOptions = (inputOptions, { getLightningCSS, getTerser, getSwc, getSvgo, cssMinifyCache, jsMinifyCache, svgMinifyCache } = {}) => {
  /** @type {ProcessedOptions} */
  const options = {
    name: lowercase,
    namesAsWritten: false,
    canCollapseWhitespace,
    canTrimWhitespace,
    ...optionDefaults,
    log: identity,
    minifyCSS: identity,
    minifyJS: identity,
    minifyURLs: identity,
    minifySVG: null,
    canMinifyCSS: null,
    canMinifyJS: null,
    canMinifySVG: null,
    removeUnusedCSS: null
  };

  const parseRegExpArray = (/** @type {unknown} */ arr) => {
    return Array.isArray(arr) ? arr.map(parseRegExp) : [];
  };

  // Helper for nested arrays (e.g., `customAttrSurround: [[start, end], …]`)
  const parseNestedRegExpArray = (/** @type {unknown} */ arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
      if (Array.isArray(item)) {
        return item.map(parseRegExp);
      }
      return parseRegExp(item);
    });
  };

  // Route warnings through the user-provided `log` hook so API consumers can
  // capture or suppress them consistently; fall back to `console.warn`.
  //
  // Message convention: Strings that may reach the console unsolicited (via
  // this fallback) carry the “HTML Minifier Next: ” prefix for attribution and
  // no “Warning:” label—the channel already conveys severity. Strings sent
  // only to an explicitly provided `log` hook carry “Warning: ” instead, since
  // the hook mixes severities (info strings, warnings, `Error` objects) and
  // its consumer already knows the source.
  const warn = typeof inputOptions.log === 'function' ? inputOptions.log : console.warn;

  // Warn about unrecognized options—catches typos and options removed in earlier versions
  Object.keys(inputOptions).forEach(function (key) {
    if (!Object.hasOwn(optionDefinitions, key) && !optionKeysExtra.has(key) && !optionKeysWarned.has(key)) {
      optionKeysWarned.add(key);
      warn(`HTML Minifier Next: Ignoring unknown or deprecated option \`${key}\` (see README for available options)`);
    }
  });

  // Merge preset with user options (which take precedence), so all values go through normalization
  let effectiveInput = inputOptions;
  if (inputOptions.preset) {
    const preset = getPreset(inputOptions.preset);
    if (preset) {
      effectiveInput = { ...preset, ...inputOptions };
    } else if (!presetNamesWarned.has(inputOptions.preset)) {
      presetNamesWarned.add(inputOptions.preset);
      const available = getPresetNames().join(', ');
      warn(`HTML Minifier Next: Unknown preset “${inputOptions.preset}”; available presets: ${available}`);
    }
  }

  // Escape hatch for the loop below, which reads and assigns user-provided values by dynamic key
  const optionsDynamic = /** @type {Record<string, any>} */ (options);

  Object.keys(effectiveInput).forEach(function (key) {
    const option = /** @type {Record<string, any>} */ (effectiveInput)[key];

    // Skip `preset` (already processed) and unrecognized keys (warned about above)—
    // the latter also keeps internal keys from being overridden
    if (key === 'preset' || (!Object.hasOwn(optionDefinitions, key) && !optionKeysExtra.has(key))) {
      return;
    }

    // A string carries no configuration for these options. The CLI parses config
    // values as JSON first, so only a value that is not JSON reaches this from
    // there. (`minifyURLs` is deliberately excluded—there, a string names the site.)
    const definition = optionDefinitions[key];
    if (typeof option === 'string' && definition?.type === 'jsonObject') {
      const message = `HTML Minifier Next: Ignoring \`${key}\`—it takes a boolean or an object, not a string (“${option}”)`;
      if (!stringValuesWarned.has(message)) {
        stringValuesWarned.add(message);
        warn(message);
      }
      return;
    }

    if (key === 'caseSensitive') {
      // HTML names are read in lowercase, like browsers do, and only written as in the source
      if (option) {
        options.namesAsWritten = true;
      }
    } else if (key === 'removeUnusedCSS') {
      optionsDynamic.removeUnusedCSS = normalizeUnusedCSSOptions(option, message => {
        if (!unusedCSSWarned.has(message)) {
          unusedCSSWarned.add(message);
          warn(`HTML Minifier Next: ${message}`);
        }
      });
    } else if (key === 'log') {
      if (typeof option === 'function') {
        options.log = option;
      }
    } else if (key === 'canMinifyCSS' || key === 'canMinifyJS' || key === 'canMinifySVG') {
      if (typeof option === 'function') {
        optionsDynamic[key] = option;
      }
    } else if (key === 'minifyCSS' && typeof option !== 'function') {
      if (!option || !getLightningCSS || !cssMinifyCache) {
        return;
      }

      const lightningCssOptions = typeof option === 'object' ? option : {};
      // Capture to preserve TypeScript narrowing across the async closure boundary below
      const cssLoader = getLightningCSS;
      const cssCache = cssMinifyCache;

      options.minifyCSS = async function (/** @type {string} */ text, /** @type {string | undefined} */ type, /** @type {CSSContext | undefined} */ context) {
        // Fast path: Nothing to minify
        if (!text || !text.trim()) {
          return text;
        }

        if (declinesMinify(options, 'canMinifyCSS', text, type)) {
          return text;
        }

        // Warnings are cached with the result and replayed on every hit, so a second document with
        // the same defect hears about it, too (`context.warned` keeps one document from repeating
        // itself), and the output doesn’t depend on cache size or eviction. They are cached even
        // with the no-op `log`, so a later document with a `log` hook still gets them.
        const report = (/** @type {string[]} */ messages) => {
          if (!messages.length || options.log === identity) {
            return;
          }
          const warned = context?.warned;
          for (const message of messages) {
            if (warned) {
              if (warned.has(message)) {
                continue;
              }
              warned.add(message);
            }
            options.log(message);
          }
        };

        // Skip the costly `replaceAsync` when URL minification is off
        if (options.minifyURLs !== identity) {
          text = await replaceAsync(
            text,
            /(url\s*\(\s*)(?:"([^"]*)"|'([^']*)'|([^\s)]+))(\s*\))/ig,
            async function (/** @type {string} */ match, /** @type {string} */ prefix, /** @type {string | undefined} */ dq, /** @type {string | undefined} */ sq, /** @type {string | undefined} */ unq, /** @type {string} */ suffix) {
              const quote = dq != null ? '"' : (sq != null ? "'" : '');
              const url = dq ?? sq ?? unq ?? '';
              try {
                const out = await options.minifyURLs(url);
                return prefix + quote + (typeof out === 'string' ? out : url) + quote + suffix;
              } catch (err) {
                if (!options.continueOnMinifyError) {
                  throw err;
                }
                options.log && options.log(err);
                return match;
              }
            }
          );
        }

        // Unused-symbol removal applies to style sheets only
        const unusedCSSConfig = type === undefined ? options.removeUnusedCSS : undefined;
        const unusedSymbols = (unusedCSSConfig && context?.usedSymbols)
          ? findUnusedSymbols(text, context.usedSymbols, unusedCSSConfig.safelist)
          : undefined;
        // Selectors are pruned one by one, too—unless a `visitor` of the caller’s own is
        // set, or the sheet uses `@scope`, whose preludes the visitor reaches as well and
        // where a dropped limit would widen the scope
        const pruneSelectors = Boolean(unusedSymbols && context?.usedElements) &&
          !('visitor' in lightningCssOptions) && !RE_SCOPE_AT_RULE.test(text);

        // Cache key: Content + type + options signature; large inputs are hashed to avoid
        // huge Map keys. The symbol list belongs in the signature: The cache outlives a
        // single `minify()` call, so identical style sheets in differently marked-up
        // documents must not share an entry; so do the element set and the safelist
        // where the selector visitor reads them.
        const inputCSS = wrapCSS(text, type);
        const cssSig = stableStringify({
          type,
          opts: lightningCssOptions,
          cont: !!options.continueOnMinifyError,
          unused: unusedSymbols && unusedSymbols.length ? unusedSymbols.slice().sort() : undefined,
          elements: pruneSelectors ? context?.usedElementsKey : undefined,
          safelist: pruneSelectors ? unusedCSSConfig?.safelist : undefined
        });
        const isCacheable = inputCSS.length <= MAX_CACHE_ENTRY_SIZE;
        const cssKey = isCacheable
          ? (inputCSS.length > 2048
            ? (hashContent(inputCSS) + '|' + type + '|' + cssSig)
            : (inputCSS + '|' + type + '|' + cssSig))
          : undefined;

        try {
          if (cssKey !== undefined) {
            const cached = /** @type {CSSResult | Promise<CSSResult> | undefined} */ (cssCache.get(cssKey));
            if (cached !== undefined) {
              // Support both resolved values and in-flight promises
              const settled = await cached;
              report(settled.warnings);
              return settled.css;
            }
          }

          // In-flight promise caching: Prevent duplicate concurrent minifications
          // of the same CSS content (same pattern as JS minification)
          const inFlight = (async () => {
            const transformCSS = await cssLoader();
            // `Buffer.from()` is required—the Lightning CSS API expects a `Uint8Array`
            const result = transformCSS({
              filename: 'input.css',
              code: Buffer.from(inputCSS),
              minify: true,
              errorRecovery: !!options.continueOnMinifyError,
              ...lightningCssOptions,
              // Union, so that a manually supplied `unusedSymbols` list survives
              ...(unusedSymbols && unusedSymbols.length
                ? { unusedSymbols: lightningCssOptions.unusedSymbols ? [...new Set([...lightningCssOptions.unusedSymbols, ...unusedSymbols])] : unusedSymbols }
                : {}),
              ...(pruneSelectors && unusedCSSConfig && context?.usedElements
                ? { visitor: { Selector: createSelectorPruner(unusedSymbols ?? [], context.usedElements, unusedCSSConfig.safelist) } }
                : {})
            });

            // With `errorRecovery` enabled, Lightning CSS reports what it takes issue
            // with instead of throwing—dropping the rule in some cases (`@property`
            // with a bad `syntax`) and passing it through in others (an unknown
            // at-rule), which is why the wording stops at “reported”
            /** @type {string[]} */
            const warnings = [];
            if (result.warnings) {
              for (const warning of result.warnings) {
                const at = warning.loc ? ` (line ${warning.loc.line}, column ${warning.loc.column})` : '';
                warnings.push(`Warning: Lightning CSS reported invalid CSS${at}: ${warning.message}`);
              }
            }

            const outputCSS = unwrapCSS(result.code.toString(), type);

            // Where Lightning CSS emptied template syntax (`<?php ?>`, `{{ }}`: `<` or `>` without
            // `CDATA`) or custom-fragment UIDs (long lowercase alphanumeric runs), keep the
            // original; CDATA sections, entities, and other invalid CSS may go
            const isCDATA = text.includes('<![CDATA[');
            const uidPattern = /[a-z0-9]{10,}/; // UIDs are long alphanumeric strings
            const hasUID = uidPattern.test(text) && !isCDATA; // Exclude CDATA from UID detection
            const looksLikeTemplate = (text.includes('<') || text.includes('>')) && !isCDATA;

            const css = (text.trim() && !outputCSS.trim() && (looksLikeTemplate || hasUID)) ? text : outputCSS;
            return { css, warnings };
          })();

          if (cssKey !== undefined) cssCache.set(cssKey, inFlight);
          const resolved = await inFlight;
          if (cssKey !== undefined) cssCache.set(cssKey, resolved);
          report(resolved.warnings);
          return resolved.css;
        } catch (err) {
          if (cssKey !== undefined) cssCache.delete(cssKey);
          if (!options.continueOnMinifyError) {
            throw err;
          }
          options.log && options.log(err);
          return text;
        }
      };
    } else if (key === 'minifyJS' && typeof option !== 'function') {
      if (!option || !getTerser || !getSwc || !jsMinifyCache) {
        return;
      }

      // Capture to preserve TypeScript narrowing across the async closure boundary below
      const loadTerser = getTerser;
      const loadSwc = getSwc;
      const jsCache = jsMinifyCache;

      const config = typeof option === 'object' ? option : {};
      const engine = normalizeEngine(config.engine, 'terser');

      const supportedEngines = ['terser', 'swc'];
      if (!supportedEngines.includes(/** @type {string} */ (engine))) {
        throw new Error(`Unsupported JS minifier engine: \`${describeEngine(engine)}\`. Supported engines: ${supportedEngines.join(', ')}`);
      }

      const engineOptions = { ...config };
      delete engineOptions.engine;

      // Terser options (needed for inline JS and when engine is `terser`)
      const terserOptions = engine === 'terser' ? engineOptions : {};
      terserOptions.parse = {
        ...terserOptions.parse,
        bare_returns: false
      };

      // SWC options (when engine is `swc`)
      const swcOptions = engine === 'swc' ? engineOptions : {};

      // Option signatures, computed once rather than per call
      const terserSig = stableStringify({
        ...terserOptions,
        cont: !!options.continueOnMinifyError
      });
      const swcSig = stableStringify({
        ...swcOptions,
        cont: !!options.continueOnMinifyError
      });

      options.minifyJS = async function (/** @type {string} */ text, /** @type {boolean | undefined} */ inline, /** @type {boolean | undefined} */ isModule) {
        const start = text.match(/^\s*<!--.*/);
        const code = start ? text.slice(start[0].length).replace(/\n\s*-->\s*$/, '') : text;

        // Fast path: Avoid invoking minifier for empty/whitespace-only content
        if (!code || !code.trim()) {
          return '';
        }

        if (declinesMinify(options, 'canMinifyJS', text, inline)) {
          return text;
        }

        // Inline JS always goes to Terser, for bare returns; script blocks go to the chosen engine
        const useEngine = inline ? 'terser' : engine;
        let jsKey;
        const isCacheable = code.length <= MAX_CACHE_ENTRY_SIZE;

        try {
          const optsSig = useEngine === 'terser' ? terserSig : swcSig;

          if (isCacheable) {
            // For large inputs, hash the full content to avoid storing huge strings as Map keys
            jsKey = (code.length > 2048 ? (hashContent(code) + '|') : (code + '|'))
              + (inline ? '1' : '0') + '|' + (isModule ? 'm' : '') + '|' + useEngine + '|' + optsSig;

            const cached = /** @type {string | Promise<string> | undefined} */ (jsCache.get(jsKey));
            if (cached !== undefined) {
              return await cached;
            }
          }

          const inFlight = (async () => {
            if (useEngine === 'terser') {
              // Create a copy to avoid mutating shared `terserOptions` (race condition)
              const terserCallOptions = {
                ...terserOptions,
                parse: {
                  ...terserOptions.parse,
                  bare_returns: inline
                },
                ...(isModule ? { module: true } : {}) // Overrides user options: module detection takes precedence for `<script type=module>`
              };
              const terser = await loadTerser();
              const result = await terser(code, terserCallOptions);
              return result.code.replace(RE_TRAILING_SEMICOLON, '');
            } else if (useEngine === 'swc') {
              const swc = await loadSwc();
              // `swc.minify()` takes compress and mangle directly as options
              const result = await swc.minify(code, {
                compress: true,
                mangle: true,
                ...swcOptions,
                ...(isModule ? { module: true } : {}) // Overrides user options: module detection takes precedence for `<script type=module>`
              });
              return result.code.replace(RE_TRAILING_SEMICOLON, '');
            }
            throw new Error(`Unknown JS minifier engine: ${useEngine}`);
          })();

          if (jsKey !== undefined) jsCache.set(jsKey, inFlight);
          const resolved = await inFlight;
          if (jsKey !== undefined) jsCache.set(jsKey, resolved);
          return resolved;
        } catch (err) {
          if (jsKey !== undefined) jsCache.delete(jsKey);
          if (!options.continueOnMinifyError || isMissingDependency(err)) {
            throw err;
          }
          options.log && options.log(err);
          return text;
        }
      };

      // Whether dispatching script bodies ahead of the parse pays off. It needs a minifier
      // that leaves the main thread—SWC hands work to its own threadpool, where overlapping
      // calls genuinely run at once, while Terser would only compete with the parse for the
      // one thread both share. A user-supplied `minifyJS` is excluded either way—only this
      // wrapper is content-keyed and free of side effects.
      options.parallelJS = engine === 'swc';
    } else if (key === 'minifyURLs' && typeof option !== 'function') {
      if (!option) {
        return;
      }

      let urlOptions = option;

      if (typeof option === 'string') {
        urlOptions = { site: option };
      } else if (typeof option !== 'object') {
        urlOptions = {};
      }

      const relate = createUrlMinifier(urlOptions.site || '');

      // Reuse the persistent cache for this site configuration
      const instanceCache = getUrlMinifyCache(urlOptions.site || '');

      options.minifyURLs = function (/** @type {string} */ text) {
        // Fast path: Skip text without URL-like characters (`/`, `:`, `#`, `?`) or spaces
        if (!/[/:?#\s]/.test(text)) {
          return text;
        }

        const cached = /** @type {string | undefined} */ (instanceCache.get(text));
        if (cached !== undefined) {
          return cached;
        }

        try {
          const result = relate(text);
          instanceCache.set(text, result);
          return result;
        } catch (err) {
          // Don’t cache errors
          if (!options.continueOnMinifyError) {
            throw err;
          }
          options.log && options.log(err);
          return text;
        }
      };
    } else if (key === 'minifySVG' && typeof option !== 'function') {
      if (!option || !getSvgo || !svgMinifyCache) {
        return;
      }

      // Capture to preserve TypeScript narrowing across the async closure boundary below
      const loadSvgo = getSvgo;
      const svgCache = svgMinifyCache;

      // A config without `plugins` of its own keeps the plugins fit for inline SVG
      const svgoConfig = typeof option === 'object' ? /** @type {{plugins?: unknown[]}} */ (option) : {};
      const svgoOptions = { ...svgoConfig, plugins: svgoConfig.plugins ?? svgoPluginsInline };

      // Option signature for cache keys
      const svgSig = stableStringify({
        ...svgoOptions,
        cont: !!options.continueOnMinifyError
      });

      options.minifySVG = async function (/** @type {string} */ svgContent) {
        if (!svgContent || !svgContent.trim()) {
          return svgContent;
        }

        if (declinesMinify(options, 'canMinifySVG', svgContent)) {
          return svgContent;
        }

        // SVGO needs every attribute to carry a value, but its output is HTML again,
        // where an empty value can go; it escapes quotes in values and text, so `=""`
        // is always one. Read here, as options are processed in the order they are given.
        const collapseEmpty = Boolean(options.collapseEmptyAttributes);
        const removeNamespaces = Boolean(options.removeRedundantAttributes);

        // XML reads `xlink:` names only where their prefix is declared, which HTML needs not be;
        // a declaration added to the root for SVGO goes after it (one on a nested `svg` covers
        // that one only)
        const rootEnd = svgContent.indexOf('xlink:') !== -1 && RE_SVG_START.test(svgContent) ? findTagEnd(svgContent, 4) : -1;
        // Values are quoted where SVGO reads, so what is left is names
        const addsXLink = rootEnd !== -1 &&
          !RE_XLINK_DECLARATION.test(svgContent.slice(4, rootEnd).replace(RE_QUOTED_VALUE, ''));
        const svgInput = addsXLink
          ? '<svg xmlns:xlink="' + namespaceXLink + '"' + svgContent.slice(4)
          : svgContent;

        const isCacheable = svgContent.length <= MAX_CACHE_ENTRY_SIZE;
        const svgKey = isCacheable
          ? (svgContent.length > 2048
            ? (hashContent(svgContent) + '|' + svgSig)
            : (svgContent + '|' + svgSig)) + (collapseEmpty ? '|c' : '') + (removeNamespaces ? '|n' : '')
          : undefined;

        try {
          if (svgKey !== undefined) {
            const cached = /** @type {string | Promise<string> | undefined} */ (svgCache.get(svgKey));
            if (cached !== undefined) {
              return await cached;
            }
          }

          const inFlight = (async () => {
            const optimize = await loadSvgo();
            const result = optimize(svgInput, removeNamespaces
              ? { ...svgoOptions, plugins: [...svgoOptions.plugins, pluginNamespacesHTML] }
              : svgoOptions);
            let data = result.data;
            // The root’s declaration was added for SVGO, unless all of them go
            if (removeNamespaces) {
              data = data.replace(RE_XLINK_DECLARATION_SVGO, (/** @type {string} */ match) => match === XLINK_DECLARATION_SVGO ? '' : match);
            } else if (addsXLink) {
              // SVGO escapes `>` in values, so the root’s start tag ends at the first one
              const at = data.indexOf(XLINK_DECLARATION_SVGO);
              if (at !== -1 && at < data.indexOf('>')) {
                data = data.slice(0, at) + data.slice(at + XLINK_DECLARATION_SVGO.length);
              }
            }
            return collapseEmpty ? data.replace(RE_SVGO_EMPTY_ATTRIBUTE, ' $1') : data;
          })();

          if (svgKey !== undefined) svgCache.set(svgKey, inFlight);
          const resolved = await inFlight;
          if (svgKey !== undefined) svgCache.set(svgKey, resolved);
          return resolved;
        } catch (err) {
          if (svgKey !== undefined) svgCache.delete(svgKey);
          if (!options.continueOnMinifyError) {
            throw err;
          }
          options.log && options.log(err);
          return svgContent;
        }
      };
    } else if (key === 'customAttrCollapse') {
      // Single regex pattern
      optionsDynamic[key] = parseRegExp(option);
    } else if (key === 'customAttrSurround') {
      // Nested array of RegExp pairs: `[[openRegExp, closeRegExp], …]`
      optionsDynamic[key] = parseNestedRegExpArray(option);
    } else if (['customAttrAssign', 'customEventAttributes', 'ignoreCustomComments', 'ignoreCustomFragments'].includes(key)) {
      // Array of regex patterns
      optionsDynamic[key] = parseRegExpArray(option);
    } else {
      optionsDynamic[key] = option;
    }
  });

  // The parser merges these into one attribute pattern, and a merged pattern
  // carries no flags of its own. `i` and `s` are written into the source instead,
  // but `u` and `v` change how a source reads and cannot be: dropped, `\p{L}`
  // stops being a property escape and matches the literal text `p{L}`, silently
  // and without failing to compile. Refusing them beats matching the wrong thing.
  /** @type {[string, RegExp[]][]} */
  const merged = [
    ['customAttrAssign', options.customAttrAssign || []],
    ['customAttrSurround', (options.customAttrSurround || []).flat()]
  ];
  for (const [key, patterns] of merged) {
    for (const re of patterns) {
      if (!(re instanceof RegExp)) continue;
      const flag = lostFlag(re);
      if (!flag) continue;
      throw new Error(`HTML Minifier Next: \`${key}\` pattern \`/${re.source}/${re.flags}\` carries \`${flag}\`, which the merged attribute pattern cannot carry—rewrite it without \`${flag}\``);
    }
  }

  // Quantifiers or alternation compounded under unbounded repetition backtrack catastrophically,
  // and a linear scan cannot stand in for them; patterns too long or too deeply nested to read are
  // refused for that alone. A lone `[\s\S]*?` up to a literal terminator is linear and passes, as
  // HMN’s default fragments have exactly that shape.
  for (const re of options.ignoreCustomFragments || []) {
    const risk = describeQuantifierRisk(re);
    if (!risk) continue;
    const problem = `Custom fragment \`/${re.source}/\` ${risk}`;
    if (options.strictCustomFragments) {
      throw new Error(`HTML Minifier Next: ${problem}`);
    }
    if (!customFragmentsWarned.has(re.source)) {
      customFragmentsWarned.add(re.source);
      warn(`HTML Minifier Next: ${problem}`);
    }
  }

  // Options that do nothing without the option they build on say so. The option is read from
  // `effectiveInput` (user options over preset), so a default filled in above doesn’t count as
  // asked for; the one it needs comes from the settled options, so an unloadable minifier is absent
  const requestedOptions = /** @type {Record<string, any>} */ (effectiveInput);
  const settledOptions = /** @type {Record<string, any>} */ (options);
  for (const { option, requires, unusable, clear } of optionDependencies) {
    if (!isRequested(requestedOptions[option])) continue;
    const aside = unusable && unusable(requestedOptions);
    if (!aside && isRequested(settledOptions[requires])) continue;
    const message = `HTML Minifier Next: Ignoring \`${option}\`—use with \`${requires}\` (\`--${paramCase(requires)}\`)${aside ? `, ${aside}` : ''}`;
    if (!dependenciesWarned.has(message)) {
      dependenciesWarned.add(message);
      warn(message);
    }
    if (clear) {
      settledOptions[option] = null;
    }
  }

  return options;
};

export {
  optionDependencies,
  optionKeysExtra,
  shouldMinifyInnerHTML,
  processOptions
};