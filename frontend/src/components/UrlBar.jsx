import { useRef, useState } from 'react'
import './UrlBar.css'

export default function UrlBar({ url, setUrl, onExtract, onClear, loading, hasResult }) {
  const inputRef = useRef(null)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      onExtract(url)
    }
  }

  return (
    <div className="url-bar-wrapper">
      <div className="url-bar">
        <span className="url-bar-label">URL</span>
        <input
          ref={inputRef}
          className="url-bar-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Вставьте ссылку на страницу конкурента..."
          autoFocus
          disabled={loading}
          spellCheck={false}
          autoComplete="off"
        />

        {hasResult && !loading && (
          <button className="url-bar-clear" onClick={onClear} title="Очистить">
            ✕
          </button>
        )}

        <button
          className={`url-bar-btn ${loading ? 'loading' : ''}`}
          onClick={() => onExtract(url)}
          disabled={loading || !url.trim()}
        >
          {loading ? (
            <span className="spinner" />
          ) : (
            <>Извлечь <span className="btn-arrow">→</span></>
          )}
        </button>
      </div>
    </div>
  )
}
