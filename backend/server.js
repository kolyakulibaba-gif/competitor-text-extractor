const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const path = require('path');
const { extractText } = require('./extractor');

// ── Prevent Puppeteer crashes from killing the server ──
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Server continues running:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION] Server continues running:', reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory cache (TTL = 5 minutes)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:4173', /\.netlify\.app$/, /\.vercel\.app$/],
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting — 10 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute before trying again.' },
});
app.use('/api/', limiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main extraction endpoint
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  const trimmedUrl = url.trim();

  // Check cache
  const cached = cache.get(trimmedUrl);
  if (cached) {
    console.log(`[CACHE HIT] ${trimmedUrl}`);
    return res.json({ ...cached, cached: true });
  }

  console.log(`[EXTRACT] ${trimmedUrl}`);
  const startTime = Date.now();

  try {
    const result = await extractText(trimmedUrl);
    const elapsed = Date.now() - startTime;
    console.log(`[DONE] ${trimmedUrl} — ${elapsed}ms, ${result.wordCount} words`);

    // Store in cache
    cache.set(trimmedUrl, result);

    return res.json(result);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const status = err.status || 500;
    console.error(`[ERROR ${status}] ${trimmedUrl} — ${elapsed}ms — ${err.message}`);
    return res.status(status).json({ error: err.message || 'Internal server error' });
  }
});

// ── Proxy endpoint — load site HTML for iframe preview ──
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL query parameter is required' });
  }

  const trimmedUrl = url.trim();

  try {
    const parsedUrl = new URL(trimmedUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Use global stealth-enabled puppeteer instance
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    try {
      await page.goto(trimmedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (navErr) {
      if (navErr.message && navErr.message.toLowerCase().includes('time')) {
        console.warn(`[PROXY] Timeout navigating to ${trimmedUrl}, continuing with loaded content...`);
      } else {
        throw navErr;
      }
    }    // Wait for content to settle
    await new Promise(r => setTimeout(r, 1000));

    let html = await page.content();
    await browser.close();

    // Inject <base> tag so relative URLs resolve correctly
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head><base href="${baseUrl}/">`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD><base href="${baseUrl}/">`);
    } else {
      html = `<base href="${baseUrl}/">\n` + html;
    }

    // Inject a script to enable heading-based sync scroll with parent window
    const syncScript = `
      <script>
        // Normalize heading text for matching (lowercase, trim, collapse whitespace)
        function normalizeText(text) {
          return (text || '').toLowerCase().replace(/\\s+/g, ' ').trim().substring(0, 100);
        }

        // Build a map of headings on the page
        function getHeadings() {
          return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        }

        // Listen for scroll commands from parent
        window.addEventListener('message', function(event) {
          if (!event.data) return;

          // Heading-based scroll: find and scroll to matching heading
          if (event.data.type === 'scrollToHeading') {
            var targetText = normalizeText(event.data.headingText);
            var targetTag = (event.data.headingTag || '').toLowerCase();
            var headings = getHeadings();
            var bestMatch = null;
            var bestScore = 0;

            for (var i = 0; i < headings.length; i++) {
              var h = headings[i];
              var hText = normalizeText(h.textContent);
              var hTag = h.tagName.toLowerCase();

              // Exact text + tag match
              if (hText === targetText && hTag === targetTag) {
                bestMatch = h;
                break;
              }

              // Partial text match (heading text starts with or contains target)
              if (hText.includes(targetText) || targetText.includes(hText)) {
                var score = Math.min(hText.length, targetText.length) / Math.max(hText.length, targetText.length);
                if (hTag === targetTag) score += 0.3;
                if (score > bestScore) {
                  bestScore = score;
                  bestMatch = h;
                }
              }
            }

            if (bestMatch) {
              bestMatch.scrollIntoView({ behavior: 'smooth', block: 'start' });
              // Brief highlight
              var origBg = bestMatch.style.backgroundColor;
              bestMatch.style.backgroundColor = 'rgba(34, 196, 126, 0.15)';
              bestMatch.style.transition = 'background-color 0.3s ease';
              setTimeout(function() {
                bestMatch.style.backgroundColor = origBg || '';
              }, 1500);
            }
          }

          // Fallback ratio-based scroll
          if (event.data.type === 'syncScroll') {
            var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            var targetScroll = event.data.scrollRatio * maxScroll;
            window.scrollTo({ top: targetScroll, behavior: 'auto' });
          }
        });

        // Report visible headings to parent on scroll
        var lastReportedHeading = '';
        var scrollTimeout = null;
        window.addEventListener('scroll', function() {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(function() {
            var headings = getHeadings();
            var viewportTop = window.scrollY + 80;
            var closest = null;
            var closestDist = Infinity;

            for (var i = 0; i < headings.length; i++) {
              var rect = headings[i].getBoundingClientRect();
              var absTop = rect.top + window.scrollY;
              var dist = Math.abs(absTop - viewportTop);
              if (absTop <= viewportTop + 200 && dist < closestDist) {
                closestDist = dist;
                closest = headings[i];
              }
            }

            if (closest) {
              var headingId = normalizeText(closest.textContent);
              if (headingId !== lastReportedHeading) {
                lastReportedHeading = headingId;
                window.parent.postMessage({
                  type: 'iframeHeadingVisible',
                  headingText: closest.textContent.trim(),
                  headingTag: closest.tagName.toLowerCase()
                }, '*');
              }
            }
          }, 100);
        });
      </script>
    `;

    // Inject the sync script before </body>
    if (html.includes('</body>')) {
      html = html.replace('</body>', syncScript + '</body>');
    } else if (html.includes('</BODY>')) {
      html = html.replace('</BODY>', syncScript + '</BODY>');
    } else {
      html += syncScript;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.send(html);

  } catch (err) {
    console.error('[PROXY ERROR]', err.message);
    res.status(500).json({ error: `Failed to load page: ${err.message}` });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Serve Production Frontend ──
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
