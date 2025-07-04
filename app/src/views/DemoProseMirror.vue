<template>
  <div class="prosemirror-demo">
    <div ref="editor" class="pm-editor"></div>
    <button class="manual-check-btn" @click="checkAllSentences">手动检查全部句子</button>
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
import { EditorState, Plugin } from 'prosemirror-state'
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

// 获取句子中每个单词的起止字符偏移
function getWordOffsets(sentence, sentStart) {
  // 简单按空格和标点分词，可根据需要优化
  const wordRegex = /[\w'-]+|[^\s\w]/g
  let match
  let offsets = []
  let idx = 0
  while ((match = wordRegex.exec(sentence)) !== null) {
    const start = match.index
    const end = start + match[0].length
    offsets.push({
      from: sentStart + start,
      to: sentStart + end
    })
    idx++
  }
  return offsets
}

// 解析建议，返回装饰数组
function getSuggestionDecorations(doc, actions, sentStart, sentence) {
  const decos = []
  const wordOffsets = getWordOffsets(sentence, sentStart)
  for (const action of actions) {
    // 保证 action 带有 sent_text 字段
    action.sent_text = sentence
    // action.start/end 是单词索引
    const from = wordOffsets[action.start]?.from
    const to = wordOffsets[action.end - 1]?.to
    console.log('处理建议:', action, 'from:', from, 'to:', to)
    if (from !== undefined && to !== undefined && from < to) {
      decos.push(
        Decoration.inline(from, to, {
          class: 'suggestion-underline',
          'data-action': JSON.stringify(action)
        }, { id: Math.random().toString(36).slice(2) })
      )
    }
  }
  return decos
}

// 重新检查所有句子
async function checkAllSentences() {
  const text = view.state.doc.textContent
  console.log('[checkAllSentences] 文本内容:', text)
  const sentences = splitSentences(text)
  console.log('[checkAllSentences] 分割句子:', sentences)
  let pos = 0
  let allDecos = []
  for (const sent of sentences) {
    const sentStart = pos
    const sentEnd = pos + sent.length
    console.log(`[checkAllSentences] 检查句子: "${sent}" 起始: ${sentStart} 结束: ${sentEnd}`)
    // 只检查非空句子
    if (sent.trim()) {
      try {
        const result = await fetchSyntaxCheck(sent)
        console.log(`[checkAllSentences] API返回:`, result)
        if (result.actions && result.actions.length) {
          const decos = getSuggestionDecorations(view.state.doc, result.actions, sentStart, sent)
          console.log(`[checkAllSentences] 生成装饰:`, decos)
          allDecos.push(...decos)
        }
      } catch (e) {
        console.warn('[checkAllSentences] 语法检查失败', e)
      }
    }
    pos = sentEnd + 1 // 跳过分隔符
  }
  suggestionDecos = DecorationSet.create(view.state.doc, allDecos)
  console.log('[checkAllSentences] 更新全部装饰:', suggestionDecos.find())
  updateDecorations()
}

// 防抖实现
let debounceTimer = null
function debounceCheckAllSentences() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    checkAllSentences()
  }, 500)
}

// 更新装饰
function updateDecorations() {
  view.dispatch(
    view.state.tr.setMeta('decorations', suggestionDecos)
  )
}

// ProseMirror 插件：用于渲染建议下划线
function suggestionPlugin() {
  return new Plugin({
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
  })
}

