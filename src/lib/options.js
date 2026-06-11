import { createUrlMinifier } from './urls.js';
import { LRU, stableStringify, hashContent, identity, lowercase, replaceAsync, parseRegExp } from './utils.js';
import { RE_TRAILING_SEMICOLON } from './constants.js';
import { canCollapseWhitespace, canTrimWhitespace } from './whitespace.js';
import { wrapCSS, unwrapCSS } from './content.js';
import { getPreset, getPresetNames } from '../presets.js';
import { optionDefinitions, optionDefaults } from './option-definitions.js';

/** @import { MinifierOptions, HTMLAttribute } from '../htmlminifier.js' */

// Type definitions

/**
 * Options object produced by `processOptions` and consumed by `minifyHTML` and
 * the `lib/` helpers; normalization guarantees that the function-valued options
 * below are always present (defaulting to identity/built-in functions), and
 * minification adds writable internal state on top of the public options
 * (set on prototype-chain forks during SVG/MathML namespace transitions)
 *
 * @typedef {Omit<MinifierOptions, 'preset' | 'canCollapseWhitespace' | 'canTrimWhitespace' | 'ignoreCustomComments' | 'log' | 'minifyCSS' | 'minifyJS' | 'minifyURLs' | 'minifySVG'> & {
 *   name: (name: string) => string,
 *   log: (message: any) => unknown,
 *   ignoreCustomComments: RegExp[],
 *   canCollapseWhitespace: (tag: string, attrs: HTMLAttribute[], defaultFn: (tag: string) => boolean) => boolean,
 *   canTrimWhitespace: (tag: string, attrs: HTMLAttribute[], defaultFn: (tag: string) => boolean) => boolean,
 *   minifyCSS: (text: string, type?: string) => string | Promise<string>,
 *   minifyJS: (text: string, inline?: boolean, isModule?: boolean) => string | Promise<string>,
 *   minifyURLs: (text: string) => string | Promise<string>,
 *   minifySVG: ((svgContent: string) => string | Promise<string>) | null,
 *   nameParent?: (name: string) => string,
 *   nameHTML?: (name: string) => string,
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

// User-facing option keys that are valid but not listed in `optionDefinitions`
const optionKeysExtra = new Set(['preset', 'log', 'canCollapseWhitespace', 'canTrimWhitespace', 'cacheCSS', 'cacheJS', 'cacheSVG']);

// Unknown option keys and preset names already warned about—warn once per
// key per process, so repeated `minify` calls (e.g., batch runs) don’t flood STDERR
const optionKeysWarned = new Set();
const presetNamesWarned = new Set();

// Main options processor

/**
 * @param {MinifierOptions} inputOptions - User-provided options
 * @param {{getLightningCSS?: Function | undefined, getTerser?: Function | undefined, getSwc?: Function | undefined, getSvgo?: Function | undefined, cssMinifyCache?: LRU | undefined, jsMinifyCache?: LRU | undefined, svgMinifyCache?: LRU | undefined}} [deps] - Dependencies from htmlminifier.js
 * @returns {ProcessedOptions} Normalized options with defaults applied
 */
