// Regex patterns (to avoid repeated allocations in hot paths)

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
const RE_LEGACY_ENTITIES = /&((?:Iacute|aacute|uacute|plusmn|Otilde|otilde|agrave|Agrave|Yacute|yacute|Oslash|oslash|atilde|Atilde|brvbar|ccedil|Ccedil|Ograve|curren|divide|eacute|Eacute|ograve|Oacute|egrave|Egrave|Ugrave|frac12|frac14|frac34|ugrave|oacute|iacute|Ntilde|ntilde|Uacute|middot|igrave|Igrave|iquest|Aacute|cedil|laquo|micro|iexcl|Icirc|icirc|acirc|Ucirc|Ecirc|ocirc|Ocirc|ecirc|ucirc|Aring|aring|AElig|aelig|acute|pound|raquo|Acirc|times|THORN|szlig|thorn|COPY|auml|ordf|ordm|Uuml|macr|uuml|Auml|ouml|Ouml|para|nbsp|euml|quot|QUOT|Euml|yuml|cent|sect|copy|sup1|sup2|sup3|iuml|Iuml|ETH|shy|reg|not|yen|amp|AMP|REG|uml|eth|deg|gt|GT|LT|lt)(?!;)|(?:#?[0-9a-zA-Z]+;))/g;
const RE_ESCAPE_LT = /</g;
const RE_ATTR_WS_CHECK = /[ \n\r\t\f]/;
const RE_ATTR_WS_COLLAPSE = /[ \n\r\t\f]+/g;
const RE_ATTR_WS_TRIM = /^[ \n\r\t\f]+|[ \n\r\t\f]+$/g;
const RE_NUMERIC_VALUE = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

// Inline element sets for whitespace handling

// Non-empty elements that will maintain whitespace around them
const inlineElementsToKeepWhitespaceAround = new Set(['a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'font', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'mark', 'math', 'meter', 'nobr', 'object', 'output', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'svg', 'textarea', 'time', 'tt', 'u', 'var', 'wbr']);

// Non-empty elements that will maintain whitespace within them
const inlineElementsToKeepWhitespaceWithin = new Set(['a', 'abbr', 'acronym', 'b', 'big', 'del', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'nobr', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var']);

// Elements that will always maintain whitespace around them
const inlineElementsToKeepWhitespace = new Set(['comment', 'img', 'input', 'wbr']);

// Form control elements (for conditional whitespace collapsing)
const formControlElements = new Set(['input', 'button', 'select', 'textarea', 'output', 'meter', 'progress']);

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
  link: { media: 'all' },
  marquee: {
    behavior: 'scroll',
    direction: 'left'
  },
  meta: { media: 'all' },
  source: { media: 'all' },
  style: { media: 'all' },
  textarea: { wrap: 'soft' },
  track: { kind: 'subtitles' }
};

// Script MIME types

// https://mathiasbynens.be/demo/javascript-mime-type
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script
const executableScriptsMimetypes = new Set([
  'text/javascript',
  'text/x-javascript',
  'text/ecmascript',
  'text/x-ecmascript',
  'text/jscript',
  'application/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'application/x-ecmascript',
  'module'
]);

const keepScriptsMimetypes = new Set([
  'module'
]);

// Boolean attribute sets

const isSimpleBoolean = new Set(['allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'compact', 'controls', 'declare', 'default', 'defaultchecked', 'defaultmuted', 'defaultselected', 'defer', 'disabled', 'enabled', 'formnovalidate', 'hidden', 'indeterminate', 'inert', 'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nohref', 'noresize', 'noshade', 'novalidate', 'nowrap', 'open', 'pauseonexit', 'readonly', 'required', 'reversed', 'scoped', 'seamless', 'selected', 'sortable', 'truespeed', 'typemustmatch', 'visible']);

const isBooleanValue = new Set(['true', 'false']);

// Attributes where empty value can be collapsed to just the attribute name
// `crossorigin=""` → `crossorigin` (empty string equals anonymous mode)
// `contenteditable=""` → `contenteditable` (empty string equals `true`)
const emptyCollapsible = new Set(['crossorigin', 'contenteditable']);

// `srcset` elements

const srcsetElements = new Set(['img', 'source']);

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

// Tag omission rules and element sets

// Tag omission rules from https://html.spec.whatwg.org/multipage/syntax.html#optional-tags with the following extensions:
// - retain `<body>` if followed by `<noscript>`
// - `<rb>`, `<rt>`, `<rtc>`, `<rp>` follow HTML Ruby Markup Extensions draft (https://www.w3.org/TR/html-ruby-extensions/)
// - retain all tags which are adjacent to non-standard HTML tags

const optionalStartTags = new Set(['html', 'head', 'body', 'colgroup', 'tbody']);

const optionalEndTags = new Set(['html', 'head', 'body', 'li', 'dt', 'dd', 'p', 'rb', 'rt', 'rtc', 'rp', 'optgroup', 'option', 'colgroup', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);

const headerElements = new Set(['meta', 'link', 'script', 'style', 'template', 'noscript']);

const descriptionElements = new Set(['dt', 'dd']);

const pBlockElements = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'search', 'section', 'table', 'ul']);

const pInlineElements = new Set(['a', 'audio', 'del', 'ins', 'map', 'noscript', 'video']);

const rubyEndTagOmission = new Set(['rb', 'rt', 'rtc', 'rp']); // `</rb>`, `</rt>`, `</rp>` can be omitted if followed by `<rb>`, `<rt>`, `<rtc>`, or `<rp>`

const rubyRtcEndTagOmission = new Set(['rb', 'rtc']); // `</rtc>` can be omitted if followed by `<rb>` or `<rtc>` (not `<rt>` or `<rp>`)

const optionElements = new Set(['option', 'optgroup']);

const tableContentElements = new Set(['tbody', 'tfoot']);

const tableSectionElements = new Set(['thead', 'tbody', 'tfoot']);

const cellElements = new Set(['td', 'th']);

const topLevelElements = new Set(['html', 'head', 'body']);

const compactElements = new Set(['html', 'body']);

const looseElements = new Set(['head', 'colgroup', 'caption']);

const trailingElements = new Set(['dt', 'thead']);

const htmlElements = new Set(['a', 'abbr', 'acronym', 'address', 'applet', 'area', 'article', 'aside', 'audio', 'b', 'base', 'basefont', 'bdi', 'bdo', 'bgsound', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'command', 'content', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'image', 'img', 'input', 'ins', 'isindex', 'kbd', 'keygen', 'label', 'legend', 'li', 'link', 'listing', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meta', 'meter', 'multicol', 'nav', 'nobr', 'noembed', 'noframes', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'plaintext', 'pre', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'selectedcontent', 'shadow', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr', 'xmp']);

// Empty attribute regex

const reEmptyAttribute = new RegExp(
  '^(?:class|id|style|title|lang|dir|on(?:focus|blur|change|click|dblclick|mouse(' +
  '?:down|up|over|move|out)|key(?:press|down|up)))$');

// Special content elements

const specialContentElements = new Set(['script', 'style']);

// Exports

export {
  // Regex patterns
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
  RE_LEGACY_ENTITIES,
  RE_ESCAPE_LT,
  RE_ATTR_WS_CHECK,
  RE_ATTR_WS_COLLAPSE,
  RE_ATTR_WS_TRIM,
  RE_NUMERIC_VALUE,

  // Inline element sets
  inlineElementsToKeepWhitespaceAround,
  inlineElementsToKeepWhitespaceWithin,
  inlineElementsToKeepWhitespace,
  formControlElements,

  // Default values
  generalDefaults,
  tagDefaults,

  // Script/style constants
  executableScriptsMimetypes,
  keepScriptsMimetypes,
  jsonScriptTypes,

  // Boolean sets
  isSimpleBoolean,
  isBooleanValue,
  emptyCollapsible,

  // Misc
  srcsetElements,

  // Tag omission rules
  optionalStartTags,
  optionalEndTags,
  headerElements,
  descriptionElements,
  pBlockElements,
  pInlineElements,
  rubyEndTagOmission,
  rubyRtcEndTagOmission,
  optionElements,
  tableContentElements,
  tableSectionElements,
  cellElements,
  topLevelElements,
  compactElements,
  looseElements,
  trailingElements,
  htmlElements,

  // Regex
  reEmptyAttribute,
  specialContentElements
};