import CleanCSS from 'clean-css';
import { decodeHTMLStrict, decodeHTML } from 'entities';
import RelateURL from 'relateurl';
import { minify as terser } from 'terser';

import { HTMLParser, endTag } from './htmlparser.js';
import TokenChain from './tokenchain.js';
import { replaceAsync } from './utils.js';

const trimWhitespace = str => str && str.replace(/^[ \n\r\t\f]+/, '').replace(/[ \n\r\t\f]+$/, '');

function collapseWhitespaceAll(str) {
  // Non-breaking space is specifically handled inside the replacer function here:
  return str && str.replace(/[ \n\r\t\f\xA0]+/g, function (spaces) {
    return spaces === '\t' ? '\t' : spaces.replace(/(^|\xA0+)[^\xA0]+/g, '$1 ');
  });
}

function collapseWhitespace(str, options, trimLeft, trimRight, collapseAll) {
  let lineBreakBefore = ''; let lineBreakAfter = '';

  if (options.preserveLineBreaks) {
    str = str.replace(/^[ \n\r\t\f]*?[\n\r][ \n\r\t\f]*/, function () {
      lineBreakBefore = '\n';
      return '';
    }).replace(/[ \n\r\t\f]*?[\n\r][ \n\r\t\f]*$/, function () {
      lineBreakAfter = '\n';
      return '';
    });
  }

  if (trimLeft) {
    // Non-breaking space is specifically handled inside the replacer function here:
    str = str.replace(/^[ \n\r\t\f\xA0]+/, function (spaces) {
      const conservative = !lineBreakBefore && options.conservativeCollapse;
      if (conservative && spaces === '\t') {
        return '\t';
      }
      return spaces.replace(/^[^\xA0]+/, '').replace(/(\xA0+)[^\xA0]+/g, '$1 ') || (conservative ? ' ' : '');
    });
  }

  if (trimRight) {
    // Non-breaking space is specifically handled inside the replacer function here:
    str = str.replace(/[ \n\r\t\f\xA0]+$/, function (spaces) {
      const conservative = !lineBreakAfter && options.conservativeCollapse;
      if (conservative && spaces === '\t') {
        return '\t';
      }
      return spaces.replace(/[^\xA0]+(\xA0+)/g, ' $1').replace(/[^\xA0]+$/, '') || (conservative ? ' ' : '');
    });
  }

  if (collapseAll) {
    // strip non space whitespace then compress spaces to one
    str = collapseWhitespaceAll(str);
  }

  return lineBreakBefore + str + lineBreakAfter;
}

// non-empty tags that will maintain whitespace around them
const inlineTags = new Set(['a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark', 'math', 'nobr', 'object', 'q', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'svg', 'textarea', 'time', 'tt', 'u', 'var']);
// non-empty tags that will maintain whitespace within them
const inlineTextTags = new Set(['a', 'abbr', 'acronym', 'b', 'big', 'del', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'nobr', 'rp', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var']);
// self-closing tags that will maintain whitespace around them
const selfClosingInlineTags = new Set(['comment', 'img', 'input', 'wbr']);

function collapseWhitespaceSmart(str, prevTag, nextTag, options) {
  let trimLeft = prevTag && !selfClosingInlineTags.has(prevTag);
  if (trimLeft && !options.collapseInlineTagWhitespace) {
    trimLeft = prevTag.charAt(0) === '/' ? !inlineTags.has(prevTag.slice(1)) : !inlineTextTags.has(prevTag);
  }
  let trimRight = nextTag && !selfClosingInlineTags.has(nextTag);
  if (trimRight && !options.collapseInlineTagWhitespace) {
    trimRight = nextTag.charAt(0) === '/' ? !inlineTextTags.has(nextTag.slice(1)) : !inlineTags.has(nextTag);
  }
  return collapseWhitespace(str, options, trimLeft, trimRight, prevTag && nextTag);
}

function isConditionalComment(text) {
  return /^\[if\s[^\]]+]|\[endif]$/.test(text);
}

function isIgnoredComment(text, options) {
  for (let i = 0, len = options.ignoreCustomComments.length; i < len; i++) {
    if (options.ignoreCustomComments[i].test(text)) {
      return true;
    }
  }
  return false;
}

function isEventAttribute(attrName, options) {
  const patterns = options.customEventAttributes;
  if (patterns) {
    for (let i = patterns.length; i--;) {
      if (patterns[i].test(attrName)) {
        return true;
      }
    }
    return false;
  }
  return /^on[a-z]{3,}$/.test(attrName);
}

function canRemoveAttributeQuotes(value) {
  // https://mathiasbynens.be/notes/unquoted-attribute-values
  return /^[^ \t\n\f\r"'`=<>]+$/.test(value);
}

function attributesInclude(attributes, attribute) {
  for (let i = attributes.length; i--;) {
    if (attributes[i].name.toLowerCase() === attribute) {
      return true;
    }
  }
  return false;
}

function isAttributeRedundant(tag, attrName, attrValue, attrs) {
  attrValue = attrValue ? trimWhitespace(attrValue.toLowerCase()) : '';

  return (
    (tag === 'script' &&
      attrName === 'language' &&
      attrValue === 'javascript') ||

    (tag === 'form' &&
      attrName === 'method' &&
      attrValue === 'get') ||

    (tag === 'input' &&
      attrName === 'type' &&
      attrValue === 'text') ||

    (tag === 'script' &&
      attrName === 'charset' &&
      !attributesInclude(attrs, 'src')) ||

    (tag === 'a' &&
      attrName === 'name' &&
      attributesInclude(attrs, 'id')) ||

    (tag === 'area' &&
      attrName === 'shape' &&
      attrValue === 'rect')
  );
}

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

function isScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0]).toLowerCase();
  return attrValue === '' || executableScriptsMimetypes.has(attrValue);
}

function keepScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0]).toLowerCase();
  return keepScriptsMimetypes.has(attrValue);
}

function isExecutableScript(tag, attrs) {
  if (tag !== 'script') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      return isScriptTypeAttribute(attrs[i].value);
    }
  }
  return true;
}

function isStyleLinkTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue).toLowerCase();
  return attrValue === '' || attrValue === 'text/css';
}

