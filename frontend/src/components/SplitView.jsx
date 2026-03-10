import { useState, useRef, useEffect, useCallback } from 'react'
import EditorToolbar from './EditorToolbar'
import './SplitView.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

export default function SplitView({ result, sourceUrl, onClose }) {
  const leftPanelRef = useRef(null)
  const contentRef = useRef(null)
  const iframeRef = useRef(null)
  const resizerRef = useRef(null)
  const splitViewRef = useRef(null)
  const leftPanelContainerRef = useRef(null)
  const rightPanelContainerRef = useRef(null)

  const [syncScroll, setSyncScroll] = useState(true)
  const [iframeLoading, setIframeLoading] = useState(true)
  const [isResizing, setIsResizing] = useState(false)
  const [activeHeading, setActiveHeading] = useState(null)
  const [iframeError, setIframeError] = useState(false)

  // Store width in ref to avoid re-renders during drag
  const leftWidthRef = useRef(50)

  // Track last synced heading to avoid duplicate sends
  const lastSyncedHeadingRef = useRef('')
  const isScrollingSyncRef = useRef(false)

  // Populate content when result changes
  useEffect(() => {
    if (result && contentRef.current) {
      contentRef.current.innerHTML = result.html
    }
  }, [result])

  // ── Timeout: if iframe doesn't load within 20s, show error ──
  useEffect(() => {
    if (!iframeLoading || iframeError) return
    const timer = setTimeout(() => {
      if (iframeLoading) {
        console.warn('[SPLIT] Iframe load timeout — showing text-only fallback')
        setIframeError(true)
        setIframeLoading(false)
      }
    }, 20000)
    return () => clearTimeout(timer)
  }, [iframeLoading, iframeError])

  // ── Heading-based sync: detect which heading is visible in left panel ──
  useEffect(() => {
    if (!syncScroll || !contentRef.current) return

    const headings = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first heading that is intersecting (visible)
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const headingText = entry.target.textContent.trim()
            const headingTag = entry.target.tagName.toLowerCase()

            setActiveHeading(headingText)

            // Only send if this is a new heading
            if (headingText !== lastSyncedHeadingRef.current && !isScrollingSyncRef.current) {
              lastSyncedHeadingRef.current = headingText

              // Send to iframe
              try {
                if (iframeRef.current && iframeRef.current.contentWindow) {
                  iframeRef.current.contentWindow.postMessage(
                    { type: 'scrollToHeading', headingText, headingTag },
                    '*'
                  )
                }
              } catch (e) {
                // cross-origin - ignore
              }
            }
            break
          }
        }
      },
      {
        root: leftPanelRef.current,
        rootMargin: '-10% 0px -70% 0px', // Trigger when heading is near top 30% of panel
        threshold: 0
      }
    )

    headings.forEach(h => observer.observe(h))

    return () => observer.disconnect()
  }, [syncScroll, result])

  // ── Sync from iframe -> left panel (when user scrolls iframe) ──
  useEffect(() => {
    const handleMessage = (event) => {
      if (!syncScroll || isScrollingSyncRef.current) return
      if (!event.data || event.data.type !== 'iframeHeadingVisible') return
      if (!contentRef.current) return

      const targetText = event.data.headingText.trim().toLowerCase()
      if (!targetText) return

      // Don't re-sync if we just synced this heading
      if (targetText === lastSyncedHeadingRef.current?.toLowerCase()) return

      isScrollingSyncRef.current = true

      // Find matching heading in left panel
      const headings = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
      let bestMatch = null
      
      for (const h of headings) {
        const hText = h.textContent.trim().toLowerCase()
        if (hText === targetText) {
          bestMatch = h
          break
        }
        // Partial match
        if (hText.includes(targetText) || targetText.includes(hText)) {
          bestMatch = h
        }
      }

      if (bestMatch && leftPanelRef.current) {
        bestMatch.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActiveHeading(bestMatch.textContent.trim())
        lastSyncedHeadingRef.current = bestMatch.textContent.trim()
      }

      setTimeout(() => { isScrollingSyncRef.current = false }, 500)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [syncScroll])

  // ── Resizer drag — direct DOM manipulation for zero lag ──
  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    setIsResizing(true)

    const startX = e.clientX
    const startWidth = leftWidthRef.current
    const container = splitViewRef.current
    if (!container) return
    const containerWidth = container.getBoundingClientRect().width

    // Disable pointer events on iframe during drag (prevents it from stealing mouse)
    if (iframeRef.current) {
      iframeRef.current.style.pointerEvents = 'none'
    }

    let rafId = null

    const handleMouseMove = (moveEvent) => {
      // Cancel previous frame to avoid stacking
      if (rafId) cancelAnimationFrame(rafId)

      rafId = requestAnimationFrame(() => {
        const delta = moveEvent.clientX - startX
        const newWidth = Math.max(20, Math.min(80, startWidth + (delta / containerWidth) * 100))
        leftWidthRef.current = newWidth

        // Direct DOM update — no React re-render
        if (leftPanelContainerRef.current) {
          leftPanelContainerRef.current.style.flex = `0 0 ${newWidth}%`
        }
        if (rightPanelContainerRef.current) {
          rightPanelContainerRef.current.style.flex = `0 0 ${100 - newWidth}%`
        }
      })
    }

    const handleMouseUp = () => {
      if (rafId) cancelAnimationFrame(rafId)
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      // Re-enable iframe pointer events
      if (iframeRef.current) {
        iframeRef.current.style.pointerEvents = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // Build proxy URL for iframe
  const proxyUrl = sourceUrl
    ? `${API_URL}/api/proxy?url=${encodeURIComponent(sourceUrl)}`
    : ''

  return (
    <div className="split-view" ref={splitViewRef}>
      {/* ── LEFT PANEL: Extracted text ── */}
      <div
        ref={leftPanelContainerRef}
        className="split-panel split-panel--left"
        style={{ flex: `0 0 ${leftWidthRef.current}%` }}
      >
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-title-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </span>
            Извлечённый текст
            {result && <span className="panel-badge">{result.wordCount} слов</span>}
          </div>
          <div className="panel-actions">
            <button
              className="panel-action-btn"
              title="Скопировать весь текст"
              onClick={() => {
                if (contentRef.current) {
                  const selection = window.getSelection()
                  const range = document.createRange()
                  range.selectNodeContents(contentRef.current)
                  selection.removeAllRanges()
                  selection.addRange(range)
                  document.execCommand('copy')
                  selection.removeAllRanges()
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Копировать
            </button>
            <button className="close-split-btn" onClick={onClose} title="Закрыть сравнение">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Закрыть
            </button>
          </div>
        </div>

        {/* Editor toolbar */}
        <EditorToolbar visible={!!result} />

        {/* Active heading indicator */}
        {activeHeading && syncScroll && (
          <div className="active-heading-bar">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="active-heading-text">{activeHeading}</span>
          </div>
        )}

        <div
          ref={leftPanelRef}
          className="split-content-left"
        >
          <div
            ref={contentRef}
            className="split-a4-sheet"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            dir="auto"
          />
        </div>
      </div>

      {/* ── RESIZER ── */}
      <div
        ref={resizerRef}
        className={`split-resizer ${isResizing ? 'active' : ''}`}
        onMouseDown={handleResizeStart}
      />

      {/* ── RIGHT PANEL: Website preview ── */}
      <div
        ref={rightPanelContainerRef}
        className="split-panel split-panel--right"
        style={{ flex: `0 0 ${100 - leftWidthRef.current}%` }}
      >
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-title-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </span>
            Оригинал сайта
          </div>
          <div className="panel-actions">
            <div className="sync-toggle" onClick={() => setSyncScroll(!syncScroll)}>
              <span className="sync-toggle-label">
                {syncScroll ? '🔗 Привязка к заголовкам' : 'Синхр. скролл'}
              </span>
              <div className={`sync-toggle-switch ${syncScroll ? 'active' : ''}`} />
            </div>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="panel-action-btn"
              title="Открыть в новой вкладке"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>

        <div className="split-iframe-container">
          {iframeLoading && !iframeError && (
            <div className="split-iframe-loading">
              <div className="split-iframe-spinner" />
              <span className="split-iframe-text">Загрузка сайта...</span>
            </div>
          )}

          {iframeError ? (
            <div className="split-iframe-error">
              <div className="split-iframe-error-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3 className="split-iframe-error-title">Не удалось загрузить сайт</h3>
              <p className="split-iframe-error-text">
                Сайт заблокировал отображение или произошла ошибка при загрузке.
                Вы по-прежнему можете работать с извлечённым текстом слева.
              </p>
              <div className="split-iframe-error-actions">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="split-iframe-error-btn"
                >
                  Открыть сайт в новой вкладке ↗
                </a>
                <button className="split-iframe-error-btn split-iframe-error-btn--secondary" onClick={onClose}>
                  Показать только текст
                </button>
              </div>
            </div>
          ) : (
            proxyUrl && (
              <iframe
                ref={iframeRef}
                className="split-iframe"
                src={proxyUrl}
                onLoad={() => {
                  setIframeLoading(false)
                  setIframeError(false)
                }}
                onError={() => {
                  setIframeLoading(false)
                  setIframeError(true)
                }}
                sandbox="allow-scripts allow-same-origin allow-popups"
                title="Превью сайта"
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
