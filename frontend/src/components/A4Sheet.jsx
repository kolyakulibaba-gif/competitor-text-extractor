import { useState, useEffect, useRef } from 'react'
import CopyButton from './CopyButton'
import EditorToolbar from './EditorToolbar'
import './A4Sheet.css'

const PLACEHOLDER_HTML = `
  <div class="sheet-placeholder">
    <div class="placeholder-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="16" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    </div>
    <p class="placeholder-title">Вставьте ссылку и нажмите «Извлечь»</p>
    <p class="placeholder-sub">Чистый текст страницы появится здесь в формате A4</p>
  </div>
`

export default function A4Sheet({ result, loading, sheetRef }) {
  const contentRef = sheetRef || useRef(null)
  const [editable, setEditable] = useState(false)

  // When result arrives, populate the editable area and enable editing
  useEffect(() => {
    if (result && contentRef.current) {
      contentRef.current.innerHTML = result.html
      setEditable(true)
    } else {
      setEditable(false)
    }
  }, [result])

  return (
    <div className="a4-container">
      {result && (
        <div className="a4-source-url">
          <span className="source-label">Источник:</span>
          <span className="source-url">{result.sourceUrl}</span>
        </div>
      )}

      {/* Editor toolbar — only visible when text is loaded */}
      <EditorToolbar visible={!!result && !loading} />

      <div className={`a4-wrapper ${result ? 'a4-wrapper--has-toolbar' : ''}`}>
        {result && <CopyButton contentRef={contentRef} />}

        <div
          ref={contentRef}
          className={`a4-sheet ${loading ? 'a4-loading' : ''} ${editable ? 'a4-editable' : ''}`}
          dir="auto"
          contentEditable={editable}
          suppressContentEditableWarning
          spellCheck={false}
          dangerouslySetInnerHTML={
            !result ? { __html: PLACEHOLDER_HTML } : undefined
          }
        />
      </div>
    </div>
  )
}
