<template>
  <div class="editor-area">
    <div
      class="editor"
      contenteditable="true"
      spellcheck="false"
      ref="editor"
      v-html="editorHtml"
      @input="onInput"
      @keydown.enter.stop
      @click="onEditorClick"
    ></div>
    <button @click="logLeafBlockNodes">打印最内层块节点文本</button>
    <!-- 语法检测按钮浮层 -->
    <div
      v-if="selectedNode && buttonPosition"
      class="syntax-btn"
      :style="{ top: buttonPosition.top + 'px', left: buttonPosition.left + 'px' }"
      @mousedown.prevent.stop
      @click="onSyntaxCheckClick"
    >
      <Icon :icon="spellcheckIcon" width="22" height="22" />
    </div>
  </div>
</template>

<script setup>
import { watch, onMounted, nextTick, ref } from 'vue'
// 引入Iconify组件和图标
import { Icon } from '@iconify/vue'
import spellcheckIcon from '@iconify-icons/mdi/spellcheck'

const props = defineProps({
  editorHtml: String,
})
const emits = defineEmits(['input', 'editorClick'])
const editor = ref(null)

function getCaretCharacterOffsetWithin(element) {
  let caretOffset = 0
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(element)
    preCaretRange.setEnd(range.endContainer, range.endOffset)
    caretOffset = preCaretRange.toString().length
  }
  return caretOffset
}

function logCaretPosition() {
  const el = editor.value
  if (!el) {
    console.warn('Editor element not found')
    return
  }
  
  const offset = getCaretCharacterOffsetWithin(el)
  console.log('Caret character offset:', offset)
}

const selectedNode = ref(null)
const buttonPosition = ref(null)

function isLeafBlockNode(node) {
  // 判断 node 是否为 div/p/li，且没有子 div/p/li
  if (!node || !['DIV', 'P', 'LI'].includes(node.nodeName)) return false
  for (let child of node.childNodes) {
    if (child.nodeType === 1 && ['DIV', 'P', 'LI'].includes(child.nodeName)) {
      return false
    }
  }
  return true
}

function getLeafBlockNodes(root) {
  const result = []
  function traverse(node) {
    if (isLeafBlockNode(node)) {
      result.push(node)
      return
    }
    for (let child of node.childNodes) {
      if (child.nodeType === 1) {
        traverse(child)
      }
    }
  }
  traverse(root)
  return result
}

function logLeafBlockNodes() {
  const el = editor.value
  if (!el) {
    console.warn('Editor element not found')
    return
  }
  const leafNodes = getLeafBlockNodes(el)
  leafNodes.forEach(node => {
    console.log(`[${node.nodeName}]`, node.textContent.trim())
  })
}

function highlightNode(node) {
  // 移除之前的高亮
  if (selectedNode.value && selectedNode.value !== node) {
    selectedNode.value.classList.remove('highlight-block')
  }
  selectedNode.value = node
  if (node) {
    node.classList.add('highlight-block')
    // 计算按钮位置
    const rect = node.getBoundingClientRect()
    const editorRect = editor.value.getBoundingClientRect()
    // 按钮定位在块左侧
    buttonPosition.value = {
      top: rect.top - editorRect.top + editor.value.scrollTop,
      left: rect.left - editorRect.left - 36 + editor.value.scrollLeft // 36px 左侧偏移
    }
  } else {
    buttonPosition.value = null
  }
}

function clearHighlight() {
  if (selectedNode.value) {
    selectedNode.value.classList.remove('highlight-block')
    selectedNode.value = null
    buttonPosition.value = null
  }
}

function onEditorClick(e) {
  //emits('editorClick', e)
  //logCaretPosition()
  // 判断是否点击在块节点上
  let node = e.target
  while (node && node !== editor.value) {
    if (isLeafBlockNode(node)) {
      highlightNode(node)
      logNodeCache(node)
      return
    }
    node = node.parentNode
  }
  // 判断是否点击在 suggestion 上
  let target = e.target
  if (target.classList && target.classList.contains('suggestion')) {
    const action = target.getAttribute('data-action')
    if (action) {
      try {
        console.log('单词action:', JSON.parse(action))
      } catch {
        console.log('单词action:', action)
      }
    }
    // 不再高亮块
    return
  }
  clearHighlight()
}

function logNodeCache(node) {
   console.log(nodeCache.get(node))
}
const nodeCache = new WeakMap() // 缓存每个node的{ text, result }
const editTimers = new WeakMap()

async function fetchSyntaxCheck(sentText) {
  const resp = await fetch('/api/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence: sentText })
  })
  return await resp.json()
}

function getNodeCache(node) {
  return nodeCache.get(node)
}

function setNodeCache(node, text, result) {
  nodeCache.set(node, { text, result })
}