function isStyleSheet(tag, attrs) {
  if (tag !== 'style') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      return isStyleLinkTypeAttribute(attrs[i].value);
    }
  }
  return true;
}

const isSimpleBoolean = new Set(['allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'compact', 'controls', 'declare', 'default', 'defaultchecked', 'defaultmuted', 'defaultselected', 'defer', 'disabled', 'enabled', 'formnovalidate', 'hidden', 'indeterminate', 'inert', 'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nohref', 'noresize', 'noshade', 'novalidate', 'nowrap', 'open', 'pauseonexit', 'readonly', 'required', 'reversed', 'scoped', 'seamless', 'selected', 'sortable', 'truespeed', 'typemustmatch', 'visible']);
const isBooleanValue = new Set(['true', 'false']);

function isBooleanAttribute(attrName, attrValue) {
  return isSimpleBoolean.has(attrName) || (attrName === 'draggable' && !isBooleanValue.has(attrValue));
}

function isUriTypeAttribute(attrName, tag) {
  return (
    (/^(?:a|area|link|base)$/.test(tag) && attrName === 'href') ||
    (tag === 'img' && /^(?:src|longdesc|usemap)$/.test(attrName)) ||
    (tag === 'object' && /^(?:classid|codebase|data|usemap)$/.test(attrName)) ||
    (tag === 'q' && attrName === 'cite') ||
    (tag === 'blockquote' && attrName === 'cite') ||
    ((tag === 'ins' || tag === 'del') && attrName === 'cite') ||
    (tag === 'form' && attrName === 'action') ||
    (tag === 'input' && (attrName === 'src' || attrName === 'usemap')) ||
    (tag === 'head' && attrName === 'profile') ||
    (tag === 'script' && (attrName === 'src' || attrName === 'for'))
  );
}

function isNumberTypeAttribute(attrName, tag) {
  return (
    (/^(?:a|area|object|button)$/.test(tag) && attrName === 'tabindex') ||
    (tag === 'input' && (attrName === 'maxlength' || attrName === 'tabindex')) ||
    (tag === 'select' && (attrName === 'size' || attrName === 'tabindex')) ||
    (tag === 'textarea' && /^(?:rows|cols|tabindex)$/.test(attrName)) ||
    (tag === 'colgroup' && attrName === 'span') ||
    (tag === 'col' && attrName === 'span') ||
    ((tag === 'th' || tag === 'td') && (attrName === 'rowspan' || attrName === 'colspan'))
  );
}

function isLinkType(tag, attrs, value) {
  if (tag !== 'link') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i].name === 'rel' && attrs[i].value === value) {
      return true;
    }
  }
}

function isMediaQuery(tag, attrs, attrName) {
  return attrName === 'media' && (isLinkType(tag, attrs, 'stylesheet') || isStyleSheet(tag, attrs));
}

const srcsetTags = new Set(['img', 'source']);

function isSrcset(attrName, tag) {
  return attrName === 'srcset' && srcsetTags.has(tag);
}

async function cleanAttributeValue(tag, attrName, attrValue, options, attrs) {
  if (isEventAttribute(attrName, options)) {
    attrValue = trimWhitespace(attrValue).replace(/^javascript:\s*/i, '');
    return options.minifyJS(attrValue, true);
  } else if (attrName === 'class') {
    attrValue = trimWhitespace(attrValue);
    if (options.sortClassName) {
      attrValue = options.sortClassName(attrValue);
    } else {
      attrValue = collapseWhitespaceAll(attrValue);
    }
    return attrValue;
  } else if (isUriTypeAttribute(attrName, tag)) {
    attrValue = trimWhitespace(attrValue);
    return isLinkType(tag, attrs, 'canonical') ? attrValue : options.minifyURLs(attrValue);
  } else if (isNumberTypeAttribute(attrName, tag)) {
    return trimWhitespace(attrValue);
  } else if (attrName === 'style') {
    attrValue = trimWhitespace(attrValue);
    if (attrValue) {
      if (/;$/.test(attrValue) && !/&#?[0-9a-zA-Z]+;$/.test(attrValue)) {
        attrValue = attrValue.replace(/\s*;$/, ';');
      }
      attrValue = await options.minifyCSS(attrValue, 'inline');
    }
    return attrValue;
  } else if (isSrcset(attrName, tag)) {
    // https://html.spec.whatwg.org/multipage/embedded-content.html#attr-img-srcset
    attrValue = trimWhitespace(attrValue).split(/\s+,\s*|\s*,\s+/).map(function (candidate) {
      let url = candidate;
      let descriptor = '';
      const match = candidate.match(/\s+([1-9][0-9]*w|[0-9]+(?:\.[0-9]+)?x)$/);
      if (match) {
        url = url.slice(0, -match[0].length);
        const num = +match[1].slice(0, -1);
        const suffix = match[1].slice(-1);
        if (num !== 1 || suffix !== 'x') {
          descriptor = ' ' + num + suffix;
        }
      }
      return options.minifyURLs(url) + descriptor;
    }).join(', ');
  } else if (isMetaViewport(tag, attrs) && attrName === 'content') {
    attrValue = attrValue.replace(/\s+/g, '').replace(/[0-9]+\.[0-9]+/g, function (numString) {
      // "0.90000" -> "0.9"
      // "1.0" -> "1"
      // "1.0001" -> "1.0001" (unchanged)
      return (+numString).toString();
    });
  } else if (isContentSecurityPolicy(tag, attrs) && attrName.toLowerCase() === 'content') {
    return collapseWhitespaceAll(attrValue);
  } else if (options.customAttrCollapse && options.customAttrCollapse.test(attrName)) {
    attrValue = trimWhitespace(attrValue.replace(/ ?[\n\r]+ ?/g, '').replace(/\s{2,}/g, options.conservativeCollapse ? ' ' : ''));
  } else if (tag === 'script' && attrName === 'type') {
    attrValue = trimWhitespace(attrValue.replace(/\s*;\s*/g, ';'));
  } else if (isMediaQuery(tag, attrs, attrName)) {
    attrValue = trimWhitespace(attrValue);
    return options.minifyCSS(attrValue, 'media');
  }
  return attrValue;
}

function isMetaViewport(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i].name === 'name' && attrs[i].value === 'viewport') {
      return true;
    }
  }
}

