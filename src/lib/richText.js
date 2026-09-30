// src/lib/richText.js
// Minimal, safe **bold** / *italic* text formatting for user-generated
// content — calendar event descriptions, blog posts, and comments.
//
// Deliberately NOT a full markdown parser: just the two markers a Bold/
// Italic toolbar button inserts. Everything else in the text is escaped
// before the markers are applied, then run through DOMPurify with a tiny
// allow-list, so user text can never inject arbitrary HTML. Existing text
// with no ** or * in it renders exactly as it always has.
//
// Keith, 2026-09-30: added after residents asked for basic bold/italic on
// calendar/blog posts and comments — see REQUIREMENTS.md.

import DOMPurify from 'dompurify'

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert **bold** and *italic* markers in plain text into sanitized HTML.
 * @param {string} text - raw text as stored in the database
 * @returns {string} sanitized HTML, safe to pass to dangerouslySetInnerHTML
 */
export function formatUserText(text) {
  if (!text) return ''
  let html = escapeHtml(text)
  // Bold first, so **x** isn't consumed as two separate *…* italics.
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em'] })
}

/**
 * Wrap the current <textarea> selection in marker characters (or insert a
 * placeholder wrapped in markers, if nothing's selected) — used by the
 * Bold/Italic toolbar buttons. Doesn't touch the DOM or React state itself;
 * the caller applies newValue and restores the selection.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} marker - '**' for bold, '*' for italic
 * @returns {{newValue: string, selStart: number, selEnd: number}}
 */
export function wrapSelection(textarea, marker) {
  const { value, selectionStart, selectionEnd } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  const placeholder = selected || 'text'
  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)
  const newValue = `${before}${marker}${placeholder}${marker}${after}`
  const selStart = selectionStart + marker.length
  const selEnd = selStart + placeholder.length
  return { newValue, selStart, selEnd }
}
