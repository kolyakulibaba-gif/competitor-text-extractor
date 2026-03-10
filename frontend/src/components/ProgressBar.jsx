import './ProgressBar.css'

export default function ProgressBar({ active }) {
  return (
    <div className={`progress-bar-track ${active ? 'active' : ''}`}>
      <div className="progress-bar-fill" />
    </div>
  )
}