function onSyntaxCheckClick() {
  if (selectedNode.value) {
    console.log('语法检测:', selectedNode.value.textContent.trim())
  }
}


async function updateNodeSyntaxCache(node) {
  if (!node) return
  const text = node.textContent.trim()
  // 若缓存内容一致则不请求
  const cache = getNodeCache(node)
  if (cache && cache.text === text) return
  try {
    const result = await fetchSyntaxCheck(text)
    setNodeCache(node, text, result)
    highlightSuggestions(node, result)
  } catch (e) {
    setNodeCache(node, text, { error: e })
  }
}

// 高亮建议单词
function highlightSuggestions(node, result) {
  if (!result || !result.actions || !Array.isArray(result.actions)) return
  // 先移除已有的 suggestion span
  unwrapSuggestions(node)
  // 分词（简单按空格分，适用于英文）
  const text = node.textContent
  const words = text.split(/(\s+)/) // 保留空格分隔
  // 构建每个字符的起止索引
  let charIndex = 0
  const wordRanges = words.map(w => {
    const start = charIndex
    charIndex += w.length
    return { word: w, start, end: charIndex }
  })
  // 标记需要高亮的范围
  const markRanges = []
  for (const action of result.actions) {
    if (typeof action.start === 'number' && typeof action.end === 'number') {
      // 找到对应的字符范围
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
  // 重新构建HTML
  let html = ''
  for (let i = 0; i < wordRanges.length; ++i) {
    const mark = markRanges.find(r => i >= r.start && i <= r.end)
    if (mark) {
      // 用span包裹，带上action数据
      html += `<span class="suggestion" data-action='${JSON.stringify(mark.action)}'>${escapeHtml(wordRanges[i].word)}</span>`
    } else {
      html += escapeHtml(wordRanges[i].word)
    }
  }
  node.innerHTML = html
}

// 移除已有的 suggestion span
function unwrapSuggestions(node) {
  if (!node) return
  // 只处理直接子节点
  const spans = node.querySelectorAll('span.suggestion')
  spans.forEach(span => {
    // 替换为纯文本节点
    const text = span.textContent
    span.replaceWith(document.createTextNode(text))
  })
}

// 简单HTML转义
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

function debounceLeafNodeChange(node) {
  if (!node) return
  if (editTimers.has(node)) {
    clearTimeout(editTimers.get(node))
  }
  const timer = setTimeout(() => {
    console.log('叶子块节点内容变化:', node.textContent.trim())
    updateNodeSyntaxCache(node)
    editTimers.delete(node)
  }, 1000)
  editTimers.set(node, timer)
}

function onInput(e) {
  //emits('input', e)
  //logCaretPosition()
  // 输入时清除高亮
  clearHighlight()
  let sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  let node = sel.anchorNode
  while (node && node !== editor.value) {
    if (isLeafBlockNode(node)) {
      debounceLeafNodeChange(node)
      break
    }
    node = node.parentNode
  }
}
onMounted(() => {
  console.log('onMounted editor.value:', editor.value)
  watch(() => props.editorHtml, () => {
    console.log('Editor HTML updated:', props.editorHtml)
  })
  // 滚动时同步按钮位置
  editor.value.addEventListener('scroll', () => {
    if (selectedNode.value) highlightNode(selectedNode.value)
  })
})
</script>
<style>
.editor-area .editor .suggestion {
  position: relative;
  display: inline-block;
  background: #fffbe6;
  border-bottom: 2px dotted #f7b500;
  border-radius: 2px;
  box-shadow: 0 2px 8px #f7b50022;
  transition: background 0.18s;
  z-index: 1;
}

.syntax-btn {
  position: absolute;
  z-index: 10;
  left: 0;
  padding: 2px 8px;
  background: #4f8cff;
  color: #fff;
  border-radius: 4px;
  font-size: 0.95em;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 2px 8px #4f8cff22;
  transition: background 0.18s;
  border: none;
  outline: none;
}
.syntax-btn:hover {
  background: #2563eb;
}
.highlight-block {
  outline: 2px solid #4f8cff;
  background: #eaf3ff;
  position: relative;
}
</style>
<style scoped>
.editor-area {
  position: relative;
  margin-bottom: 18px;
  flex: 1;
  min-width: 0;
  max-width: 700px;
}
.editor {
  min-height: 90px;
  width: 100%;
  max-width: 700px;
  border: 1.5px solid #c3c8d1;
  border-radius: 8px;
  padding: 14px 12px;
  font-size: 1.1rem;
  outline: none;
  transition: border 0.2s;
  background: #fafdff;
  text-align: left;
  word-break: break-word;
  white-space: pre-wrap;
  box-sizing: border-box;
}
.editor:focus {
  border-color: #4f8cff;
  background: #fff;
}

</style>
