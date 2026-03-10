import { useCallback } from 'react'
import './EditorToolbar.css'

// ── Toolbar button definitions ──
// Each group is separated by a divider
const TOOL_GROUPS = [
  [
    { cmd: 'formatBlock', val: 'P', label: '¶', title: 'Параграф' },
    { cmd: 'formatBlock', val: 'H1', label: 'H1', title: 'Заголовок 1' },
    { cmd: 'formatBlock', val: 'H2', label: 'H2', title: 'Заголовок 2' },
    { cmd: 'formatBlock', val: 'H3', label: 'H3', title: 'Заголовок 3' },
    { cmd: 'formatBlock', val: 'H4', label: 'H4', title: 'Заголовок 4' },
  ],
  [
    { cmd: 'bold', icon: 'bold', title: 'Жирный (Cmd+B)' },
    { cmd: 'italic', icon: 'italic', title: 'Курсив (Cmd+I)' },
    { cmd: 'underline', icon: 'underline', title: 'Подчеркнутый (Cmd+U)' },
    { cmd: 'strikeThrough', icon: 'strikethrough', title: 'Зачёркнутый' },
  ],
  [
    { cmd: 'justifyLeft', icon: 'align-left', title: 'По левому краю' },
    { cmd: 'justifyCenter', icon: 'align-center', title: 'По центру' },
    { cmd: 'justifyRight', icon: 'align-right', title: 'По правому краю' },
  ],
  [
    { cmd: 'insertUnorderedList', icon: 'list-ul', title: 'Маркированный список' },
    { cmd: 'insertOrderedList', icon: 'list-ol', title: 'Нумерованный список' },
  ],
  [
    { cmd: 'indent', icon: 'indent', title: 'Увеличить отступ' },
    { cmd: 'outdent', icon: 'outdent', title: 'Уменьшить отступ' },
  ],
  [
    { cmd: 'undo', icon: 'undo', title: 'Отменить (Cmd+Z)' },
    { cmd: 'redo', icon: 'redo', title: 'Повторить (Cmd+Shift+Z)' },
  ],
  [
    { cmd: 'removeFormat', icon: 'eraser', title: 'Очистить форматирование' },
  ],
]

// ── SVG Icons ──
function Icon({ name }) {
  const icons = {
    bold: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
      </svg>
    ),
    italic: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
      </svg>
    ),
    underline: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>
      </svg>
    ),
    strikethrough: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 4H9a3 3 0 0 0 0 6h"/><path d="M8 20h7a3 3 0 1 0 0-6h"/><line x1="4" y1="12" x2="20" y2="12"/>
      </svg>
    ),
    'align-left': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
      </svg>
    ),
    'align-center': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
      </svg>
    ),
    'align-right': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
      </svg>
    ),
    'list-ul': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
        <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="18" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
    'list-ol': (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/>
        <text x="4" y="8" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">1</text>
        <text x="4" y="14" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">2</text>
        <text x="4" y="20" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">3</text>
      </svg>
    ),
    indent: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="3" y1="4" x2="21" y2="4"/><line x1="11" y1="10" x2="21" y2="10"/><line x1="11" y1="16" x2="21" y2="16"/><line x1="3" y1="22" x2="21" y2="22"/>
        <polyline points="3 14 7 12 3 10"/>
      </svg>
    ),
    outdent: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="3" y1="4" x2="21" y2="4"/><line x1="11" y1="10" x2="21" y2="10"/><line x1="11" y1="16" x2="21" y2="16"/><line x1="3" y1="22" x2="21" y2="22"/>
        <polyline points="7 10 3 12 7 14"/>
      </svg>
    ),
    undo: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
      </svg>
    ),
    redo: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
      </svg>
    ),
    eraser: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16l9.5-9.5 8 8-4 4"/><line x1="18" y1="13" x2="11" y2="6"/>
      </svg>
    ),
  }
  return <span className="toolbar-icon">{icons[name] || null}</span>
}

export default function EditorToolbar({ visible }) {
  const execCommand = useCallback((cmd, val) => {
    document.execCommand(cmd, false, val || null)
  }, [])

  if (!visible) return null

  return (
    <div className="editor-toolbar">
      {TOOL_GROUPS.map((group, gi) => (
        <div className="toolbar-group" key={gi}>
          {group.map((btn, bi) => (
            <button
              key={bi}
              className="toolbar-btn"
              title={btn.title}
              onMouseDown={(e) => {
                e.preventDefault() // keep focus in the editable area
                execCommand(btn.cmd, btn.val)
              }}
            >
              {btn.icon ? <Icon name={btn.icon} /> : <span className="toolbar-label">{btn.label}</span>}
            </button>
          ))}
          {gi < TOOL_GROUPS.length - 1 && <div className="toolbar-divider" />}
        </div>
      ))}
    </div>
  )
}
