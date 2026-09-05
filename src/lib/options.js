/**
 * Options processing and per-document minification state
 */

import { createUrlMinifier } from './urls.js';
import { LRU, MAX_CACHE_ENTRY_SIZE, stableStringify, hashContent, identity, lowercase, paramCase, replaceAsync, parseRegExp, describeQuantifierRisk, lostFlag } from './utils.js';
import { RE_TRAILING_SEMICOLON } from './constants.js';
import { canCollapseWhitespace, canTrimWhitespace } from './whitespace.js';
import { wrapCSS, unwrapCSS } from './content.js';
import { findUnusedSymbols, normalizeUnusedCSSOptions } from './unused-css.js';
import { getPreset, getPresetNames } from '../presets.js';
import { optionDefinitions, optionDefaults } from './option-definitions.js';

/** @import { MinifierOptions, HTMLAttribute } from '../htmlminifier.js' */

// Type definitions

/**
 * Per-document state handed to `minifyCSS`. Its closure hangs off the memoized
 * options object that every `minify()` call with those options shares, so state
 * belonging to one document has to be passed in rather than captured.
 *
 * @typedef {{usedSymbols?: Set<string>, warned: Set<string>}} CSSContext
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
 *   removeUnusedCSS: {safelist: Array<string | RegExp>, scripts: boolean} | null,
 *   cssContext?: CSSContext,
 *   parallelJS?: boolean,
 *   nameParent?: (name: string) => string,
 *   nameHTML?: (name: string) => string,
 *   keepClosingSlashHTML?: boolean,
 *   insideSVG?: boolean,
 *   insideForeignContent?: boolean
 * }} ProcessedOptions
 */

// Helper functions

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
const optionKeysExtra = new Set(['preset', 'log', 'canCollapseWhitespace', 'canTrimWhitespace']);

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
  { option: 'collapseInlineTagWhitespace', requires: 'collapseWhitespace' },
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
    unusable: (/** @type {Record<string, any>} */ input) => typeof input.minifyCSS === 'function' && 'which a function of your own replaces',
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

// Main options processor

/**
 * @param {MinifierOptions} inputOptions - User-provided options
 * @param {{getLightningCSS?: Function | undefined, getTerser?: Function | undefined, getSwc?: Function | undefined, getSvgo?: Function | undefined, getOxvg?: Function | undefined, cssMinifyCache?: LRU | undefined, jsMinifyCache?: LRU | undefined, svgMinifyCache?: LRU | undefined}} [deps] - Dependencies from htmlminifier.js
 * @returns {ProcessedOptions} Normalized options with defaults applied
 */