function isContentSecurityPolicy(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i].name.toLowerCase() === 'http-equiv' && attrs[i].value.toLowerCase() === 'content-security-policy') {
      return true;
    }
  }
}

function ignoreCSS(id) {
  return '/* clean-css ignore:start */' + id + '/* clean-css ignore:end */';
}

// Wrap CSS declarations for CleanCSS > 3.x
// See https://github.com/jakubpawlowicz/clean-css/issues/418
function wrapCSS(text, type) {
  switch (type) {
    case 'inline':
      return '*{' + text + '}';
    case 'media':
      return '@media ' + text + '{a{top:0}}';
    default:
      return text;
  }
}

function unwrapCSS(text, type) {
  let matches;
  switch (type) {
    case 'inline':
      matches = text.match(/^\*\{([\s\S]*)\}$/);
      break;
    case 'media':
      matches = text.match(/^@media ([\s\S]*?)\s*{[\s\S]*}$/);
      break;
  }
  return matches ? matches[1] : text;
}

async function cleanConditionalComment(comment, options) {
  return options.processConditionalComments
    ? await replaceAsync(comment, /^(\[if\s[^\]]+]>)([\s\S]*?)(<!\[endif])$/, async function (match, prefix, text, suffix) {
      return prefix + await minifyHTML(text, options, true) + suffix;
    })
    : comment;
}

async function processScript(text, options, currentAttrs) {
  for (let i = 0, len = currentAttrs.length; i < len; i++) {
    if (currentAttrs[i].name.toLowerCase() === 'type' &&
      options.processScripts.indexOf(currentAttrs[i].value) > -1) {
      return await minifyHTML(text, options);
    }
  }
  return text;
}

