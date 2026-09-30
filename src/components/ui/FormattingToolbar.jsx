// src/components/ui/FormattingToolbar.jsx
// Small Bold/Italic toolbar for a <textarea>. Wraps the current selection in
// ** or * markers (see src/lib/richText.js's wrapSelection) — the textarea
// keeps storing plain text with those markers in it; formatUserText() turns
// them into real <strong>/<em> wherever the text is displayed.
//
// Usage: give it the textarea's ref plus its onChange setter. It doesn't
// hold any state of its own.

import { wrapSelection } from '@/lib/richText'

export function FormattingToolbar({ textareaRef, onChange }) {
  const apply = marker => {
    const el = textareaRef.current
    if (!el) return
    const { newValue, selStart, selEnd } = wrapSelection(el, marker)
    onChange(newValue)
    // The textarea's value updates on React's next render; wait a tick
    // before restoring focus/selection so it lands in the right place.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selStart, selEnd)
    })
  }

  return (
    <div className="flex gap-1 mb-1">
      <button
        type="button"
        onClick={() => apply('**')}
        title="Bold"
        aria-label="Bold"
        className="w-6 h-6 flex items-center justify-center text-xs font-bold border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => apply('*')}
        title="Italic"
        aria-label="Italic"
        className="w-6 h-6 flex items-center justify-center text-xs italic border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
      >
        I
      </button>
    </div>
  )
}
