import './WordCounter.css'

function formatNumber(n) {
  return n.toLocaleString('ru-RU')
}

export default function WordCounter({ wordCount, charCount }) {
  return (
    <div className="word-counter">
      <span className="word-counter-item">
        <span className="wc-label">Слов:</span>
        <span className="wc-value">{formatNumber(wordCount)}</span>
      </span>
      <span className="wc-dot">·</span>
      <span className="word-counter-item">
        <span className="wc-label">Знаков:</span>
        <span className="wc-value">{formatNumber(charCount)}</span>
      </span>
    </div>
  )
}
