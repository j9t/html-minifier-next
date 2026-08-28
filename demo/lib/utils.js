// Helpers the demo shares, kept apart from the page so that they can be read without one

// Escape HTML entities for safe rendering as markup

/**
 * @param {string} str
 * @returns {string}
 */
export const escapeHtml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');