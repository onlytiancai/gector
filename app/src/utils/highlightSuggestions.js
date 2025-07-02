function splitWords(text) {
  return text.split(/(\s+)/)
}

function buildWordRanges(words) {
  let charIndex = 0
  return words.map(w => {
    const start = charIndex
    charIndex += w.length
    return { word: w, start, end: charIndex }
  })
}

function findMarkRanges(actions, wordRanges) {
  const markRanges = []
  for (const action of actions) {
    if (typeof action.start === 'number' && typeof action.end === 'number') {
      let acc = 0
      let startIdx = -1, endIdx = -1
      for (let i = 0; i < wordRanges.length; ++i) {
        if (acc === action.start) startIdx = i
        if (acc + wordRanges[i].word.length === action.end) {
          endIdx = i
          break
        }
        acc += wordRanges[i].word.length
      }
      if (startIdx !== -1 && endIdx !== -1) {
        markRanges.push({ start: startIdx, end: endIdx, action })
      }
    }
  }
  return markRanges
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function (m) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]
  })
}

function unwrapSuggestions(node) {
  if (!node) return
  const spans = node.querySelectorAll('span.suggestion')
  spans.forEach(span => {
    const text = span.textContent
    span.replaceWith(document.createTextNode(text))
  })
}

export function highlightSuggestions(node, result) {
  if (!result || !result.actions || !Array.isArray(result.actions)) return
  unwrapSuggestions(node)
  const text = node.textContent
  const words = splitWords(text)
  const wordRanges = buildWordRanges(words)
  console.log('[highlightSuggestions] text:', text)
  console.log('[highlightSuggestions] result.actions:', result.actions)
  console.log('[highlightSuggestions] words:', words)
  console.log('[highlightSuggestions] wordRanges:', wordRanges)
  const markRanges = findMarkRanges(result.actions, wordRanges)
  console.log('[highlightSuggestions] markRanges:', markRanges)
  let html = ''
  for (let i = 0; i < wordRanges.length; ++i) {
    const mark = markRanges.find(r => i >= r.start && i <= r.end)
    if (mark) {
      html += `<span class="suggestion" data-action='${JSON.stringify(mark.action)}'>${escapeHtml(wordRanges[i].word)}</span>`
    } else {
      html += escapeHtml(wordRanges[i].word)
    }
  }
  node.innerHTML = html
}