// Tag omission rules from https://html.spec.whatwg.org/multipage/syntax.html#optional-tags
// with the following deviations:
// - retain <body> if followed by <noscript>
// - </rb>, </rt>, </rtc>, </rp> & </tfoot> follow https://www.w3.org/TR/html5/syntax.html#optional-tags
// - retain all tags which are adjacent to non-standard HTML tags
const optionalStartTags = new Set(['html', 'head', 'body', 'colgroup', 'tbody']);
const optionalEndTags = new Set(['html', 'head', 'body', 'li', 'dt', 'dd', 'p', 'rb', 'rt', 'rtc', 'rp', 'optgroup', 'option', 'colgroup', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
const headerTags = new Set(['meta', 'link', 'script', 'style', 'template', 'noscript']);
const descriptionTags = new Set(['dt', 'dd']);
const pBlockTags = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
const pInlineTags = new Set(['a', 'audio', 'del', 'ins', 'map', 'noscript', 'video']);
const rubyTags = new Set(['rb', 'rt', 'rtc', 'rp']);
const rtcTag = new Set(['rb', 'rtc', 'rp']);
const optionTag = new Set(['option', 'optgroup']);
const tableContentTags = new Set(['tbody', 'tfoot']);
const tableSectionTags = new Set(['thead', 'tbody', 'tfoot']);
const cellTags = new Set(['td', 'th']);
const topLevelTags = new Set(['html', 'head', 'body']);
const compactTags = new Set(['html', 'body']);
const looseTags = new Set(['head', 'colgroup', 'caption']);
const trailingTags = new Set(['dt', 'thead']);
const htmlTags = new Set(['a', 'abbr', 'acronym', 'address', 'applet', 'area', 'article', 'aside', 'audio', 'b', 'base', 'basefont', 'bdi', 'bdo', 'bgsound', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'command', 'content', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'image', 'img', 'input', 'ins', 'isindex', 'kbd', 'keygen', 'label', 'legend', 'li', 'link', 'listing', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meta', 'meter', 'multicol', 'nav', 'nobr', 'noembed', 'noframes', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'plaintext', 'pre', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'script', 'section', 'select', 'shadow', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr', 'xmp']);

function canRemoveParentTag(optionalStartTag, tag) {
  switch (optionalStartTag) {
    case 'html':
    case 'head':
      return true;
    case 'body':
      return !headerTags.has(tag);
    case 'colgroup':
      return tag === 'col';
    case 'tbody':
      return tag === 'tr';
  }
  return false;
}

function isStartTagMandatory(optionalEndTag, tag) {
  switch (tag) {
    case 'colgroup':
      return optionalEndTag === 'colgroup';
    case 'tbody':
      return tableSectionTags.has(optionalEndTag);
  }
  return false;
}

function canRemovePrecedingTag(optionalEndTag, tag) {
  switch (optionalEndTag) {
    case 'html':
    case 'head':
    case 'body':
    case 'colgroup':
    case 'caption':
      return true;
    case 'li':
    case 'optgroup':
    case 'tr':
      return tag === optionalEndTag;
    case 'dt':
    case 'dd':
      return descriptionTags.has(tag);
    case 'p':
      return pBlockTags.has(tag);
    case 'rb':
    case 'rt':
    case 'rp':
      return rubyTags.has(tag);
    case 'rtc':
      return rtcTag.has(tag);
    case 'option':
      return optionTag.has(tag);
    case 'thead':
    case 'tbody':
      return tableContentTags.has(tag);
    case 'tfoot':
      return tag === 'tbody';
    case 'td':
    case 'th':
      return cellTags.has(tag);
  }
  return false;
}

const reEmptyAttribute = new RegExp(
  '^(?:class|id|style|title|lang|dir|on(?:focus|blur|change|click|dblclick|mouse(' +
  '?:down|up|over|move|out)|key(?:press|down|up)))$');

function canDeleteEmptyAttribute(tag, attrName, attrValue, options) {
  const isValueEmpty = !attrValue || /^\s*$/.test(attrValue);
  if (!isValueEmpty) {
    return false;
  }
  if (typeof options.removeEmptyAttributes === 'function') {
    return options.removeEmptyAttributes(attrName, tag);
  }
  return (tag === 'input' && attrName === 'value') || reEmptyAttribute.test(attrName);
}

function hasAttrName(name, attrs) {
  for (let i = attrs.length - 1; i >= 0; i--) {
    if (attrs[i].name === name) {
      return true;
    }
  }
  return false;
}

function canRemoveElement(tag, attrs) {
  switch (tag) {
    case 'textarea':
      return false;
    case 'audio':
    case 'script':
    case 'video':
      if (hasAttrName('src', attrs)) {
        return false;
      }
      break;
    case 'iframe':
      if (hasAttrName('src', attrs) || hasAttrName('srcdoc', attrs)) {
        return false;
      }
      break;
    case 'object':
      if (hasAttrName('data', attrs)) {
        return false;
      }
      break;
    case 'applet':
      if (hasAttrName('code', attrs)) {
        return false;
      }
      break;
  }
  return true;
}

function canCollapseWhitespace(tag) {
  return !/^(?:script|style|pre|textarea)$/.test(tag);
}

function canTrimWhitespace(tag) {
  return !/^(?:pre|textarea)$/.test(tag);
}

async function normalizeAttr(attr, attrs, tag, options) {
  const attrName = options.name(attr.name);
  let attrValue = attr.value;

  if (options.decodeEntities && attrValue) {
    attrValue = decodeHTMLStrict(attrValue);
  }

  if ((options.removeRedundantAttributes &&
    isAttributeRedundant(tag, attrName, attrValue, attrs)) ||
    (options.removeScriptTypeAttributes && tag === 'script' &&
      attrName === 'type' && isScriptTypeAttribute(attrValue) && !keepScriptTypeAttribute(attrValue)) ||
    (options.removeStyleLinkTypeAttributes && (tag === 'style' || tag === 'link') &&
      attrName === 'type' && isStyleLinkTypeAttribute(attrValue))) {
    return;
  }

  if (attrValue) {
    attrValue = await cleanAttributeValue(tag, attrName, attrValue, options, attrs);
  }

  if (options.removeEmptyAttributes &&
    canDeleteEmptyAttribute(tag, attrName, attrValue, options)) {
    return;
  }

  if (options.decodeEntities && attrValue) {
    attrValue = attrValue.replace(/&(#?[0-9a-zA-Z]+;)/g, '&amp;$1');
  }

  return {
    attr,
    name: attrName,
    value: attrValue
  };
}

function buildAttr(normalized, hasUnarySlash, options, isLast, uidAttr) {
  const attrName = normalized.name;
  let attrValue = normalized.value;
  const attr = normalized.attr;
  let attrQuote = attr.quote;
  let attrFragment;
  let emittedAttrValue;

  if (typeof attrValue !== 'undefined' && (!options.removeAttributeQuotes ||
    ~attrValue.indexOf(uidAttr) || !canRemoveAttributeQuotes(attrValue))) {
    if (!options.preventAttributesEscaping) {
      if (typeof options.quoteCharacter === 'undefined') {
        const apos = (attrValue.match(/'/g) || []).length;
        const quot = (attrValue.match(/"/g) || []).length;
        attrQuote = apos < quot ? '\'' : '"';
      } else {
        attrQuote = options.quoteCharacter === '\'' ? '\'' : '"';
      }
      if (attrQuote === '"') {
        attrValue = attrValue.replace(/"/g, '&#34;');
      } else {
        attrValue = attrValue.replace(/'/g, '&#39;');
      }
    }
    emittedAttrValue = attrQuote + attrValue + attrQuote;
    if (!isLast && !options.removeTagWhitespace) {
      emittedAttrValue += ' ';
    }
  } else if (isLast && !hasUnarySlash && !/\/$/.test(attrValue)) {
    // make sure trailing slash is not interpreted as HTML self-closing tag
    emittedAttrValue = attrValue;
  } else {
    emittedAttrValue = attrValue + ' ';
  }

  if (typeof attrValue === 'undefined' || (options.collapseBooleanAttributes &&
    isBooleanAttribute(attrName.toLowerCase(), attrValue.toLowerCase()))) {
    attrFragment = attrName;
    if (!isLast) {
      attrFragment += ' ';
    }
  } else {
    attrFragment = attrName + attr.customAssign + emittedAttrValue;
  }

  return attr.customOpen + attrFragment + attr.customClose;
}

function identity(value) {
  return value;
}

function identityAsync(value) {
  return Promise.resolve(value);
}

const processOptions = (inputOptions) => {
  const options = {
    name: function (name) {
      return name.toLowerCase();
    },
    canCollapseWhitespace,
    canTrimWhitespace,
    html5: true,
    ignoreCustomComments: [
      /^!/,
      /^\s*#/
    ],
    ignoreCustomFragments: [
      /<%[\s\S]*?%>/,
      /<\?[\s\S]*?\?>/
    ],
    includeAutoGeneratedTags: true,
    log: identity,
    minifyCSS: identityAsync,
    minifyJS: identity,
    minifyURLs: identity
  };

  Object.keys(inputOptions).forEach(function (key) {
    const option = inputOptions[key];

    if (key === 'caseSensitive') {
      if (option) {
        options.name = identity;
      }
    } else if (key === 'log') {
      if (typeof option === 'function') {
        options.log = option;
      }
    } else if (key === 'minifyCSS' && typeof option !== 'function') {
      if (!option) {
        return;
      }

      const cleanCssOptions = typeof option === 'object' ? option : {};

      options.minifyCSS = async function (text, type) {
        text = text.replace(/(url\s*\(\s*)("|'|)(.*?)\2(\s*\))/ig, function (match, prefix, quote, url, suffix) {
          return prefix + quote + options.minifyURLs(url) + quote + suffix;
        });

        const inputCSS = wrapCSS(text, type);

        return new Promise((resolve) => {
          new CleanCSS(cleanCssOptions).minify(inputCSS, (_err, output) => {
            if (output.errors.length > 0) {
              output.errors.forEach(options.log);
              resolve(text);
            }

            const outputCSS = unwrapCSS(output.styles, type);
            resolve(outputCSS);
          });
        });
      };
    } else if (key === 'minifyJS' && typeof option !== 'function') {
      if (!option) {
        return;
      }

      const terserOptions = typeof option === 'object' ? option : {};

      terserOptions.parse = {
        ...terserOptions.parse,
        bare_returns: false
      };

      options.minifyJS = async function (text, inline) {
        const start = text.match(/^\s*<!--.*/);
        const code = start ? text.slice(start[0].length).replace(/\n\s*-->\s*$/, '') : text;

        terserOptions.parse.bare_returns = inline;

        try {
          const result = await terser(code, terserOptions);
          return result.code.replace(/;$/, '');
        } catch (error) {
          options.log(error);
          return text;
        }
      };
    } else if (key === 'minifyURLs' && typeof option !== 'function') {
      if (!option) {
        return;
      }

      let relateUrlOptions = option;

      if (typeof option === 'string') {
        relateUrlOptions = { site: option };
      } else if (typeof option !== 'object') {
        relateUrlOptions = {};
      }

      options.minifyURLs = function (text) {
        try {
          return RelateURL.relate(text, relateUrlOptions);
        } catch (err) {
          options.log(err);
          return text;
        }
      };
    } else {
      options[key] = option;
    }
  });
  return options;
};

function uniqueId(value) {
  let id;
  do {
    id = Math.random().toString(36).replace(/^0\.[0-9]*/, '');
  } while (~value.indexOf(id));
  return id;
}

const specialContentTags = new Set(['script', 'style']);

async function createSortFns(value, options, uidIgnore, uidAttr) {
  const attrChains = options.sortAttributes && Object.create(null);
  const classChain = options.sortClassName && new TokenChain();

  function attrNames(attrs) {
    return attrs.map(function (attr) {
      return options.name(attr.name);
    });
  }

  function shouldSkipUID(token, uid) {
    return !uid || token.indexOf(uid) === -1;
  }

  function shouldSkipUIDs(token) {
    return shouldSkipUID(token, uidIgnore) && shouldSkipUID(token, uidAttr);
  }

  async function scan(input) {
    let currentTag, currentType;
    const parser = new HTMLParser(input, {
      start: function (tag, attrs) {
        if (attrChains) {
          if (!attrChains[tag]) {
            attrChains[tag] = new TokenChain();
          }
          attrChains[tag].add(attrNames(attrs).filter(shouldSkipUIDs));
        }
        for (let i = 0, len = attrs.length; i < len; i++) {
          const attr = attrs[i];
          if (classChain && attr.value && options.name(attr.name) === 'class') {
            classChain.add(trimWhitespace(attr.value).split(/[ \t\n\f\r]+/).filter(shouldSkipUIDs));
          } else if (options.processScripts && attr.name.toLowerCase() === 'type') {
            currentTag = tag;
            currentType = attr.value;
          }
        }
      },
      end: function () {
        currentTag = '';
      },
      chars: async function (text) {
        if (options.processScripts && specialContentTags.has(currentTag) &&
          options.processScripts.indexOf(currentType) > -1) {
          await scan(text);
        }
      }
    });

    await parser.parse();
  }

  const log = options.log;
  options.log = identity;
  options.sortAttributes = false;
  options.sortClassName = false;
  await scan(await minifyHTML(value, options));
  options.log = log;
  if (attrChains) {
    const attrSorters = Object.create(null);
    for (const tag in attrChains) {
      attrSorters[tag] = attrChains[tag].createSorter();
    }
    options.sortAttributes = function (tag, attrs) {
      const sorter = attrSorters[tag];
      if (sorter) {
        const attrMap = Object.create(null);
        const names = attrNames(attrs);
        names.forEach(function (name, index) {
          (attrMap[name] || (attrMap[name] = [])).push(attrs[index]);
        });
        sorter.sort(names).forEach(function (name, index) {
          attrs[index] = attrMap[name].shift();
        });
      }
    };
  }
  if (classChain) {
    const sorter = classChain.createSorter();
    options.sortClassName = function (value) {
      return sorter.sort(value.split(/[ \n\f\r]+/)).join(' ');
    };
  }
}

async function minifyHTML(value, options, partialMarkup) {
  // Check input length limitation to prevent ReDoS attacks
  if (options.maxInputLength && value.length > options.maxInputLength) {
    throw new Error(`Input length (${value.length}) exceeds maximum allowed length (${options.maxInputLength})`);
  }

  if (options.collapseWhitespace) {
    value = collapseWhitespace(value, options, true, true);
  }

  const buffer = [];
  let charsPrevTag;
  let currentChars = '';
  let hasChars;
  let currentTag = '';
  let currentAttrs = [];
  const stackNoTrimWhitespace = [];
  const stackNoCollapseWhitespace = [];
  let optionalStartTag = '';
  let optionalEndTag = '';
  const ignoredMarkupChunks = [];
  const ignoredCustomMarkupChunks = [];
  let uidIgnore;
  let uidAttr;
  let uidPattern;

  // temporarily replace ignored chunks with comments,
  // so that we don't have to worry what's there.
  // for all we care there might be
  // completely-horribly-broken-alien-non-html-emoj-cthulhu-filled content
  value = value.replace(/<!-- htmlmin:ignore -->([\s\S]*?)<!-- htmlmin:ignore -->/g, function (match, group1) {
    if (!uidIgnore) {
      uidIgnore = uniqueId(value);
      const pattern = new RegExp('^' + uidIgnore + '([0-9]+)$');
      if (options.ignoreCustomComments) {
        options.ignoreCustomComments = options.ignoreCustomComments.slice();
      } else {
        options.ignoreCustomComments = [];
      }
      options.ignoreCustomComments.push(pattern);
    }
    const token = '<!--' + uidIgnore + ignoredMarkupChunks.length + '-->';
    ignoredMarkupChunks.push(group1);
    return token;
  });

  const customFragments = options.ignoreCustomFragments.map(function (re) {
    return re.source;
  });
  if (customFragments.length) {
    // Warn about potential ReDoS if custom fragments use unlimited quantifiers
    for (let i = 0; i < customFragments.length; i++) {
      if (/[*+]/.test(customFragments[i])) {
        options.log('Warning: Custom fragment contains unlimited quantifiers (* or +) which may cause ReDoS vulnerability');
        break;
      }
    }

    // Safe approach: Use bounded quantifiers instead of unlimited ones to prevent ReDoS
    const maxQuantifier = options.customFragmentQuantifierLimit || 200;
    const whitespacePattern = `\\s{0,${maxQuantifier}}`;

    // Use bounded quantifiers to prevent ReDoS - this approach prevents exponential backtracking
    const reCustomIgnore = new RegExp(
      whitespacePattern + '(?:' + customFragments.join('|') + '){1,' + maxQuantifier + '}' + whitespacePattern,
      'g'
    );
    // Temporarily replace custom ignored fragments with unique attributes
    value = value.replace(reCustomIgnore, function (match) {
      if (!uidAttr) {
        uidAttr = uniqueId(value);
        uidPattern = new RegExp('(\\s*)' + uidAttr + '([0-9]+)' + uidAttr + '(\\s*)', 'g');

        if (options.minifyCSS) {
          options.minifyCSS = (function (fn) {
            return function (text, type) {
              text = text.replace(uidPattern, function (match, prefix, index) {
                const chunks = ignoredCustomMarkupChunks[+index];
                return chunks[1] + uidAttr + index + uidAttr + chunks[2];
              });

              const ids = [];
              new CleanCSS().minify(wrapCSS(text, type)).warnings.forEach(function (warning) {
                const match = uidPattern.exec(warning);
                if (match) {
                  const id = uidAttr + match[2] + uidAttr;
                  text = text.replace(id, ignoreCSS(id));
                  ids.push(id);
                }
              });

              return fn(text, type).then(chunk => {
                ids.forEach(function (id) {
                  chunk = chunk.replace(ignoreCSS(id), id);
                });

                return chunk;
              });
            };
          })(options.minifyCSS);
        }

        if (options.minifyJS) {
          options.minifyJS = (function (fn) {
            return function (text, type) {
              return fn(text.replace(uidPattern, function (match, prefix, index) {
                const chunks = ignoredCustomMarkupChunks[+index];
                return chunks[1] + uidAttr + index + uidAttr + chunks[2];
              }), type);
            };
          })(options.minifyJS);
        }
      }

      const token = uidAttr + ignoredCustomMarkupChunks.length + uidAttr;
      ignoredCustomMarkupChunks.push(/^(\s*)[\s\S]*?(\s*)$/.exec(match));
      return '\t' + token + '\t';
    });
  }

  if ((options.sortAttributes && typeof options.sortAttributes !== 'function') ||
    (options.sortClassName && typeof options.sortClassName !== 'function')) {
    await createSortFns(value, options, uidIgnore, uidAttr);
  }

  function _canCollapseWhitespace(tag, attrs) {
    return options.canCollapseWhitespace(tag, attrs, canCollapseWhitespace);
  }

  function _canTrimWhitespace(tag, attrs) {
    return options.canTrimWhitespace(tag, attrs, canTrimWhitespace);
  }

  function removeStartTag() {
    let index = buffer.length - 1;
    while (index > 0 && !/^<[^/!]/.test(buffer[index])) {
      index--;
    }
    buffer.length = Math.max(0, index);
  }

  function removeEndTag() {
    let index = buffer.length - 1;
    while (index > 0 && !/^<\//.test(buffer[index])) {
      index--;
    }
    buffer.length = Math.max(0, index);
  }

  // look for trailing whitespaces, bypass any inline tags
  function trimTrailingWhitespace(index, nextTag) {
    for (let endTag = null; index >= 0 && _canTrimWhitespace(endTag); index--) {
      const str = buffer[index];
      const match = str.match(/^<\/([\w:-]+)>$/);
      if (match) {
        endTag = match[1];
      } else if (/>$/.test(str) || (buffer[index] = collapseWhitespaceSmart(str, null, nextTag, options))) {
        break;
      }
    }
  }

  // look for trailing whitespaces from previously processed text
  // which may not be trimmed due to a following comment or an empty
  // element which has now been removed
  function squashTrailingWhitespace(nextTag) {
    let charsIndex = buffer.length - 1;
    if (buffer.length > 1) {
      const item = buffer[buffer.length - 1];
      if (/^(?:<!|$)/.test(item) && item.indexOf(uidIgnore) === -1) {
        charsIndex--;
      }
    }
    trimTrailingWhitespace(charsIndex, nextTag);
  }

  const parser = new HTMLParser(value, {
    partialMarkup,
    continueOnParseError: options.continueOnParseError,
    customAttrAssign: options.customAttrAssign,
    customAttrSurround: options.customAttrSurround,
    html5: options.html5,

    start: async function (tag, attrs, unary, unarySlash, autoGenerated) {
      if (tag.toLowerCase() === 'svg') {
        options = Object.create(options);
        options.caseSensitive = true;
        options.keepClosingSlash = true;
        options.name = identity;
      }
      tag = options.name(tag);
      currentTag = tag;
      charsPrevTag = tag;
      if (!inlineTextTags.has(tag)) {
        currentChars = '';
      }
      hasChars = false;
      currentAttrs = attrs;

      let optional = options.removeOptionalTags;
      if (optional) {
        const htmlTag = htmlTags.has(tag);
        // <html> may be omitted if first thing inside is not comment
        // <head> may be omitted if first thing inside is an element
        // <body> may be omitted if first thing inside is not space, comment, <meta>, <link>, <script>, <style> or <template>
        // <colgroup> may be omitted if first thing inside is <col>
        // <tbody> may be omitted if first thing inside is <tr>
        if (htmlTag && canRemoveParentTag(optionalStartTag, tag)) {
          removeStartTag();
        }
        optionalStartTag = '';
        // end-tag-followed-by-start-tag omission rules
        if (htmlTag && canRemovePrecedingTag(optionalEndTag, tag)) {
          removeEndTag();
          // <colgroup> cannot be omitted if preceding </colgroup> is omitted
          // <tbody> cannot be omitted if preceding </tbody>, </thead> or </tfoot> is omitted
          optional = !isStartTagMandatory(optionalEndTag, tag);
        }
        optionalEndTag = '';
      }

      // set whitespace flags for nested tags (eg. <code> within a <pre>)
      if (options.collapseWhitespace) {
        if (!stackNoTrimWhitespace.length) {
          squashTrailingWhitespace(tag);
        }
        if (!unary) {
          if (!_canTrimWhitespace(tag, attrs) || stackNoTrimWhitespace.length) {
            stackNoTrimWhitespace.push(tag);
          }
          if (!_canCollapseWhitespace(tag, attrs) || stackNoCollapseWhitespace.length) {
            stackNoCollapseWhitespace.push(tag);
          }
        }
      }

      const openTag = '<' + tag;
      const hasUnarySlash = unarySlash && options.keepClosingSlash;

      buffer.push(openTag);

      if (options.sortAttributes) {
        options.sortAttributes(tag, attrs);
      }

      const parts = [];
      for (let i = attrs.length, isLast = true; --i >= 0;) {
        const normalized = await normalizeAttr(attrs[i], attrs, tag, options);
        if (normalized) {
          parts.unshift(buildAttr(normalized, hasUnarySlash, options, isLast, uidAttr));
          isLast = false;
        }
      }
      if (parts.length > 0) {
        buffer.push(' ');
        buffer.push.apply(buffer, parts);
      } else if (optional && optionalStartTags.has(tag)) {
        // start tag must never be omitted if it has any attributes
        optionalStartTag = tag;
      }

      buffer.push(buffer.pop() + (hasUnarySlash ? '/' : '') + '>');

      if (autoGenerated && !options.includeAutoGeneratedTags) {
        removeStartTag();
        optionalStartTag = '';
      }
    },
    end: function (tag, attrs, autoGenerated) {
      if (tag.toLowerCase() === 'svg') {
        options = Object.getPrototypeOf(options);
      }
      tag = options.name(tag);

      // check if current tag is in a whitespace stack
      if (options.collapseWhitespace) {
        if (stackNoTrimWhitespace.length) {
          if (tag === stackNoTrimWhitespace[stackNoTrimWhitespace.length - 1]) {
            stackNoTrimWhitespace.pop();
          }
        } else {
          squashTrailingWhitespace('/' + tag);
        }
        if (stackNoCollapseWhitespace.length &&
          tag === stackNoCollapseWhitespace[stackNoCollapseWhitespace.length - 1]) {
          stackNoCollapseWhitespace.pop();
        }
      }

      let isElementEmpty = false;
      if (tag === currentTag) {
        currentTag = '';
        isElementEmpty = !hasChars;
      }

      if (options.removeOptionalTags) {
        // <html>, <head> or <body> may be omitted if the element is empty
        if (isElementEmpty && topLevelTags.has(optionalStartTag)) {
          removeStartTag();
        }
        optionalStartTag = '';
        // </html> or </body> may be omitted if not followed by comment
        // </head> may be omitted if not followed by space or comment
        // </p> may be omitted if no more content in non-</a> parent
        // except for </dt> or </thead>, end tags may be omitted if no more content in parent element
        if (htmlTags.has(tag) && optionalEndTag && !trailingTags.has(optionalEndTag) && (optionalEndTag !== 'p' || !pInlineTags.has(tag))) {
          removeEndTag();
        }
        optionalEndTag = optionalEndTags.has(tag) ? tag : '';
      }

      if (options.removeEmptyElements && isElementEmpty && canRemoveElement(tag, attrs)) {
        // remove last "element" from buffer
        removeStartTag();
        optionalStartTag = '';
        optionalEndTag = '';
      } else {
        if (autoGenerated && !options.includeAutoGeneratedTags) {
          optionalEndTag = '';
        } else {
          buffer.push('</' + tag + '>');
        }
        charsPrevTag = '/' + tag;
        if (!inlineTags.has(tag)) {
          currentChars = '';
        } else if (isElementEmpty) {
          currentChars += '|';
        }
      }
    },
    chars: async function (text, prevTag, nextTag) {
      prevTag = prevTag === '' ? 'comment' : prevTag;
      nextTag = nextTag === '' ? 'comment' : nextTag;
      if (options.decodeEntities && text && !specialContentTags.has(currentTag)) {
        text = decodeHTML(text);
      }
      if (options.collapseWhitespace) {
        if (!stackNoTrimWhitespace.length) {
          if (prevTag === 'comment') {
            const prevComment = buffer[buffer.length - 1];
            if (prevComment.indexOf(uidIgnore) === -1) {
              if (!prevComment) {
                prevTag = charsPrevTag;
              }
              if (buffer.length > 1 && (!prevComment || (!options.conservativeCollapse && / $/.test(currentChars)))) {
                const charsIndex = buffer.length - 2;
                buffer[charsIndex] = buffer[charsIndex].replace(/\s+$/, function (trailingSpaces) {
                  text = trailingSpaces + text;
                  return '';
                });
              }
            }
          }
          if (prevTag) {
            if (prevTag === '/nobr' || prevTag === 'wbr') {
              if (/^\s/.test(text)) {
                let tagIndex = buffer.length - 1;
                while (tagIndex > 0 && buffer[tagIndex].lastIndexOf('<' + prevTag) !== 0) {
                  tagIndex--;
                }
                trimTrailingWhitespace(tagIndex - 1, 'br');
              }
            } else if (inlineTextTags.has(prevTag.charAt(0) === '/' ? prevTag.slice(1) : prevTag)) {
              text = collapseWhitespace(text, options, /(?:^|\s)$/.test(currentChars));
            }
          }
          if (prevTag || nextTag) {
            text = collapseWhitespaceSmart(text, prevTag, nextTag, options);
          } else {
            text = collapseWhitespace(text, options, true, true);
          }
          if (!text && /\s$/.test(currentChars) && prevTag && prevTag.charAt(0) === '/') {
            trimTrailingWhitespace(buffer.length - 1, nextTag);
          }
        }
        if (!stackNoCollapseWhitespace.length && nextTag !== 'html' && !(prevTag && nextTag)) {
          text = collapseWhitespace(text, options, false, false, true);
        }
      }
      if (options.processScripts && specialContentTags.has(currentTag)) {
        text = await processScript(text, options, currentAttrs);
      }
      if (isExecutableScript(currentTag, currentAttrs)) {
        text = await options.minifyJS(text);
      }
      if (isStyleSheet(currentTag, currentAttrs)) {
        text = await options.minifyCSS(text);
      }
      if (options.removeOptionalTags && text) {
        // <html> may be omitted if first thing inside is not comment
        // <body> may be omitted if first thing inside is not space, comment, <meta>, <link>, <script>, <style> or <template>
        if (optionalStartTag === 'html' || (optionalStartTag === 'body' && !/^\s/.test(text))) {
          removeStartTag();
        }
        optionalStartTag = '';
        // </html> or </body> may be omitted if not followed by comment
        // </head>, </colgroup> or </caption> may be omitted if not followed by space or comment
        if (compactTags.has(optionalEndTag) || (looseTags.has(optionalEndTag) && !/^\s/.test(text))) {
          removeEndTag();
        }
        optionalEndTag = '';
      }
      charsPrevTag = /^\s*$/.test(text) ? prevTag : 'comment';
      if (options.decodeEntities && text && !specialContentTags.has(currentTag)) {
        // Escape any `&` symbols that start either:
        // 1) a legacy named character reference (i.e. one that doesn't end with `;`)
        // 2) or any other character reference (i.e. one that does end with `;`)
        // Note that `&` can be escaped as `&amp`, without the semi-colon.
        // https://mathiasbynens.be/notes/ambiguous-ampersands
        text = text.replace(/&((?:Iacute|aacute|uacute|plusmn|Otilde|otilde|agrave|Agrave|Yacute|yacute|Oslash|oslash|atilde|Atilde|brvbar|ccedil|Ccedil|Ograve|curren|divide|eacute|Eacute|ograve|Oacute|egrave|Egrave|Ugrave|frac12|frac14|frac34|ugrave|oacute|iacute|Ntilde|ntilde|Uacute|middot|igrave|Igrave|iquest|Aacute|cedil|laquo|micro|iexcl|Icirc|icirc|acirc|Ucirc|Ecirc|ocirc|Ocirc|ecirc|ucirc|Aring|aring|AElig|aelig|acute|pound|raquo|Acirc|times|THORN|szlig|thorn|COPY|auml|ordf|ordm|Uuml|macr|uuml|Auml|ouml|Ouml|para|nbsp|euml|quot|QUOT|Euml|yuml|cent|sect|copy|sup1|sup2|sup3|iuml|Iuml|ETH|shy|reg|not|yen|amp|AMP|REG|uml|eth|deg|gt|GT|LT|lt)(?!;)|(?:#?[0-9a-zA-Z]+;))/g, '&amp$1').replace(/</g, '&lt;');
      }
      if (uidPattern && options.collapseWhitespace && stackNoTrimWhitespace.length) {
        text = text.replace(uidPattern, function (match, prefix, index) {
          return ignoredCustomMarkupChunks[+index][0];
        });
      }
      currentChars += text;
      if (text) {
        hasChars = true;
      }
      buffer.push(text);
    },
    comment: async function (text, nonStandard) {
      const prefix = nonStandard ? '<!' : '<!--';
      const suffix = nonStandard ? '>' : '-->';
      if (isConditionalComment(text)) {
        text = prefix + await cleanConditionalComment(text, options) + suffix;
      } else if (options.removeComments) {
        if (isIgnoredComment(text, options)) {
          text = '<!--' + text + '-->';
        } else {
          text = '';
        }
      } else {
        text = prefix + text + suffix;
      }
      if (options.removeOptionalTags && text) {
        // preceding comments suppress tag omissions
        optionalStartTag = '';
        optionalEndTag = '';
      }
      buffer.push(text);
    },
    doctype: function (doctype) {
      buffer.push(options.useShortDoctype
        ? '<!doctype' +
        (options.removeTagWhitespace ? '' : ' ') + 'html>'
        : collapseWhitespaceAll(doctype));
    }
  });

  await parser.parse();

  if (options.removeOptionalTags) {
    // <html> may be omitted if first thing inside is not comment
    // <head> or <body> may be omitted if empty
    if (topLevelTags.has(optionalStartTag)) {
      removeStartTag();
    }
    // except for </dt> or </thead>, end tags may be omitted if no more content in parent element
    if (optionalEndTag && !trailingTags.has(optionalEndTag)) {
      removeEndTag();
    }
  }
  if (options.collapseWhitespace) {
    squashTrailingWhitespace('br');
  }

  return joinResultSegments(buffer, options, uidPattern
    ? function (str) {
      return str.replace(uidPattern, function (match, prefix, index, suffix) {
        let chunk = ignoredCustomMarkupChunks[+index][0];
        if (options.collapseWhitespace) {
          if (prefix !== '\t') {
            chunk = prefix + chunk;
          }
          if (suffix !== '\t') {
            chunk += suffix;
          }
          return collapseWhitespace(chunk, {
            preserveLineBreaks: options.preserveLineBreaks,
            conservativeCollapse: !options.trimCustomFragments
          }, /^[ \n\r\t\f]/.test(chunk), /[ \n\r\t\f]$/.test(chunk));
        }
        return chunk;
      });
    }
    : identity, uidIgnore
    ? function (str) {
      return str.replace(new RegExp('<!--' + uidIgnore + '([0-9]+)-->', 'g'), function (match, index) {
        return ignoredMarkupChunks[+index];
      });
    }
    : identity);
}

function joinResultSegments(results, options, restoreCustom, restoreIgnore) {
  let str;
  const maxLineLength = options.maxLineLength;
  const noNewlinesBeforeTagClose = options.noNewlinesBeforeTagClose;

  if (maxLineLength) {
    let line = ''; const lines = [];
    while (results.length) {
      const len = line.length;
      const end = results[0].indexOf('\n');
      const isClosingTag = Boolean(results[0].match(endTag));
      const shouldKeepSameLine = noNewlinesBeforeTagClose && isClosingTag;

      if (end < 0) {
        line += restoreIgnore(restoreCustom(results.shift()));
      } else {
        line += restoreIgnore(restoreCustom(results[0].slice(0, end)));
        results[0] = results[0].slice(end + 1);
      }
      if (len > 0 && line.length > maxLineLength && !shouldKeepSameLine) {
        lines.push(line.slice(0, len));
        line = line.slice(len);
      } else if (end >= 0) {
        lines.push(line);
        line = '';
      }
    }
    if (line) {
      lines.push(line);
    }
    str = lines.join('\n');
  } else {
    str = restoreIgnore(restoreCustom(results.join('')));
  }
  return options.collapseWhitespace ? collapseWhitespace(str, options, true, true) : str;
}

export const minify = async function (value, options) {
  const start = Date.now();
  options = processOptions(options || {});
  const result = await minifyHTML(value, options);
  options.log('minified in: ' + (Date.now() - start) + 'ms');
  return result;
};

export default { minify };
