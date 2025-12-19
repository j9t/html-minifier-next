// RegExp patterns (to avoid repeated allocations in hot paths)

const RE_WS_START = /^[ \n\r\t\f]+/;
const RE_WS_END = /[ \n\r\t\f]+$/;
const RE_ALL_WS_NBSP = /[ \n\r\t\f\xA0]+/g;
const RE_NBSP_LEADING_GROUP = /(^|\xA0+)[^\xA0]+/g;
const RE_NBSP_LEAD_GROUP = /(\xA0+)[^\xA0]+/g;
const RE_NBSP_TRAILING_GROUP = /[^\xA0]+(\xA0+)/g;
const RE_NBSP_TRAILING_STRIP = /[^\xA0]+$/;
const RE_CONDITIONAL_COMMENT = /^\[if\s[^\]]+]|\[endif]$/;
const RE_EVENT_ATTR_DEFAULT = /^on[a-z]{3,}$/;
const RE_CAN_REMOVE_ATTR_QUOTES = /^[^ \t\n\f\r"'`=<>]+$/;
const RE_TRAILING_SEMICOLON = /;$/;
const RE_AMP_ENTITY = /&(#?[0-9a-zA-Z]+;)/g;

// Inline element Sets for whitespace handling

// Non-empty elements that will maintain whitespace around them
const inlineElementsToKeepWhitespaceAround = new Set(['a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'font', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'mark', 'math', 'meter', 'nobr', 'object', 'output', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'svg', 'textarea', 'time', 'tt', 'u', 'var', 'wbr']);

// Non-empty elements that will maintain whitespace within them
const inlineElementsToKeepWhitespaceWithin = new Set(['a', 'abbr', 'acronym', 'b', 'big', 'del', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'nobr', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var']);

// Elements that will always maintain whitespace around them
const inlineElementsToKeepWhitespace = new Set(['comment', 'img', 'input', 'wbr']);

// Default attribute values

// Default attribute values (could apply to any element)
const generalDefaults = {
  autocorrect: 'on',
  fetchpriority: 'auto',
  loading: 'eager',
  popovertargetaction: 'toggle'
};

// Tag-specific default attribute values
const tagDefaults = {
  area: { shape: 'rect' },
  button: { type: 'submit' },
  form: {
    enctype: 'application/x-www-form-urlencoded',
    method: 'get'
  },
  html: { dir: 'ltr' },
  img: { decoding: 'auto' },
  input: {
    colorspace: 'limited-srgb',
    type: 'text'
  },
  marquee: {
    behavior: 'scroll',
    direction: 'left'
  },
  style: { media: 'all' },
  textarea: { wrap: 'soft' },
  track: { kind: 'subtitles' }
};

// Script MIME types

// https://mathiasbynens.be/demo/javascript-mime-type
// https://developer.mozilla.org/en/docs/Web/HTML/Element/script#attr-type
const executableScriptsMimetypes = new Set([
  'text/javascript',
  'text/ecmascript',
  'text/jscript',
  'application/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'module'
]);

const keepScriptsMimetypes = new Set([
  'module'
]);

// Boolean attribute Sets

const isSimpleBoolean = new Set(['allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'compact', 'controls', 'declare', 'default', 'defaultchecked', 'defaultmuted', 'defaultselected', 'defer', 'disabled', 'enabled', 'formnovalidate', 'hidden', 'indeterminate', 'inert', 'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nohref', 'noresize', 'noshade', 'novalidate', 'nowrap', 'open', 'pauseonexit', 'readonly', 'required', 'reversed', 'scoped', 'seamless', 'selected', 'sortable', 'truespeed', 'typemustmatch', 'visible']);

const isBooleanValue = new Set(['true', 'false']);

// `srcset` tags

const srcsetTags = new Set(['img', 'source']);

// JSON script types

const jsonScriptTypes = new Set([
  'application/json',
  'application/ld+json',
  'application/manifest+json',
  'application/vnd.geo+json',
  'application/problem+json',
  'application/merge-patch+json',
  'application/json-patch+json',
  'importmap',
  'speculationrules',
]);

// Tag omission rules and element Sets

// Tag omission rules from https://html.spec.whatwg.org/multipage/syntax.html#optional-tags with the following extensions:
// - retain `<body>` if followed by `<noscript>`
// - `<rb>`, `<rt>`, `<rtc>`, `<rp>` follow HTML Ruby Markup Extensions draft (https://www.w3.org/TR/html-ruby-extensions/)
// - retain all tags which are adjacent to non-standard HTML tags

const optionalStartTags = new Set(['html', 'head', 'body', 'colgroup', 'tbody']);

const optionalEndTags = new Set(['html', 'head', 'body', 'li', 'dt', 'dd', 'p', 'rb', 'rt', 'rtc', 'rp', 'optgroup', 'option', 'colgroup', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);

const headerTags = new Set(['meta', 'link', 'script', 'style', 'template', 'noscript']);

const descriptionTags = new Set(['dt', 'dd']);

const pBlockTags = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'search', 'section', 'table', 'ul']);

const pInlineTags = new Set(['a', 'audio', 'del', 'ins', 'map', 'noscript', 'video']);

const rubyEndTagOmission = new Set(['rb', 'rt', 'rtc', 'rp']); // `</rb>`, `</rt>`, `</rp>` can be omitted if followed by `<rb>`, `<rt>`, `<rtc>`, or `<rp>`

const rubyRtcEndTagOmission = new Set(['rb', 'rtc']); // `</rtc>` can be omitted if followed by `<rb>` or `<rtc>` (not `<rt>` or `<rp>`)

const optionTag = new Set(['option', 'optgroup']);

const tableContentTags = new Set(['tbody', 'tfoot']);

const tableSectionTags = new Set(['thead', 'tbody', 'tfoot']);

const cellTags = new Set(['td', 'th']);

const topLevelTags = new Set(['html', 'head', 'body']);

const compactTags = new Set(['html', 'body']);

const looseTags = new Set(['head', 'colgroup', 'caption']);

const trailingTags = new Set(['dt', 'thead']);

const htmlTags = new Set(['a', 'abbr', 'acronym', 'address', 'applet', 'area', 'article', 'aside', 'audio', 'b', 'base', 'basefont', 'bdi', 'bdo', 'bgsound', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'command', 'content', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'image', 'img', 'input', 'ins', 'isindex', 'kbd', 'keygen', 'label', 'legend', 'li', 'link', 'listing', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meta', 'meter', 'multicol', 'nav', 'nobr', 'noembed', 'noframes', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'plaintext', 'pre', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'selectedcontent', 'shadow', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr', 'xmp']);

// Empty attribute regex

const reEmptyAttribute = new RegExp(
  '^(?:class|id|style|title|lang|dir|on(?:focus|blur|change|click|dblclick|mouse(' +
  '?:down|up|over|move|out)|key(?:press|down|up)))$');

// Special content elements

const specialContentTags = new Set(['script', 'style']);

// Exports

export {
  // RegExp patterns
  RE_WS_START,
  RE_WS_END,
  RE_ALL_WS_NBSP,
  RE_NBSP_LEADING_GROUP,
  RE_NBSP_LEAD_GROUP,
  RE_NBSP_TRAILING_GROUP,
  RE_NBSP_TRAILING_STRIP,
  RE_CONDITIONAL_COMMENT,
  RE_EVENT_ATTR_DEFAULT,
  RE_CAN_REMOVE_ATTR_QUOTES,
  RE_TRAILING_SEMICOLON,
  RE_AMP_ENTITY,

  // Inline element Sets
  inlineElementsToKeepWhitespaceAround,
  inlineElementsToKeepWhitespaceWithin,
  inlineElementsToKeepWhitespace,

  // Default values
  generalDefaults,
  tagDefaults,

  // Script/style constants
  executableScriptsMimetypes,
  keepScriptsMimetypes,
  jsonScriptTypes,

  // Boolean Sets
  isSimpleBoolean,
  isBooleanValue,

  // Misc
  srcsetTags,

  // Tag omission rules
  optionalStartTags,
  optionalEndTags,
  headerTags,
  descriptionTags,
  pBlockTags,
  pInlineTags,
  rubyEndTagOmission,
  rubyRtcEndTagOmission,
  optionTag,
  tableContentTags,
  tableSectionTags,
  cellTags,
  topLevelTags,
  compactTags,
  looseTags,
  trailingTags,
  htmlTags,

  // Regex
  reEmptyAttribute,
  specialContentTags
};