const processOptions = (inputOptions, { getLightningCSS, getTerser, getSwc, getSvgo, getOxvg, cssMinifyCache, jsMinifyCache, svgMinifyCache } = {}) => {
  /** @type {ProcessedOptions} */
  const options = {
    name: lowercase,
    canCollapseWhitespace,
    canTrimWhitespace,
    ...optionDefaults,
    log: identity,
    minifyCSS: identity,
    minifyJS: identity,
    minifyURLs: identity,
    minifySVG: null,
    removeUnusedCSS: null
  };

  const parseRegExpArray = (/** @type {unknown} */ arr) => {
    return Array.isArray(arr) ? arr.map(parseRegExp) : [];
  };

  // Helper for nested arrays (e.g., `customAttrSurround: [[start, end], …]`)
  const parseNestedRegExpArray = (/** @type {unknown} */ arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
      // If item is an array (a pair), recursively convert each element
      if (Array.isArray(item)) {
        return item.map(parseRegExp);
      }
      // Otherwise, convert single item
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

  // Warn about unrecognized options—catches typos as well as options removed in earlier versions
  Object.keys(inputOptions).forEach(function (key) {
    if (!Object.hasOwn(optionDefinitions, key) && !optionKeysExtra.has(key) && !optionKeysWarned.has(key)) {
      optionKeysWarned.add(key);
      warn(`HTML Minifier Next: Ignoring unknown or deprecated option \`${key}\` (see README for available options)`);
    }
  });

  // Merge preset with user options so all values go through normalization
  // User options take precedence over preset values
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
      if (option) {
        options.name = identity;
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

        // Warnings are stored with the minified result and replayed on every hit, so a
        // second document with the same defect hears about it, too; `context.warned`
        // then keeps one document from repeating itself. Reporting from the cache
        // rather than only from the transform keeps the output independent of cache
        // size and eviction. They are built and cached even when `log` is the default
        // no-op, so a later document that does pass a `log` hook still gets them.
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

        // Optimization: Only process URLs if minification is enabled (not identity function)
        // This avoids expensive `replaceAsync` when URL minification is disabled
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

        // Cache key: Content + type + options signature; large inputs are hashed to avoid huge Map keys.
        // The symbol list belongs in the signature: The cache outlives a single `minify()` call, so
        // identical style sheets in differently marked-up documents must not share an entry.
        const inputCSS = wrapCSS(text, type);
        const cssSig = stableStringify({
          type,
          opts: lightningCssOptions,
          cont: !!options.continueOnMinifyError,
          unused: unusedSymbols && unusedSymbols.length ? unusedSymbols.slice().sort() : undefined
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
            // Note: `Buffer.from()` is required—Lightning CSS API expects Uint8Array
            const result = transformCSS({
              filename: 'input.css',
              code: Buffer.from(inputCSS),
              minify: true,
              errorRecovery: !!options.continueOnMinifyError,
              ...lightningCssOptions,
              // Union, so that a manually supplied `unusedSymbols` list survives
              ...(unusedSymbols && unusedSymbols.length
                ? { unusedSymbols: lightningCssOptions.unusedSymbols ? [...new Set([...lightningCssOptions.unusedSymbols, ...unusedSymbols])] : unusedSymbols }
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

            // If Lightning CSS removed significant content that looks like template syntax or UIDs, return original
            // This preserves:
            // 1. Template code like `<?php ?>`, `<%= ?>`, `{{ }}`, etc. (contain `<` or `>` but not `CDATA`)
            // 2. UIDs representing custom fragments (only lowercase letters and digits, no spaces)
            // CDATA sections, HTML entities, and other invalid CSS are allowed to be removed
            const isCDATA = text.includes('<![CDATA[');
            const uidPattern = /[a-z0-9]{10,}/; // UIDs are long alphanumeric strings
            const hasUID = uidPattern.test(text) && !isCDATA; // Exclude CDATA from UID detection
            const looksLikeTemplate = (text.includes('<') || text.includes('>')) && !isCDATA;

            // Preserve if output is empty and input had template syntax or UIDs
            // This catches cases where Lightning CSS removed content that should be preserved
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

      // Parse configuration
      const config = typeof option === 'object' ? option : {};
      const engine = (config.engine || 'terser').toLowerCase();

      // Validate engine
      const supportedEngines = ['terser', 'swc'];
      if (!supportedEngines.includes(engine)) {
        throw new Error(`Unsupported JS minifier engine: \`${engine}\`. Supported engines: ${supportedEngines.join(', ')}`);
      }

      // Extract engine-specific options (excluding `engine` field itself)
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

      // Pre-compute option signatures once for performance (avoid repeated stringification)
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

        // Hybrid strategy: Always use Terser for inline JS (needs bare returns support)
        // Use user’s chosen engine for script blocks
        const useEngine = inline ? 'terser' : engine;
        let jsKey;
        const isCacheable = code.length <= MAX_CACHE_ENTRY_SIZE;

        try {
          // Select pre-computed signature based on engine
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
            // Dispatch to appropriate minifier
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
          if (!options.continueOnMinifyError) {
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
        // Fast-path: Skip if text doesn’t look like a URL that needs processing
        // Only process if contains URL-like characters (`/`, `:`, `#`, `?`) or spaces that need encoding
        if (!/[/:?#\s]/.test(text)) {
          return text;
        }

        // Check cache
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
      if (!option || !getSvgo || !getOxvg || !svgMinifyCache) {
        return;
      }

      // Capture to preserve TypeScript narrowing across the async closure boundary below
      const loadSvgo = getSvgo;
      const loadOxvg = getOxvg;
      const svgCache = svgMinifyCache;

      // Parse configuration
      const svgConfig = typeof option === 'object' ? option : {};
      const svgEngine = (svgConfig.engine || 'svgo').toLowerCase();

      // Validate engine
      const supportedSVGEngines = ['svgo', 'oxvg'];
      if (!supportedSVGEngines.includes(svgEngine)) {
        throw new Error(`Unsupported SVG minifier engine: \`${svgEngine}\`. Supported engines: ${supportedSVGEngines.join(', ')}`);
      }

      // Extract engine-specific options (excluding `engine` field itself)
      const svgEngineOptions = { ...svgConfig };
      delete svgEngineOptions.engine;

      // The engines take unrelated configuration shapes: SVGO reads a plugin
      // pipeline, OXVG a map of job names to parameters, and any object handed
      // to OXVG replaces its defaults rather than merging into them. Unknown
      // keys are dropped silently, so an SVGO config reaches OXVG as “run no
      // jobs at all” and yields near-unminified output with nothing reported.
      // Refusing the SVGO-only keys turns that silence into a message.
      if (svgEngine === 'oxvg') {
        const svgoOnlyKeys = ['datauri', 'floatPrecision', 'js2svg', 'multipass', 'path', 'plugins'];
        const carried = svgoOnlyKeys.filter(k => k in svgEngineOptions);
        if (carried.length) {
          throw new Error(
            `SVG minifier engine \`oxvg\` does not accept SVGO options: ${carried.map(k => `“${k}”`).join(', ')}. ` +
            'OXVG takes a map of job names to parameters (for example `{removeComments: {}}`), and silently runs no jobs when given an SVGO configuration. ' +
            'Configure it in its own terms, or translate a plugin list with `convertSvgoConfig` from `@oxvg/napi`.'
          );
        }
      }

      const svgoOptions = svgEngine === 'svgo' ? svgEngineOptions : {};
      const oxvgOptions = svgEngine === 'oxvg' ? svgEngineOptions : {};

      // Pre-compute option signature for cache keys
      const svgSig = stableStringify({
        engine: svgEngine,
        ...svgEngineOptions,
        cont: !!options.continueOnMinifyError
      });

      options.minifySVG = async function (/** @type {string} */ svgContent) {
        if (!svgContent || !svgContent.trim()) {
          return svgContent;
        }

        const isCacheable = svgContent.length <= MAX_CACHE_ENTRY_SIZE;
        const svgKey = isCacheable
          ? (svgContent.length > 2048
            ? (hashContent(svgContent) + '|' + svgSig)
            : (svgContent + '|' + svgSig))
          : undefined;

        try {
          if (svgKey !== undefined) {
            const cached = /** @type {string | Promise<string> | undefined} */ (svgCache.get(svgKey));
            if (cached !== undefined) {
              return await cached;
            }
          }

          const inFlight = (async () => {
            if (svgEngine === 'oxvg') {
              const optimise = await loadOxvg();
              return optimise(svgContent, Object.keys(oxvgOptions).length ? oxvgOptions : undefined);
            }
            const optimize = await loadSvgo();
            const result = optimize(svgContent, svgoOptions);
            return result.data;
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

  // Fragments that compound quantifiers or alternation under unbounded repetition
  // are the shapes that backtrack catastrophically, and they are also the ones a
  // linear scan cannot stand in for; so are patterns too long or too deeply
  // nested to read, which are refused for that rather than for a shape. A lone
  // `[\s\S]*?` up to a literal terminator is linear and passes; HMN’s default
  // fragments have exactly that shape, so the check flagging it would mean
  // warning about the defaults themselves.
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

  // Options that silently do nothing without the option they build on say so rather
  // than let them pass. The option is read from `effectiveInput` (user options
  // over preset), so that a default filled in above doesn’t count as the user asking
  // for it; the option it needs is read from the settled options, so that a minifier
  // asked for but not loadable counts as absent rather than as present.
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

// Exports

export {
  optionDependencies,
  shouldMinifyInnerHTML,
  processOptions
};