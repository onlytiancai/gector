<template>
  <div class="prosemirror-demo">
    <div ref="editor" class="pm-editor"></div>
    <div v-if="popover.visible" class="suggestion-popover" :style="popover.position">
      <div class="popover-content">
        <div>
          <b>建议:</b>
          <span>{{ popover.action?.real_replacement }}</span>
        </div>
        <div v-if="popover.action?.confidence">
          <small>置信度: {{ (popover.action.confidence * 100).toFixed(1) }}%</small>
        </div>
        <div class="popover-actions">
          <button @click="applySuggestion">应用建议</button>
          <button @click="ignoreSuggestion">忽略</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view'
import { Schema, DOMParser } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { history } from 'prosemirror-history'

// 句子分割正则
const SENTENCE_REGEX = /[^.!?\n]+[.!?]?/g

const editor = ref(null)
let view = null

// 悬浮建议框状态
const popover = ref({
  visible: false,
  action: null,
  decoId: null,
  position: { top: '0px', left: '0px' }
})

// 存储所有建议的装饰信息
let suggestionDecos = DecorationSet.empty

// 语法检查API
async function fetchSyntaxCheck(sentText) {
  const resp = await fetch('/api/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence: sentText })
  })
  return await resp.json()
}

// 句子分割
function splitSentences(text) {
  return text.match(SENTENCE_REGEX) || []
}

// 解析建议，返回装饰数组
function getSuggestionDecorations(doc, actions, sentStart) {
  const decos = []
  for (const action of actions) {
    // action.start/end 是句内token索引，这里简单用字符偏移
    // 需根据实际tokenizer调整
    let from = sentStart + action.start
    let to = sentStart + action.end
    // 用 mark 装饰
    decos.push(
      Decoration.inline(from, to, {
        class: 'suggestion-underline',
        'data-action': JSON.stringify(action)
      }, { id: Math.random().toString(36).slice(2) })
    )
  }
  return decos
}

// 重新检查所有句子
async function checkAllSentences() {
  const text = view.state.doc.textContent
  const sentences = splitSentences(text)
  let pos = 0
  let allDecos = []
  for (const sent of sentences) {
    const sentStart = pos
    const sentEnd = pos + sent.length
    // 只检查非空句子
    if (sent.trim()) {
      try {
        const result = await fetchSyntaxCheck(sent)
        if (result.actions && result.actions.length) {
          allDecos.push(...getSuggestionDecorations(view.state.doc, result.actions, sentStart))
        }
      } catch (e) {
        console.warn('语法检查失败', e)
      }
    }
    pos = sentEnd + 1 // 跳过分隔符
  }
  suggestionDecos = DecorationSet.create(view.state.doc, allDecos)
  updateDecorations()
}

// 更新装饰
function updateDecorations() {
  view.dispatch(
    view.state.tr.setMeta('decorations', suggestionDecos)
  )
}

// ProseMirror 插件：用于渲染建议下划线
function suggestionPlugin() {
  return {
    props: {
      decorations(state) {
        return suggestionDecos
      },
      handleClick(view, pos, event) {
        const target = event.target
        if (target.classList.contains('suggestion-underline')) {
          const decoId = target.getAttribute('data-deco-id')
          let action = null
          try {
            action = JSON.parse(target.getAttribute('data-action'))
          } catch {}
          // 计算弹窗位置
          const rect = target.getBoundingClientRect()
          popover.value = {
            visible: true,
            action,
            decoId,
            position: {
              top: rect.bottom + window.scrollY + 4 + 'px',
              left: rect.left + window.scrollX + 'px'
            }
          }
          return true
        }
        popover.value.visible = false
        return false
      }
    }
  }
}

// 应用建议
function applySuggestion() {
  const { action } = popover.value
  if (!action) return
  const tr = view.state.tr
  if (action.action === '$DELETE') {
    tr.delete(action.start, action.end)
  } else if (action.action.startsWith('$APPEND_')) {
    tr.insertText(' ' + action.real_replacement, action.end)
  } else {
    tr.insertText(action.real_replacement, action.start, action.end)
  }
  view.dispatch(tr)
  popover.value.visible = false
  // 重新检查
  setTimeout(checkAllSentences, 100)
}

// 忽略建议
function ignoreSuggestion() {
  // 只移除该建议的装饰
  const { action } = popover.value
  if (!action) return
  suggestionDecos = DecorationSet.create(view.state.doc, suggestionDecos.find().filter(d => {
    try {
      return JSON.parse(d.spec['data-action']).start !== action.start || JSON.parse(d.spec['data-action']).end !== action.end
    } catch { return true }
  }))
  updateDecorations()
  popover.value.visible = false
}

onMounted(() => {
  // 扩展schema支持更多block
  const schema = new Schema({
    nodes: basicSchema.spec.nodes,
    marks: basicSchema.spec.marks
  })
  view = new EditorView(editor.value, {
    state: EditorState.create({
      schema,
      plugins: [
        suggestionPlugin(),
        keymap(baseKeymap),
        history()
      ]
    }),
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr)
      view.updateState(newState)
      // 输入后自动检查
      if (tr.docChanged) {
        setTimeout(checkAllSentences, 300)
      }
    }
  })
  // 首次检查
  setTimeout(checkAllSentences, 300)
})

onBeforeUnmount(() => {
  if (view) view.destroy()
})
</script>

<style>
.prosemirror-demo {
  position: relative;
  max-width: 700px;
  margin: 0 auto;
}
.pm-editor {
  border: 1.5px solid #c3c8d1;
  border-radius: 8px;
  min-height: 120px;
  padding: 14px 12px;
  background: #fafdff;
  font-size: 1.1rem;
  outline: none;
  margin-bottom: 18px;
}
.suggestion-underline {
  background: #fffbe6;
  border-bottom: 2px dotted #f7b500;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.18s;
}
.suggestion-popover {
  position: absolute;
  z-index: 100;
  background: #fff;
  border: 1.5px solid #4f8cff;
  border-radius: 8px;
  box-shadow: 0 2px 12px #4f8cff22;
  padding: 12px 16px;
  min-width: 180px;
  max-width: 320px;
}
.popover-content {
  font-size: 1rem;
  color: #222;
}
.popover-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}
.popover-actions button {
  background: #4f8cff;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 14px;
  font-size: 0.97em;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.18s;
}
.popover-actions button:last-child {
  background: #b3cfff;
  color: #333;
}
.popover-actions button:hover {
  background: #2563eb;
}
</style>
