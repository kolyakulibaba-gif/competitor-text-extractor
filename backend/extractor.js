const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const cheerio = require('cheerio');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const sanitizeHtml = require('sanitize-html');

// ─── User-agent rotation ────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Sanitize config ─────────────────────────────────────────────────────────
const SANITIZE_CONFIG = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br',
    'ul', 'ol', 'li',
    'strong', 'b', 'em', 'i', 'u',
    'blockquote', 'q',
    'dl', 'dt', 'dd',
    'pre', 'code',
    'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    'ol': ['type', 'start'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan', 'scope'],
  },
  disallowedTagsMode: 'discard',
};

function countStats(html) {
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    wordCount: plainText.split(/\s+/).filter(Boolean).length,
    charCount: plainText.length,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// STRICT HEADER-BASED EXTRACTION (improved)
//
// For each heading (h1-h6), walk its DIRECT SIBLINGS to collect only
// content that truly belongs to that heading — not random nested junk.
// Also collects tables.
//
// Algorithm for each heading:
//   1. Start at the heading element.
//   2. Walk nextElementSibling at the same DOM level.
//   3. If heading is wrapped alone in a div, go UP one level and walk from there.
//   4. Collect: <p>, <ul>/<ol>/<dl>, <table>, <blockquote>
//   5. If sibling is a <div>/<section> WITHOUT headings inside → look for
//      <p>, <ul>, <table> directly inside it (one level deep only).
//   6. Stop when: next heading is hit, or a container with headings is found.
// ═════════════════════════════════════════════════════════════════════════════

async function extractByHeaders(page) {
  return page.evaluate(() => {
    const HEADING_SET = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    const CONTENT_TAGS = new Set(['P', 'BLOCKQUOTE', 'PRE']);
    const LIST_TAGS = new Set(['UL', 'OL', 'DL']);
    const WRAPPER_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE']);

    // ── Find all headings starting from the first H1 ──
    const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const h1Index = allHeadings.findIndex(h => h.tagName === 'H1');
    if (h1Index < 0) return [];
    const headings = allHeadings.slice(h1Index);

    // ── Helper: extract content from a single element ──
    function extractElement(el) {
      const items = [];
      const tag = el.tagName;

      if (CONTENT_TAGS.has(tag)) {
        const text = el.textContent.trim();
        if (text.length >= 20) {
          items.push({ tag: 'p', text, html: el.innerHTML });
        }
      } else if (LIST_TAGS.has(tag)) {
        const listItems = el.querySelectorAll(':scope > li, :scope > dt, :scope > dd');
        listItems.forEach(li => {
          const text = li.textContent.trim();
          if (text.length >= 10) {
            items.push({ tag: 'li', text, html: li.innerHTML });
          }
        });
      } else if (tag === 'TABLE') {
        items.push({ tag: 'table', text: el.textContent.trim(), html: el.outerHTML });
      }

      return items;
    }

    // ── Helper: collect content from a container div (one level deep) ──
    function extractFromContainer(container) {
      const items = [];
      const children = Array.from(container.children);
      for (const child of children) {
        // Stop if we find a heading inside
        if (HEADING_SET.has(child.tagName)) break;
        if (child.querySelector && child.querySelector('h1, h2, h3, h4, h5, h6')) break;
        items.push(...extractElement(child));
      }
      return items;
    }

    // ── For each heading, walk siblings to collect its content ──
    const sections = [];

    for (let hi = 0; hi < headings.length; hi++) {
      const heading = headings[hi];
      const headingText = heading.textContent.trim();
      if (!headingText) continue;

      const contentParts = [];

      // Determine where to start walking siblings.
      // If the heading is alone in a wrapper div, go up.
      let walkFrom = heading;
      let parent = heading.parentElement;

      // Go up if the parent has NO content-bearing direct children
      // (besides the heading itself)
      let attempts = 0;
      while (parent && attempts < 4) {
        const siblings = Array.from(parent.children);
        const hasContentSiblings = siblings.some(child => {
          if (child === walkFrom) return false;
          const t = child.tagName;
          return CONTENT_TAGS.has(t) || LIST_TAGS.has(t) || t === 'TABLE';
        });

        // Also check if siblings are wrapper divs that contain content
        const hasContentInWrappers = siblings.some(child => {
          if (child === walkFrom) return false;
          if (!WRAPPER_TAGS.has(child.tagName)) return false;
          return child.querySelector(':scope > p, :scope > ul, :scope > ol, :scope > table');
        });

        if (hasContentSiblings || hasContentInWrappers) break;

        walkFrom = parent;
        parent = parent.parentElement;
        attempts++;
      }

      // Walk next siblings from walkFrom
      let sibling = walkFrom.nextElementSibling;
      while (sibling) {
        const tag = sibling.tagName;

        // Stop: hit another heading
        if (HEADING_SET.has(tag)) break;

        // Stop: container that has headings inside (next section)
        if (WRAPPER_TAGS.has(tag) && sibling.querySelector('h1, h2, h3, h4, h5, h6')) break;

        // Direct content elements
        if (CONTENT_TAGS.has(tag) || LIST_TAGS.has(tag) || tag === 'TABLE') {
          contentParts.push(...extractElement(sibling));
        }
        // Wrapper div/section without headings → look inside (one level)
        else if (WRAPPER_TAGS.has(tag)) {
          contentParts.push(...extractFromContainer(sibling));
        }

        sibling = sibling.nextElementSibling;
      }

      // ── Special fallback for H1 ──
      // On many sites, H1 is in a separate wrapper from the intro paragraphs.
      // If sibling walk found nothing, do a flat DOM walk between H1 and
      // the next heading to catch content in adjacent sections.
      if (contentParts.length === 0 && heading.tagName === 'H1' && headings.length > 1) {
        const allEls = Array.from(document.body.querySelectorAll('*'));
        const h1Pos = allEls.indexOf(heading);
        const nextH = headings[hi + 1];
        const nextPos = nextH ? allEls.indexOf(nextH) : allEls.length;

        for (let k = h1Pos + 1; k < nextPos && k < allEls.length; k++) {
          const el = allEls[k];
          if (HEADING_SET.has(el.tagName)) break;

          if (el.tagName === 'P') {
            const text = el.textContent.trim();
            // Only real prose paragraphs (60+ chars)
            if (text.length >= 60) {
              contentParts.push({ tag: 'p', text, html: el.innerHTML });
            }
          } else if (el.tagName === 'TABLE') {
            contentParts.push({ tag: 'table', text: el.textContent.trim(), html: el.outerHTML });
          } else if (el.tagName === 'LI') {
            const text = el.textContent.trim();
            if (text.length >= 15) {
              contentParts.push({ tag: 'li', text, html: el.innerHTML });
            }
          }
        }
      }

      sections.push({
        heading: {
          tag: heading.tagName.toLowerCase(),
          text: headingText,
          html: heading.innerHTML,
        },
        content: contentParts,
      });
    }

    return sections;
  });
}

// ─── Build HTML from sections ────────────────────────────────────────────────
function buildHtml(sections) {
  const parts = [];

  for (const section of sections) {
    const h = section.heading;
    // Skip headings with no content
    // (but always include H1)
    if (section.content.length === 0 && h.tag !== 'h1') continue;

    parts.push(`<${h.tag}>${h.html}</${h.tag}>`);

    let inList = false;
    for (const item of section.content) {
      if (item.tag === 'li') {
        if (!inList) { parts.push('<ul>'); inList = true; }
        parts.push(`<li>${item.html}</li>`);
      } else if (item.tag === 'table') {
        if (inList) { parts.push('</ul>'); inList = false; }
        parts.push(item.html);
      } else {
        if (inList) { parts.push('</ul>'); inList = false; }
        parts.push(`<p>${item.html}</p>`);
      }
    }
    if (inList) parts.push('</ul>');
  }

  return parts.join('\n');
}

// ─── Post-clean ──────────────────────────────────────────────────────────────
function postClean(html) {
  const $ = cheerio.load(html);
  $('p, li, span').each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim()) $el.remove();
  });
  return $('body').html() || '';
}

