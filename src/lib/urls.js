/**
 * URL minification using Node’s WHATWG URL API
 *
 * Produces the shortest equivalent URL representation:
 * - Same origin: shortest of root-relative or path-relative
 * - Cross-origin, same scheme: scheme-relative (`//host/path`)
 * - Otherwise: normalized absolute URL
 */

const REJECTED_SCHEMES = new Set(['data:', 'javascript:', 'mailto:']);

const DIRECTORY_INDEXES = ['index.html', 'index.htm'];

/**
 * Get the directory portion of a pathname (up to and including the last `/`)
 * @param {string} pathname
 * @returns {string}
 */
function getDirectory(pathname) {
  const lastSlash = pathname.lastIndexOf('/');
  return pathname.slice(0, lastSlash + 1);
}

/**
 * Compute a path-relative URL from a base directory to a target path
 * @param {string} baseDir - Base directory path (must end with `/`)
 * @param {string} targetPath - Target pathname
 * @returns {string}
 */
function relativize(baseDir, targetPath) {
  const baseSegments = baseDir.split('/').filter(Boolean);
  const targetSegments = targetPath.split('/').filter(Boolean);

  // Find common prefix length
  let common = 0;
  while (
    common < baseSegments.length &&
    common < targetSegments.length &&
    baseSegments[common] === targetSegments[common]
  ) {
    // Stop before the last target segment (the filename)
    if (common === targetSegments.length - 1) break;
    common++;
  }

  const ups = baseSegments.length - common;
  const remaining = targetSegments.slice(common);

  let relative = '../'.repeat(ups) + remaining.join('/');

  // Preserve trailing slash
  if (targetPath.endsWith('/') && relative !== '' && !relative.endsWith('/')) {
    relative += '/';
  }

  return relative;
}

/**
 * Remove directory index from the end of a pathname
 * @param {string} pathname
 * @returns {string}
 */
function removeDirectoryIndex(pathname) {
  for (const index of DIRECTORY_INDEXES) {
    if (pathname.endsWith('/' + index)) {
      return pathname.slice(0, pathname.length - index.length);
    }
  }
  return pathname;
}

/**
 * Create a URL minifier function for the given site context
 * @param {string} site - The site base URL (used to compute relative URLs)
 * @returns {function(string): string} Minifier function that returns the shortest URL
 */
export function createUrlMinifier(site) {
  let baseUrl;
  try {
    baseUrl = site ? new URL(site) : null;
  } catch {
    baseUrl = null;
  }

  return function relate(url) {
    if (!url || !url.trim()) return url;

    let targetUrl;
    try {
      targetUrl = new URL(url);
    } catch {
      // Not a valid absolute URL—try resolving against base
      if (baseUrl) {
        try {
          targetUrl = new URL(url, baseUrl);
        } catch {
          return url;
        }
      } else {
        return url;
      }
    }

    // Skip rejected schemes
    if (REJECTED_SCHEMES.has(targetUrl.protocol)) return url;

    // Clean up pathname
    targetUrl.pathname = removeDirectoryIndex(targetUrl.pathname);

    const suffix = targetUrl.search + targetUrl.hash;

    // No base URL—return normalized absolute URL
    if (!baseUrl) {
      return targetUrl.href;
    }

    // Check if same origin (protocol + hostname + port)
    const sameOrigin =
      targetUrl.protocol === baseUrl.protocol &&
      targetUrl.hostname === baseUrl.hostname &&
      targetUrl.port === baseUrl.port;

    if (!sameOrigin) {
      // Same scheme, different host—use scheme-relative
      if (targetUrl.protocol === baseUrl.protocol) {
        return '//' + targetUrl.host + targetUrl.pathname + suffix;
      }
      // Different scheme—return normalized absolute
      return targetUrl.href;
    }

    // Same origin—compute shortest representation
    const targetPath = targetUrl.pathname;
    const rootRelative = targetPath + suffix;
    const pathRelative = relativize(getDirectory(baseUrl.pathname), targetPath) + suffix;

    return pathRelative.length < rootRelative.length ? pathRelative : rootRelative;
  };
}