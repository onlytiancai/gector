<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import EditorArea from './components/EditorArea.vue'
import SuggestionSidebar from './components/SuggestionSidebar.vue'
import HistoryList from './components/HistoryList.vue'

const inputText = ref('')
const displayTokens = ref([])
const actions = ref([])
const loading = ref(false)
const editorHtml = ref('')
const hoveredSidebarIdx = ref(null)
const undoStack = ref([])
const lastSentences = ref([])
const lastActionsBySentenceIdx = ref({})

const canUndo = computed(() => undoStack.value.length > 0)
const historyList = computed(() => {
  if (!undoStack.value.length) return []
  return undoStack.value.slice(-10).reverse()
})

onMounted(() => {
  inputText.value = 'the list of item are on the table since yesterday. my name is lili.'
  renderTokens(inputText.value)
  if (inputText.value && inputText.value.trim()) {
    checkGrammar()
    undoStack.value = []
  }
})

function onInput(e) {
  inputText.value = getEditorText()
}
function getEditorText() {
  return document.querySelector('.editor').innerText.replace(/\s+/g, ' ').trim()
}
function renderTokens(text) {
  const tokens = text.split(' ').filter(t => t.length)
  displayTokens.value = tokens.map(t => ({ text: t }))
  if (actions.value && actions.value.length) {
    actions.value.forEach((act, i) => {
      if (act.action === '$DELETE') {
        for (let idx = act.start; idx < act.end; ++idx) {
          if (displayTokens.value[idx]) {
            displayTokens.value[idx] = {
              ...displayTokens.value[idx],
              suggestion: act,
              suggestionType: 'delete',
              actionIdx: i,
              highlight: true // 标记高亮
            }
          }
        }
      } else if (act.action.startsWith('$APPEND_')) {
        displayTokens.value.splice(act.end, 0, {
          text: act.real_replacement,
          suggestion: act,
          suggestionType: 'append',
          isVirtual: true,
          actionIdx: i,
          highlight: true
        })
      } else {
        for (let idx = act.start; idx < act.end; ++idx) {
          if (displayTokens.value[idx]) {
            displayTokens.value[idx] = {
              ...displayTokens.value[idx],
              suggestion: act,
              suggestionType: 'replace',
              actionIdx: i,
              highlight: true
            }
          }
        }
      }
    })
  }
  updateEditorHtml()
}
async function checkGrammar() {
  pushUndo()
  loading.value = true
  try {
    const sentences = []
    const sentenceRegex = /[^.?!]+[.?!]?/g
    let match
    while ((match = sentenceRegex.exec(inputText.value)) !== null) {
      const sentence = match[0].trim()
      if (sentence) {
        sentences.push({
          text: sentence,
          startChar: match.index,
          endChar: match.index + match[0].length
        })
      }
    }
    const allTokens = inputText.value.split(' ').filter(t => t.length)
    let tokenOffsets = []
    let charIdx = 0
    for (let i = 0; i < allTokens.length; ++i) {
      tokenOffsets.push(charIdx)
      charIdx += allTokens[i].length + 1
    }
    let lastSent = lastSentences.value || []
    let lastActs = lastActionsBySentenceIdx.value || {}
    let changedIdxs = []
    for (let i = 0; i < sentences.length; ++i) {
      if (!lastSent[i] || lastSent[i].text !== sentences[i].text) {
        changedIdxs.push(i)
      }
    }
    let allActions = []
    let sentenceTokenStart = 0
    let newActionsBySentenceIdx = {}
    for (let i = 0; i < sentences.length; ++i) {
      const s = sentences[i]
      let sentStartToken = -1, sentEndToken = -1
      for (let j = sentenceTokenStart; j < allTokens.length; ++j) {
        if (tokenOffsets[j] >= s.startChar) {
          sentStartToken = j
          break
        }
      }
      for (let j = sentStartToken; j < allTokens.length; ++j) {
        if (tokenOffsets[j] >= s.endChar) {
          sentEndToken = j
          break
        }
      }
      if (sentStartToken === -1) sentStartToken = 0
      if (sentEndToken === -1) sentEndToken = allTokens.length
      const sentTokens = allTokens.slice(sentStartToken, sentEndToken)
      const sentText = sentTokens.join(' ')
      let acts = []
      if (changedIdxs.includes(i)) {
        const resp = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentence: sentText })
        })
        const result = await resp.json()
        if (result.actions && Array.isArray(result.actions)) {
          acts = result.actions.map(act => {
            const newAct = { ...act }
            newAct.start = (act.start ?? 0) + sentStartToken
            newAct.end = (act.end ?? 0) + sentStartToken
            return newAct
          })
        }
      } else if (lastActs[i]) {
        acts = lastActs[i].map(act => {
          const offset = sentStartToken - (lastSent[i]?.tokenStart ?? 0)
          return {
            ...act,
            start: act.start + offset,
            end: act.end + offset
          }
        })
      }
      newActionsBySentenceIdx[i] = acts
      allActions.push(...acts)
      s.tokenStart = sentStartToken
      sentenceTokenStart = sentEndToken
    }
    actions.value = allActions
    lastSentences.value = sentences.map(s => ({ ...s }))
    lastActionsBySentenceIdx.value = newActionsBySentenceIdx
    renderTokens(inputText.value)
  } finally {
    loading.value = false
  }
}
function onEditorClick(e) {
  const target = e.target
  if (target.classList && target.classList.contains('suggestion')) {
    const idx = Number(target.getAttribute('data-idx'))
    const token = displayTokens.value[idx]
    if (token && typeof token.actionIdx === 'number') {
      hoveredSidebarIdx.value = token.actionIdx
    }
  }
}
function applySidebarSuggestion(actionIdx) {
  pushUndo()
  const act = actions.value[actionIdx]
  if (!act) return
  let tokens = inputText.value.split(' ').filter(t => t.length)
  if (act.action === '$DELETE') {
    tokens.splice(act.start, act.end - act.start)
  } else if (act.action.startsWith('$APPEND_')) {
    tokens.splice(act.end, 0, act.real_replacement)
  } else if (act.action.startsWith('$TRANSFORM_') || act.action.startsWith('$REPLACE_')) {
    tokens.splice(act.start, act.end - act.start, act.real_replacement)
  } else {
    tokens.splice(act.start, act.end - act.start, act.real_replacement)
  }
  inputText.value = tokens.join(' ')
  // 不要立即清空actions，先renderTokens，等checkGrammar后再更新actions
  renderTokens(inputText.value)
  checkGrammar()
}
function updateEditorHtml() {
  let html = ''
  displayTokens.value.forEach((token, idx) => {
    if (token.suggestion) {
      // 高亮和下划线，支持点击高亮
      const activeAttr = hoveredSidebarIdx.value === token.actionIdx ? ' data-active="true"' : ''
      html += `<span class="suggestion${token.highlight ? ' highlight' : ''}" data-idx="${idx}"${activeAttr} style="position:relative;display:inline-block;">${token.text}<span class="underline" style="width:100%;"></span></span>`
    } else {
      html += `<span data-idx="${idx}">${token.text}</span>`
    }
    if (idx !== displayTokens.value.length - 1) html += ' '
  })
  editorHtml.value = html
  nextTick(() => {
    const el = document.querySelector('.editor')
    if (el && document.activeElement === el) {
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
  })
}
function pushUndo() {
  if (
    undoStack.value.length === 0 ||
    undoStack.value[undoStack.value.length - 1] !== inputText.value
  ) {
    if (undoStack.value.length >= 20) undoStack.value.shift()
    undoStack.value.push(inputText.value)
    if (undoStack.value.length > 20) undoStack.value = undoStack.value.slice(-20)
  }
}
function applyHistory(idx) {
  const h = historyList.value[idx]
  if (typeof h === 'string') {
    inputText.value = h
    actions.value = []
    renderTokens(inputText.value)
    checkGrammar()
  }
}
function undo() {
  if (!canUndo.value) return
  let prev
  if (undoStack.value[undoStack.value.length - 1] === inputText.value) {
    undoStack.value.pop()
  }
  prev = undoStack.value.pop()
  if (typeof prev === 'string') {
    inputText.value = prev
    actions.value = []
    renderTokens(inputText.value)
    checkGrammar()
  }
}
</script>

<template>
  <div id="app" class="container">
    <div style="flex:1;min-width:0;">
      <div class="header">Wawa Grammar Correction</div>
      <EditorArea
        :editorHtml="editorHtml"
        @input="onInput"
        @editorClick="onEditorClick"
      />
      <button class="check-btn" :disabled="loading || !inputText.trim()" @click="checkGrammar">
        {{ loading ? 'Checking...' : 'Check Grammar' }}
      </button>
      <button class="check-btn" style="margin-left:10px;background:#888;" :disabled="!canUndo" @click="undo">
        Undo<span v-if="undoStack.length > 0"> ({{ undoStack.length }})</span>
      </button>
      <HistoryList :historyList="historyList" @applyHistory="applyHistory" />
    </div>
    <SuggestionSidebar
      :actions="actions"
      :hoveredSidebarIdx="hoveredSidebarIdx"
      @update:hoveredSidebarIdx="val => hoveredSidebarIdx = val"
      @applySidebarSuggestion="applySidebarSuggestion"
    />
  </div>
</template>

<style scoped>
@import './style.css';
.container {
  max-width: 1100px;
  margin: 40px auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 16px #0001;
  padding: 32px 28px 24px 28px;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}
.header {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 18px;
  color: #222;
}
.editor-area {
  position: relative;
  margin-bottom: 18px;
  flex: 1;
  min-width: 0;
}
.editor {
  min-height: 90px;
  width: 100%;
  border: 1.5px solid #c3c8d1;
  border-radius: 8px;
  padding: 14px 12px;
  font-size: 1.1rem;
  outline: none;
  transition: border 0.2s;
  background: #fafdff;
}
.editor:focus {
  border-color: #4f8cff;
  background: #fff;
}
.check-btn {
  background: #4f8cff;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 10px 22px;
  font-size: 1rem;
  cursor: pointer;
  font-weight: 600;
  margin-top: 8px;
  transition: background 0.2s;
}
.check-btn:disabled {
  background: #b3cfff;
  cursor: not-allowed;
}
.suggestion {
  position: relative;
  display: inline-block;
}
.underline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  background: linear-gradient(to right, #f7b500 60%, transparent 0%);
  background-size: 6px 2px;
  background-repeat: repeat-x;
  border-radius: 1px;
  pointer-events: none;
}
.actions-bar {
  margin-top: 18px;
  color: #888;
  font-size: 0.98rem;
}
.suggestion-delete {
  background: #ffeaea;
  border-bottom: 2px dotted #e74c3c;
}
.suggestion-append {
  background: #eaffea;
  border-bottom: 2px dotted #27ae60;
}
.sidebar {
  position: static;
  margin-left: 36px;
  width: 320px;
  max-height: 70vh;
  background: #fafdff;
  border: 1.5px solid #c3c8d1;
  border-radius: 10px;
  box-shadow: 0 2px 12px #0001;
  padding: 16px 14px 12px 14px;
  overflow-y: auto;
  z-index: 1;
}
.sidebar-title {
  font-weight: bold;
  font-size: 1.08rem;
  margin-bottom: 10px;
  color: #4f8cff;
}
.sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sidebar-item {
  background: #fffbe6;
  border-left: 4px solid #f7b500;
  border-radius: 5px;
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.98rem;
  margin-bottom: 4px;
  position: relative;
}
.sidebar-item:hover {
  background: #fff3c1;
}
.apply-btn {
  display: none;
  position: absolute;
  right: 12px;
  top: 10px;
  background: #4f8cff;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 3px 12px;
  font-size: 0.97em;
  cursor: pointer;
  font-weight: 600;
  z-index: 2;
  transition: background 0.18s;
}
.sidebar-item:hover .apply-btn {
  display: inline-block;
}
.apply-btn:active {
  background: #2562c7;
}
.sidebar-item.active,
.sidebar-item[data-active="true"] {
  background: #e6f0ff !important;
  border-left-color: #4f8cff !important;
}
.sidebar-item.active .apply-btn,
.sidebar-item[data-active="true"] .apply-btn {
  display: inline-block;
}
</style>