// 应用建议
function applySuggestion() {
  const { action } = popover.value
  if (!action) return
    console.log('应用建议:', action)
  // 找到当前句子和句首偏移
  const text = view.state.doc.textContent
  const sentences = splitSentences(text)
  let pos = 0, sentIdx = -1, sentStart = 0, sent = ''
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]
    const sStart = pos
    const sEnd = sStart + s.length
    console.log('检查句子:', s, '索引:', i, '起始偏移:', sStart)
    if (action.sent_text && s.trim() === action.sent_text.trim()) {
      sentIdx = i
      sentStart = sStart
      sent = s
      break
    }
    pos = sEnd + 1
  }
  console.log('找到句子:', sent, '索引:', sentIdx, '起始偏移:', sentStart)
  if (sentIdx === -1) return

  const wordOffsets = getWordOffsets(sent, sentStart)
  const from = wordOffsets[action.start]?.from
  const to = wordOffsets[action.end - 1]?.to
  console.log('应用建议:', action, 'from:', from, 'to:', to)
  if (from === undefined || to === undefined) return

  const tr = view.state.tr
  if (action.action === '$DELETE') {
    tr.delete(from, to)
  } else if (action.action.startsWith('$APPEND_')) {
    tr.insertText(' ' + action.real_replacement, to)
  } else {
    tr.insertText(action.real_replacement, from, to)
  }
  view.dispatch(tr)
  popover.value.visible = false

  // 1. 移除该建议的高亮（装饰）
  suggestionDecos = DecorationSet.create(view.state.doc, suggestionDecos.find().filter(d => {
    try {
      return JSON.parse(d.spec['data-action']).start !== action.start || JSON.parse(d.spec['data-action']).end !== action.end
    } catch { return true }
  }))
  updateDecorations()

  // 2. 只重新检查当前句子
  setTimeout(async () => {
    try {
      const newText = view.state.doc.textContent
      // 重新定位当前句子（因内容已变动，需重新分割）
      const newSentences = splitSentences(newText)
      let newPos = 0, newSent = '', newSentStart = 0
      for (let i = 0; i < newSentences.length; i++) {
        const s = newSentences[i]
        const sStart = newPos
        const sEnd = sStart + s.length
        // 以原句首为基准，找到包含原句首的句子
        if (sentStart >= sStart && sentStart < sEnd) {
          newSent = s
          newSentStart = sStart
          break
        }
        newPos = sEnd + 1
      }
      if (!newSent.trim()) return
      const result = await fetchSyntaxCheck(newSent)
      // 移除该句子范围内的所有建议装饰
      const start = newSentStart
      const end = newSentStart + newSent.length
      suggestionDecos = DecorationSet.create(view.state.doc, suggestionDecos.find().filter(d => {
        return d.from < start || d.to > end
      }))
      // 添加新建议装饰
      if (result.actions && result.actions.length) {
        const newDecos = getSuggestionDecorations(view.state.doc, result.actions, newSentStart, newSent)
        suggestionDecos = DecorationSet.create(view.state.doc, [
          ...suggestionDecos.find(),
          ...newDecos
        ])
      }
      updateDecorations()
    } catch (e) {
      // 忽略单句失败
    }
  }, 100)
}

// 忽略建议
function ignoreSuggestion() {
  // 只移除该建议的装饰
  const { action } = popover.value
  if (!action) return
  suggestionDecos = DecorationSet.create(view.state.doc, suggestionDecos.find().filter(d => {
    try {
      const decoAction = JSON.parse(d.spec['data-action'])
      // 移除start和end都相同的装饰
      return decoAction.start !== action.start || decoAction.end !== action.end
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

  // 初始化富文本内容
  const initialHTML = `
    <p>欢迎使用 <b>ProseMirror</b> 编辑器！</p>
    <p>你可以在这里输入文本，系统会自动检测语法建议。</p>
  `
  const initialDoc = DOMParser.fromSchema(schema).parse(
    new window.DOMParser().parseFromString(initialHTML, 'text/html').body
  )

  view = new EditorView(editor.value, {
    state: EditorState.create({
      doc: initialDoc,
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
      // 输入后自动检查（防抖）
      if (tr.docChanged) {
        debounceCheckAllSentences()
      }
    }
  })
  // 首次检查
  debounceCheckAllSentences()
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
  width: 600px; /* 新增默认宽度 */
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
.manual-check-btn {
  margin-bottom: 12px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 18px;
  font-size: 1em;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s;
}
.manual-check-btn:hover {
  background: #1746a2;
}
</style>
