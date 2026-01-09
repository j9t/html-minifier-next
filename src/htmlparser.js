/*
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy “kangax” Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

/*
 * Use like so:
 *
 * HTMLParser(htmlString, {
 *   start: function(tag, attrs, unary) {},
 *   end: function(tag) {},
 *   chars: function(text) {},
 *   comment: function(text) {}
 * });
 */

class CaseInsensitiveSet extends Set {
  has(str) {
    return super.has(str.toLowerCase());
  }
}

// Regular expressions for parsing tags and attributes
const singleAttrIdentifier = /([^\s"'<>/=]+)/;
const singleAttrAssigns = [/=/];
const singleAttrValues = [
  // Attr value double quotes
  /"([^"]*)"+/.source,
  // Attr value, single quotes
  /'([^']*)'+/.source,
  // Attr value, no quotes
  /([^ \t\n\f\r"'`=<>]+)/.source
];
// https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
const qnameCapture = (function () {
  // https://www.npmjs.com/package/ncname
  const combiningChar = '\\u0300-\\u0345\\u0360\\u0361\\u0483-\\u0486\\u0591-\\u05A1\\u05A3-\\u05B9\\u05BB-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u064B-\\u0652\\u0670\\u06D6-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u0901-\\u0903\\u093C\\u093E-\\u094D\\u0951-\\u0954\\u0962\\u0963\\u0981-\\u0983\\u09BC\\u09BE-\\u09C4\\u09C7\\u09C8\\u09CB-\\u09CD\\u09D7\\u09E2\\u09E3\\u0A02\\u0A3C\\u0A3E-\\u0A42\\u0A47\\u0A48\\u0A4B-\\u0A4D\\u0A70\\u0A71\\u0A81-\\u0A83\\u0ABC\\u0ABE-\\u0AC5\\u0AC7-\\u0AC9\\u0ACB-\\u0ACD\\u0B01-\\u0B03\\u0B3C\\u0B3E-\\u0B43\\u0B47\\u0B48\\u0B4B-\\u0B4D\\u0B56\\u0B57\\u0B82\\u0B83\\u0BBE-\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\u0BCD\\u0BD7\\u0C01-\\u0C03\\u0C3E-\\u0C44\\u0C46-\\u0C48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C82\\u0C83\\u0CBE-\\u0CC4\\u0CC6-\\u0CC8\\u0CCA-\\u0CCD\\u0CD5\\u0CD6\\u0D02\\u0D03\\u0D3E-\\u0D43\\u0D46-\\u0D48\\u0D4A-\\u0D4D\\u0D57\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F3E\\u0F3F\\u0F71-\\u0F84\\u0F86-\\u0F8B\\u0F90-\\u0F95\\u0F97\\u0F99-\\u0FAD\\u0FB1-\\u0FB7\\u0FB9\\u20D0-\\u20DC\\u20E1\\u302A-\\u302F\\u3099\\u309A';
  const digit = '0-9\\u0660-\\u0669\\u06F0-\\u06F9\\u0966-\\u096F\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE7-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29';
  const extender = '\\xB7\\u02D0\\u02D1\\u0387\\u0640\\u0E46\\u0EC6\\u3005\\u3031-\\u3035\\u309D\\u309E\\u30FC-\\u30FE';
  const letter = 'A-Za-z\\xC0-\\xD6\\xD8-\\xF6\\xF8-\\u0131\\u0134-\\u013E\\u0141-\\u0148\\u014A-\\u017E\\u0180-\\u01C3\\u01CD-\\u01F0\\u01F4\\u01F5\\u01FA-\\u0217\\u0250-\\u02A8\\u02BB-\\u02C1\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03CE\\u03D0-\\u03D6\\u03DA\\u03DC\\u03DE\\u03E0\\u03E2-\\u03F3\\u0401-\\u040C\\u040E-\\u044F\\u0451-\\u045C\\u045E-\\u0481\\u0490-\\u04C4\\u04C7\\u04C8\\u04CB\\u04CC\\u04D0-\\u04EB\\u04EE-\\u04F5\\u04F8\\u04F9\\u0531-\\u0556\\u0559\\u0561-\\u0586\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0621-\\u063A\\u0641-\\u064A\\u0671-\\u06B7\\u06BA-\\u06BE\\u06C0-\\u06CE\\u06D0-\\u06D3\\u06D5\\u06E5\\u06E6\\u0905-\\u0939\\u093D\\u0958-\\u0961\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A74\\u0A85-\\u0A8B\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AE0\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B36-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB5\\u0BB7-\\u0BB9\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C33\\u0C35-\\u0C39\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CDE\\u0CE0\\u0CE1\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D28\\u0D2A-\\u0D39\\u0D60\\u0D61\\u0E01-\\u0E2E\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E45\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD\\u0EAE\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0F40-\\u0F47\\u0F49-\\u0F69\\u10A0-\\u10C5\\u10D0-\\u10F6\\u1100\\u1102\\u1103\\u1105-\\u1107\\u1109\\u110B\\u110C\\u110E-\\u1112\\u113C\\u113E\\u1140\\u114C\\u114E\\u1150\\u1154\\u1155\\u1159\\u115F-\\u1161\\u1163\\u1165\\u1167\\u1169\\u116D\\u116E\\u1172\\u1173\\u1175\\u119E\\u11A8\\u11AB\\u11AE\\u11AF\\u11B7\\u11B8\\u11BA\\u11BC-\\u11C2\\u11EB\\u11F0\\u11F9\\u1E00-\\u1E9B\\u1EA0-\\u1EF9\\u1F00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2126\\u212A\\u212B\\u212E\\u2180-\\u2182\\u3007\\u3021-\\u3029\\u3041-\\u3094\\u30A1-\\u30FA\\u3105-\\u312C\\u4E00-\\u9FA5\\uAC00-\\uD7A3';
  const ncname = '[' + letter + '_][' + letter + digit + '\\.\\-_' + combiningChar + extender + ']*';
  return '((?:' + ncname + '\\:)?' + ncname + ')';
})();
const startTagOpen = new RegExp('^<' + qnameCapture);
const startTagClose = /^\s*(\/?)>/;
export const endTag = new RegExp('^<\\/' + qnameCapture + '[^>]*>');
const doctype = /^<!DOCTYPE\s?[^>]+>/i;

let IS_REGEX_CAPTURING_BROKEN = false;
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === '';
});

