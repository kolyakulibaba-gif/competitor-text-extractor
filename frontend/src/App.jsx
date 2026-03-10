import { useState, useRef } from 'react'
import './App.css'
import ProgressBar from './components/ProgressBar'
import UrlBar from './components/UrlBar'
import A4Sheet from './components/A4Sheet'
import WordCounter from './components/WordCounter'
import ErrorToast from './components/ErrorToast'
import SplitView from './components/SplitView'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

export default function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)   // { title, html, wordCount, charCount, sourceUrl }
  const [error, setError] = useState(null)
  const [splitMode, setSplitMode] = useState(false)
  const sheetRef = useRef(null)

  const handleExtract = async (targetUrl) => {
    const trimmed = (targetUrl || url).trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setResult(null)
    setSplitMode(false)

    try {
      const resp = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })

      const data = await resp.json()

      if (!resp.ok) {
        throw new Error(data.error || `Server error ${resp.status}`)
      }

      setResult(data)
      // Automatically enter split mode when result arrives
      setSplitMode(true)
    } catch (err) {
      setError(err.message || 'Failed to extract text')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setUrl('')
    setResult(null)
    setError(null)
    setSplitMode(false)
  }

  const handleCloseSplit = () => {
    setSplitMode(false)
  }

  const handleOpenSplit = () => {
    if (result) {
      setSplitMode(true)
    }
  }

  return (
    <div className={`app ${splitMode ? 'app--split' : ''}`}>
      <ProgressBar active={loading} />

      <header className="app-header">
        <div className="app-header-logo">Competitor Text Extractor</div>
        <div className="app-header-right">
          {result && !splitMode && (
            <button className="split-toggle-btn" onClick={handleOpenSplit} title="Сравнить с оригиналом">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="12" y1="3" x2="12" y2="21"/>
              </svg>
              Сравнить
            </button>
          )}
          <div className="app-header-meta">v1.0 · Semantic Content Tool</div>
        </div>
      </header>

      <main className={`app-main ${splitMode ? 'app-main--split' : ''}`}>
        <UrlBar
          url={url}
          setUrl={setUrl}
          onExtract={handleExtract}
          onClear={handleClear}
          loading={loading}
          hasResult={!!result}
        />

        {error && (
          <ErrorToast message={error} onDismiss={() => setError(null)} />
        )}

        {splitMode && result ? (
          <SplitView
            result={result}
            sourceUrl={result.sourceUrl}
            onClose={handleCloseSplit}
          />
        ) : (
          <>
            <A4Sheet result={result} loading={loading} sheetRef={sheetRef} />

            {result && (
              <WordCounter wordCount={result.wordCount} charCount={result.charCount} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