// ─── Main extraction ─────────────────────────────────────────────────────────
async function extractText(url) {
  if (!isValidUrl(url)) {
    const err = new Error('Invalid URL');
    err.status = 400;
    throw err;
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(randomUserAgent());
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media'].includes(type)) {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });

    // Try networkidle2 — if it times out, continue with whatever content loaded
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    } catch (navErr) {
      if (navErr.message && navErr.message.toLowerCase().includes('time')) {
        console.log('[NAV] networkidle2 timed out — continuing with loaded content...');
        // Page may still have usable content even if network is still active
      } else {
        throw navErr; // Re-throw non-timeout errors
      }
    }

    try {
      await page.waitForSelector('h1', { timeout: 5000 });
    } catch (e) {}

    // Scroll to trigger lazy content
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 80);
        setTimeout(() => { clearInterval(timer); resolve(); }, 4000);
      });
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    const title = await page.title();

    // ── STRICT HEADER-BASED EXTRACTION ──
    console.log('[STRATEGY] Strict header-based (sibling walk)');
    const sections = await extractByHeaders(page);

    // Log heading tree
    let totalItems = 0;
    sections.forEach(s => {
      const indent = '  '.repeat(parseInt(s.heading.tag[1]) - 1);
      const items = s.content.length;
      totalItems += items;
      console.log(`${indent}<${s.heading.tag.toUpperCase()}> ${s.heading.text.substring(0, 50)} [${items} items]`);
    });
    console.log(`[HEADERS] ${sections.length} headings, ${totalItems} content items`);

    let contentHtml = buildHtml(sections);

    // Fallback: Readability.js
    if (!contentHtml || contentHtml.trim().length < 200) {
      console.log('[STRATEGY] Fallback: Readability.js');
      const rawHtml = await page.content();
      const dom = new JSDOM(rawHtml, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article && article.content) {
        contentHtml = article.content;
      }
    }

    await browser.close();
    browser = null;

    if (!contentHtml || contentHtml.trim().length < 50) {
      const err = new Error('No meaningful content found on this page');
      err.status = 422;
      throw err;
    }

    const sanitized = sanitizeHtml(contentHtml, SANITIZE_CONFIG);
    const cleanHtml = postClean(sanitized);

    if (!cleanHtml || cleanHtml.trim().length < 30) {
      const err = new Error('No meaningful content found after filtering');
      err.status = 422;
      throw err;
    }

    const { wordCount, charCount } = countStats(cleanHtml);

    return {
      title: title || 'Untitled',
      html: cleanHtml,
      wordCount,
      charCount,
      sourceUrl: url,
    };

  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    if (err.status) throw err;
    if (err.message && (err.message.includes('timeout') || err.message.includes('net::ERR'))) {
      const timeoutErr = new Error(`Failed to load page: ${err.message}`);
      timeoutErr.status = 500;
      throw timeoutErr;
    }
    const serverErr = new Error(`Extraction failed: ${err.message}`);
    serverErr.status = 500;
    throw serverErr;
  }
}

module.exports = { extractText };
