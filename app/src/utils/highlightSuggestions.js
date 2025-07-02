function splitWords(text) {
  return text.split(/(\s+)/)
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

  // 构建每个非空白word的高亮范围
  const markMap = new Array(words.length).fill(null)
  for (const action of result.actions) {
    // action.start/end是非空白word的索引
    let curIdx = 0
    for (let i = 0; i < words.length; ++i) {
      if (/^\s+$/.test(words[i])) continue
      if (curIdx >= action.start && curIdx < action.end) {
        markMap[i] = action
      }
      curIdx++
    }
  }
  let html = ''
  for (let i = 0; i < words.length; ++i) {
    if (markMap[i]) {
      html += `<span class="suggestion" data-action='${JSON.stringify(markMap[i])}'>${escapeHtml(words[i])}</span>`
    } else {
      html += escapeHtml(words[i])
    }
  }
  node.innerHTML = html
}