const processOptions = (inputOptions, { getLightningCSS, getTerser, getSwc, getSvgo, cssMinifyCache, jsMinifyCache, svgMinifyCache } = {}) => {
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
    minifySVG: null
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

  // Warn about unrecognized options—catches typos as well as options removed in earlier versions
  Object.keys(inputOptions).forEach(function (key) {
    if (!Object.hasOwn(optionDefinitions, key) && !optionKeysExtra.has(key) && !optionKeysWarned.has(key)) {
      optionKeysWarned.add(key);
      console.warn(`HTML Minifier Next: Ignoring unknown or deprecated option “${key}” (see README for available options)`);
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
      console.warn(`HTML Minifier Next: Unknown preset “${inputOptions.preset}”. Available presets: ${available}`);
    }
  }

  // Localized escape hatch for the loop below, which reads and assigns
  // user-provided values by dynamic key; consumers work against the
  // precisely-typed `ProcessedOptions` object
  const optionsDynamic = /** @type {Record<string, any>} */ (options);

  Object.keys(effectiveInput).forEach(function (key) {
    const option = /** @type {Record<string, any>} */ (effectiveInput)[key];

    // Skip `preset` (already processed) and unrecognized keys (warned about above)—
    // the latter also keeps internal keys from being overridden
    if (key === 'preset' || (!Object.hasOwn(optionDefinitions, key) && !optionKeysExtra.has(key))) {
      return;
    }

    if (key === 'caseSensitive') {
      if (option) {
        options.name = identity;
      }
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

      options.minifyCSS = async function (/** @type {string} */ text, /** @type {string | undefined} */ type) {
        // Fast path: Nothing to minify
        if (!text || !text.trim()) {
          return text;
        }

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

        // Cache key: Content + type + options signature; large inputs are hashed to avoid huge Map keys
        const inputCSS = wrapCSS(text, type);
        const cssSig = stableStringify({ type, opts: lightningCssOptions, cont: !!options.continueOnMinifyError });
        const cssKey = inputCSS.length > 2048
          ? (hashContent(inputCSS) + '|' + type + '|' + cssSig)
          : (inputCSS + '|' + type + '|' + cssSig);

        try {
          const cached = /** @type {string | Promise<string> | undefined} */ (cssCache.get(cssKey));
          if (cached !== undefined) {
            // Support both resolved values and in-flight promises
            return await cached;
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
              ...lightningCssOptions
            });

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
            return (text.trim() && !outputCSS.trim() && (looksLikeTemplate || hasUID)) ? text : outputCSS;
          })();

          cssCache.set(cssKey, inFlight);
          const resolved = await inFlight;
          cssCache.set(cssKey, resolved);
          return resolved;
        } catch (err) {
          cssCache.delete(cssKey);
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
        throw new Error(`Unsupported JS minifier engine: “${engine}”. Supported engines: ${supportedEngines.join(', ')}`);
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
        try {
          // Select pre-computed signature based on engine
          const optsSig = useEngine === 'terser' ? terserSig : swcSig;

          // For large inputs, hash the full content to avoid storing huge strings as Map keys
          jsKey = (code.length > 2048 ? (hashContent(code) + '|') : (code + '|'))
            + (inline ? '1' : '0') + '|' + (isModule ? 'm' : '') + '|' + useEngine + '|' + optsSig;

          const cached = /** @type {string | Promise<string> | undefined} */ (jsCache.get(jsKey));
          if (cached !== undefined) {
            return await cached;
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

          jsCache.set(jsKey, inFlight);
          const resolved = await inFlight;
          jsCache.set(jsKey, resolved);
          return resolved;
        } catch (err) {
          if (jsKey) jsCache.delete(jsKey);
          if (!options.continueOnMinifyError) {
            throw err;
          }
          options.log && options.log(err);
          return text;
        }
      };
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

      // Create instance-specific cache (results depend on site configuration)
      const instanceCache = new LRU(500);

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
      if (!option || !getSvgo || !svgMinifyCache) {
        return;
      }

      // Capture to preserve TypeScript narrowing across the async closure boundary below
      const loadSvgo = getSvgo;
      const svgCache = svgMinifyCache;

      const svgoOptions = typeof option === 'object' ? option : {};

      // Pre-compute option signature for cache keys
      const svgSig = stableStringify({
        ...svgoOptions,
        cont: !!options.continueOnMinifyError
      });

      options.minifySVG = async function (/** @type {string} */ svgContent) {
        if (!svgContent || !svgContent.trim()) {
          return svgContent;
        }

        // Cache key: Large inputs are hashed to avoid huge Map keys
        const svgKey = svgContent.length > 2048
          ? (hashContent(svgContent) + '|' + svgSig)
          : (svgContent + '|' + svgSig);

        try {
          const cached = /** @type {string | Promise<string> | undefined} */ (svgCache.get(svgKey));
          if (cached !== undefined) {
            return await cached;
          }

          const inFlight = (async () => {
            const optimize = await loadSvgo();
            const result = optimize(svgContent, svgoOptions);
            return result.data;
          })();

          svgCache.set(svgKey, inFlight);
          const resolved = await inFlight;
          svgCache.set(svgKey, resolved);
          return resolved;
        } catch (err) {
          svgCache.delete(svgKey);
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
  return options;
};

// Exports

export {
  shouldMinifyInnerHTML,
  processOptions
};