// Empty elements
const empty = new CaseInsensitiveSet(['area', 'base', 'basefont', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Inline elements
const inline = new CaseInsensitiveSet(['a', 'abbr', 'acronym', 'applet', 'b', 'basefont', 'bdo', 'big', 'br', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'font', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'map', 'noscript', 'object', 'q', 's', 'samp', 'script', 'select', 'selectedcontent', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'svg', 'textarea', 'tt', 'u', 'var']);

// Elements that you can, intentionally, leave open (and which close themselves)
const closeSelf = new CaseInsensitiveSet(['colgroup', 'dd', 'dt', 'li', 'option', 'p', 'td', 'tfoot', 'th', 'thead', 'tr', 'source']);

// Attributes that have their values filled in `disabled='disabled'`
const fillAttrs = new CaseInsensitiveSet(['checked', 'compact', 'declare', 'defer', 'disabled', 'ismap', 'multiple', 'nohref', 'noresize', 'noshade', 'nowrap', 'readonly', 'selected']);

// Special elements (can contain anything)
const special = new CaseInsensitiveSet(['script', 'style']);

// HTML elements, https://html.spec.whatwg.org/multipage/indices.html#elements-3
// Phrasing content, https://html.spec.whatwg.org/multipage/dom.html#phrasing-content
const nonPhrasing = new CaseInsensitiveSet(['address', 'article', 'aside', 'base', 'blockquote', 'body', 'caption', 'col', 'colgroup', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'legend', 'li', 'menuitem', 'meta', 'ol', 'optgroup', 'option', 'param', 'rp', 'rt', 'source', 'style', 'summary', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul']);

const reCache = {};

// Pre-compiled regexes for common special elements (`script`, `style`, `noscript`)
// These are used frequently, and pre-compiling them avoids regex creation overhead
const preCompiledStackedTags = {
  'script': /([\s\S]*?)<\/script[^>]*>/i,
  'style': /([\s\S]*?)<\/style[^>]*>/i,
  'noscript': /([\s\S]*?)<\/noscript[^>]*>/i
};

// Cache for compiled attribute regexes per handler configuration
const attrRegexCache = new WeakMap();

function buildAttrRegex(handler) {
  let pattern = singleAttrIdentifier.source +
    '(?:\\s*(' + joinSingleAttrAssigns(handler) + ')' +
    '[ \\t\\n\\f\\r]*(?:' + singleAttrValues.join('|') + '))?';
  if (handler.customAttrSurround) {
    const attrClauses = [];
    for (let i = handler.customAttrSurround.length - 1; i >= 0; i--) {
      attrClauses[i] = '(?:' +
        '(' + handler.customAttrSurround[i][0].source + ')\\s*' +
        pattern +
        '\\s*(' + handler.customAttrSurround[i][1].source + ')' +
        ')';
    }
    attrClauses.push('(?:' + pattern + ')');
    pattern = '(?:' + attrClauses.join('|') + ')';
  }
  return new RegExp('^\\s*' + pattern);
}

function getAttrRegexForHandler(handler) {
  let cached = attrRegexCache.get(handler);
  if (cached) return cached;
  const compiled = buildAttrRegex(handler);
  attrRegexCache.set(handler, compiled);
  return compiled;
}

function joinSingleAttrAssigns(handler) {
  return singleAttrAssigns.concat(
    handler.customAttrAssign || []
  ).map(function (assign) {
    return '(?:' + assign.source + ')';
  }).join('|');
}

// Number of captured parts per `customAttrSurround` pattern
const NCP = 7;

export class HTMLParser {
  constructor(html, handler) {
    this.html = html;
    this.handler = handler;
  }

  async parse() {
    const handler = this.handler;
    const fullHtml = this.html;
    const fullLength = fullHtml.length;

    const stack = []; let lastTag;
    // Use cached attribute regex for this handler configuration
    const attribute = getAttrRegexForHandler(handler);
    let prevTag = undefined, nextTag = undefined;
    let prevAttrs = [], nextAttrs = [];

    // Index-based parsing
    let pos = 0;
    let lastPos;

    // Helper to get remaining HTML from current position
    const remaining = () => fullHtml.slice(pos);

    // Helper to advance position
    const advance = (n) => { pos += n; };

    // Lazy line/column calculation—only compute on actual errors
    const getLineColumn = (position) => {
      let line = 1;
      let column = 1;
      for (let i = 0; i < position; i++) {
        if (fullHtml[i] === '\n') {
          line++;
          column = 1;
        } else {
          column++;
        }
      }
      return { line, column };
    };

    while (pos < fullLength) {
      lastPos = pos;
      const html = remaining();
      // Make sure we’re not in a `script` or `style` element
      if (!lastTag || !special.has(lastTag)) {
        let textEnd = html.indexOf('<');
        if (textEnd === 0) {
          // Comment
          if (/^<!--/.test(html)) {
            const commentEnd = html.indexOf('-->');

            if (commentEnd >= 0) {
              if (handler.comment) {
                await handler.comment(html.substring(4, commentEnd));
              }
              advance(commentEnd + 3);
              prevTag = '';
              prevAttrs = [];
              continue;
            }
          }

          // https://web.archive.org/web/20241201212701/https://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
          if (/^<!\[/.test(html)) {
            const conditionalEnd = html.indexOf(']>');

            if (conditionalEnd >= 0) {
              if (handler.comment) {
                await handler.comment(html.substring(2, conditionalEnd + 1), true /* Non-standard */);
              }
              advance(conditionalEnd + 2);
              prevTag = '';
              prevAttrs = [];
              continue;
            }
          }

          // Doctype
          const doctypeMatch = html.match(doctype);
          if (doctypeMatch) {
            if (handler.doctype) {
              handler.doctype(doctypeMatch[0]);
            }
            advance(doctypeMatch[0].length);
            prevTag = '';
            prevAttrs = [];
            continue;
          }

          // End tag
          const endTagMatch = html.match(endTag);
          if (endTagMatch) {
            advance(endTagMatch[0].length);
            await parseEndTag(endTagMatch[0], endTagMatch[1]);
            prevTag = '/' + endTagMatch[1].toLowerCase();
            prevAttrs = [];
            continue;
          }

          // Start tag
          const startTagMatch = parseStartTag(html);
          if (startTagMatch) {
            advance(startTagMatch.advance);
            await handleStartTag(startTagMatch);
            prevTag = startTagMatch.tagName.toLowerCase();
            continue;
          }

          // Treat `<` as text
          if (handler.continueOnParseError) {
            textEnd = html.indexOf('<', 1);
          }
        }

        let text;
        if (textEnd >= 0) {
          text = html.substring(0, textEnd);
          advance(textEnd);
        } else {
          text = html;
          advance(html.length);
        }

        // Next tag
        const nextHtml = remaining();
        let nextTagMatch = parseStartTag(nextHtml);
        if (nextTagMatch) {
          nextTag = nextTagMatch.tagName;
          // Extract minimal attribute info for whitespace logic (just name/value pairs)
          nextAttrs = extractAttrInfo(nextTagMatch.attrs);
        } else {
          nextTagMatch = nextHtml.match(endTag);
          if (nextTagMatch) {
            nextTag = '/' + nextTagMatch[1];
            nextAttrs = [];
          } else {
            nextTag = '';
            nextAttrs = [];
          }
        }

        if (handler.chars) {
          await handler.chars(text, prevTag, nextTag, prevAttrs, nextAttrs);
        }
        prevTag = '';
        prevAttrs = [];
      } else {
        const stackedTag = lastTag.toLowerCase();
        // Use pre-compiled regex for common tags (`script`, `style`, `noscript`) to avoid regex creation overhead
        const reStackedTag = preCompiledStackedTags[stackedTag] || reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)</' + stackedTag + '[^>]*>', 'i'));

        const m = reStackedTag.exec(html);
        if (m) {
          let text = m[1];
          if (stackedTag !== 'script' && stackedTag !== 'style' && stackedTag !== 'noscript') {
            text = text
              .replace(/<!--([\s\S]*?)-->/g, '$1')
              .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
          }
          if (handler.chars) {
            await handler.chars(text);
          }
          // Advance HTML past the matched special tag content and its closing tag
          advance(m.index + m[0].length);
          await parseEndTag('</' + stackedTag + '>', stackedTag);
        } else {
          // No closing tag found; to avoid infinite loop, break similarly to previous behavior
          if (handler.continueOnParseError && handler.chars && html) {
            await handler.chars(html[0], prevTag, '', prevAttrs, []);
            advance(1);
          } else {
            break;
          }
        }
      }

      if (pos === lastPos) {
        if (handler.continueOnParseError) {
          // Skip the problematic character and continue
          if (handler.chars) {
            await handler.chars(fullHtml[pos], prevTag, '', prevAttrs, []);
          }
          advance(1);
          prevTag = '';
          prevAttrs = [];
          continue;
        }
        const loc = getLineColumn(pos);
        // Include some context before the error position so the snippet contains the offending markup plus preceding characters (e.g., “invalid<tag”)
        const CONTEXT_BEFORE = 50;
        const startPos = Math.max(0, pos - CONTEXT_BEFORE);
        const snippet = fullHtml.slice(startPos, startPos + 200).replace(/\n/g, ' ');
        throw new Error(
          `Parse error at line ${loc.line}, column ${loc.column}:\n${snippet}${fullHtml.length > startPos + 200 ? '…' : ''}`
        );
      }
    }

    if (!handler.partialMarkup) {
      // Clean up any remaining tags
      await parseEndTag();
    }

    // Helper to extract minimal attribute info (name/value pairs) from raw attribute matches
    // Used for whitespace collapsing logic—doesn’t need full processing
    function extractAttrInfo(rawAttrs) {
      if (!rawAttrs || !rawAttrs.length) return [];

      const numCustomParts = handler.customAttrSurround ? handler.customAttrSurround.length * NCP : 0;
      const baseIndex = 1 + numCustomParts;

      return rawAttrs.map(args => {
        // Extract attribute name (always at `baseIndex`)
        const name = args[baseIndex];
        // Extract value from double-quoted (`baseIndex + 2`), single-quoted (`baseIndex + 3`), or unquoted (`baseIndex + 4`)
        const value = args[baseIndex + 2] ?? args[baseIndex + 3] ?? args[baseIndex + 4];
        return { name: name?.toLowerCase(), value };
      }).filter(attr => attr.name); // Filter out invalid entries
    }

    function parseStartTag(input) {
      const start = input.match(startTagOpen);
      if (start) {
        const match = {
          tagName: start[1],
          attrs: [],
          advance: 0
        };
        let consumed = start[0].length;
        input = input.slice(consumed);
        let end, attr;

        // Safety limit: Max length of input to check for attributes
        // Protects against catastrophic backtracking on massive attribute values
        const MAX_ATTR_PARSE_LENGTH = 20000; // 20 KB should be enough for any reasonable tag

        while (true) {
          // Check for closing tag first
          end = input.match(startTagClose);
          if (end) {
            break;
          }

          // Limit the input length we pass to the regex to prevent catastrophic backtracking
          const isLimited = input.length > MAX_ATTR_PARSE_LENGTH;
          const searchInput = isLimited ? input.slice(0, MAX_ATTR_PARSE_LENGTH) : input;

          attr = searchInput.match(attribute);

          // If we limited the input and got a match, check if the value might be truncated
          if (attr && isLimited) {
            // Check if the attribute value extends beyond our search window
            const attrEnd = attr[0].length;
            // If the match ends near the limit, the value might be truncated
            if (attrEnd > MAX_ATTR_PARSE_LENGTH - 100) {
              // Manually extract this attribute to handle potentially huge value
              const manualMatch = input.match(/^\s*([^\s"'<>/=]+)\s*=\s*/);
              if (manualMatch) {
                const quoteChar = input[manualMatch[0].length];
                if (quoteChar === '"' || quoteChar === "'") {
                  const closeQuote = input.indexOf(quoteChar, manualMatch[0].length + 1);
                  if (closeQuote !== -1) {
                    const fullAttr = input.slice(0, closeQuote + 1);
                    const numCustomParts = handler.customAttrSurround
                      ? handler.customAttrSurround.length * NCP
                      : 0;
                    const baseIndex = 1 + numCustomParts;

                    attr = [];
                    attr[0] = fullAttr;
                    attr[baseIndex] = manualMatch[1]; // Attribute name
                    attr[baseIndex + 1] = '='; // `customAssign` (falls back to “=” for huge attributes)
                    const value = input.slice(manualMatch[0].length + 1, closeQuote);
                    // Place value at correct index based on quote type
                    if (quoteChar === '"') {
                      attr[baseIndex + 2] = value; // Double-quoted value
                    } else {
                      attr[baseIndex + 3] = value; // Single-quoted value
                    }
                    const attrLen = fullAttr.length;
                    input = input.slice(attrLen);
                    consumed += attrLen;
                    match.attrs.push(attr);
                    continue;
                  }
                }
                // Note: Unquoted attribute values are intentionally not handled here.
                // Per HTML spec, unquoted values cannot contain spaces or special chars,
                // making a 20 KB+ unquoted value practically impossible. If encountered,
                // it’s malformed HTML and using the truncated regex match is acceptable.
              }
            }
          }

          if (!attr) {
            break;
          }

          const attrLen = attr[0].length;
          input = input.slice(attrLen);
          consumed += attrLen;
          match.attrs.push(attr);
        }

        // Check for closing tag
        end = input.match(startTagClose);
        if (end) {
          match.unarySlash = end[1];
          consumed += end[0].length;
          match.advance = consumed;
          return match;
        }
      }
    }

    function findTagInCurrentTable(tagName) {
      let pos;
      const needle = tagName.toLowerCase();
      for (pos = stack.length - 1; pos >= 0; pos--) {
        const currentTag = stack[pos].lowerTag;
        if (currentTag === needle) {
          return pos;
        }
        // Stop searching if we hit a table boundary
        if (currentTag === 'table') {
          break;
        }
      }
      return -1;
    }

    async function parseEndTagAt(pos) {
      // Close all open elements up to `pos` (mirrors `parseEndTag`’s core branch)
      for (let i = stack.length - 1; i >= pos; i--) {
        if (handler.end) {
          await handler.end(stack[i].tag, stack[i].attrs, true);
        }
      }
      stack.length = pos;
      lastTag = pos && stack[pos - 1].tag;
    }

    async function closeIfFoundInCurrentTable(tagName) {
      const pos = findTagInCurrentTable(tagName);
      if (pos >= 0) {
        // Close at the specific index to avoid re-searching
        await parseEndTagAt(pos);
        return true;
      }
      return false;
    }

    async function handleStartTag(match) {
      const tagName = match.tagName;
      let unarySlash = match.unarySlash;

      if (handler.html5) {
        if (lastTag === 'p' && nonPhrasing.has(tagName)) {
          await parseEndTag('', lastTag);
        } else if (tagName === 'tbody') {
          await closeIfFoundInCurrentTable('thead');
        } else if (tagName === 'tfoot') {
          if (!await closeIfFoundInCurrentTable('tbody')) {
            await closeIfFoundInCurrentTable('thead');
          }
        } else if (tagName === 'thead') {
          // If a `tbody` or `tfoot` is open in the current table, close it
          if (!await closeIfFoundInCurrentTable('tbody')) {
            await closeIfFoundInCurrentTable('tfoot');
          }
        }
        if (tagName === 'col' && findTag('colgroup') < 0) {
          lastTag = 'colgroup';
          stack.push({ tag: lastTag, lowerTag: 'colgroup', attrs: [] });
          if (handler.start) {
            await handler.start(lastTag, [], false, '');
          }
        }
      }

      if (!handler.html5 && !inline.has(tagName)) {
        while (lastTag && inline.has(lastTag)) {
          await parseEndTag('', lastTag);
        }
      }

      if (closeSelf.has(tagName) && lastTag === tagName) {
        await parseEndTag('', tagName);
      }

      // Handle `dt`/`dd` cross-closing: `dt` followed by `dd`, or `dd` followed by `dt`
      if ((tagName === 'dt' || tagName === 'dd') && (lastTag === 'dt' || lastTag === 'dd')) {
        await parseEndTag('', lastTag);
      }

      const unary = empty.has(tagName) || (tagName === 'html' && lastTag === 'head') || !!unarySlash;

      const attrs = match.attrs.map(function (args) {
        let name, value, customOpen, customClose, customAssign, quote;

        // Hackish workaround for Firefox bug, https://bugzilla.mozilla.org/show_bug.cgi?id=369778
        if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
          if (args[3] === '') { delete args[3]; }
          if (args[4] === '') { delete args[4]; }
          if (args[5] === '') { delete args[5]; }
        }

        function populate(index) {
          customAssign = args[index];
          value = args[index + 1];
          if (typeof value !== 'undefined') {
            return '"';
          }
          value = args[index + 2];
          if (typeof value !== 'undefined') {
            return '\'';
          }
          value = args[index + 3];
          if (typeof value === 'undefined' && fillAttrs.has(name)) {
            value = name;
          }
          return '';
        }

        let j = 1;
        if (handler.customAttrSurround) {
          for (let i = 0, l = handler.customAttrSurround.length; i < l; i++, j += NCP) {
            name = args[j + 1];
            if (name) {
              quote = populate(j + 2);
              customOpen = args[j];
              customClose = args[j + 6];
              break;
            }
          }
        }

        if (!name && (name = args[j])) {
          quote = populate(j + 1);
        }

        return {
          name,
          value,
          customAssign: customAssign || '=',
          customOpen: customOpen || '',
          customClose: customClose || '',
          quote: quote || ''
        };
      });

      if (!unary) {
        stack.push({ tag: tagName, lowerTag: tagName.toLowerCase(), attrs });
        lastTag = tagName;
        unarySlash = '';
      }

      // Store attributes for `prevAttrs` tracking (used in whitespace collapsing)
      prevAttrs = attrs;

      if (handler.start) {
        await handler.start(tagName, attrs, unary, unarySlash);
      }
    }

    function findTag(tagName) {
      let pos;
      const needle = tagName.toLowerCase();
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerTag === needle) {
          break;
        }
      }
      return pos;
    }

    async function parseEndTag(tag, tagName) {
      let pos;

      // Find the closest opened tag of the same type
      if (tagName) {
        pos = findTag(tagName);
      } else { // If no tag name is provided, clean shop
        pos = 0;
      }

      if (pos >= 0) {
        // Close all the open elements, up the stack
        for (let i = stack.length - 1; i >= pos; i--) {
          if (handler.end) {
            handler.end(stack[i].tag, stack[i].attrs, i > pos || !tag);
          }
        }

        // Remove the open elements from the stack
        stack.length = pos;
        lastTag = pos && stack[pos - 1].tag;
      } else if (handler.partialMarkup && tagName) {
        // In partial markup mode, preserve stray end tags
        if (handler.end) {
          handler.end(tagName, [], false);
        }
      } else if (tagName.toLowerCase() === 'br') {
        if (handler.start) {
          await handler.start(tagName, [], true, '');
        }
      } else if (tagName.toLowerCase() === 'p') {
        if (handler.start) {
          await handler.start(tagName, [], false, '', true);
        }
        if (handler.end) {
          handler.end(tagName, []);
        }
      }
    }
  }
}