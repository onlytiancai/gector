<template>
  <div>
    <button @click="highlightHWords">高亮含 h 的单词</button>
    <div ref="editor"></div>
    <!-- Tooltip for syntax corrections -->
    <div 
      ref="tooltip" 
      v-show="tooltipVisible"
      class="syntax-tooltip"
      :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
    >
      <div v-if="currentError" class="tooltip-content">
        <div class="error-info">
          <strong>原文:</strong> {{ currentError.original }}
        </div>
        <div class="suggestion-info">
          <strong>建议:</strong> {{ currentError.real_replacement }}
        </div>
        <div class="tooltip-actions">
          <button @click="applySuggestion" class="btn-apply">应用修改</button>
          <button @click="ignoreSuggestion" class="btn-ignore">忽略</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, onBeforeUnmount } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema, DOMParser } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { exampleSetup } from 'prosemirror-example-setup'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-menu/style/menu.css'
import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css'

const editor = ref(null)
const tooltip = ref(null)
const tooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
const currentError = ref(null)
const currentErrorRange = ref(null)
let view = null

// Track ignored errors to prevent re-highlighting
const ignoredErrors = new Set()

// Store current syntax check results
let currentSyntaxData = null

/**
 * 匹配文本中所有包含"h"的单词，并返回它们在文本中的起止位置。
 * @param {string} text - 要匹配的文本
 * @returns {Array<{from: number, to: number}>} - 每个匹配单词的起止位置
 */
function findHWordRanges(text) {
  const ranges = []
  const regex = /\b\w*h\w*\b/gi
  let match
  while ((match = regex.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
  }
  return ranges
}

/**
 * Fetch syntax check with full error data
 * @param {string} sentText - Text to check
 * @returns {Promise<Object>} - Full API response with actions and corrections
 */
async function fetchSyntaxCheck(sentText) {
  try {
    const resp = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence: sentText })
    })
    const data = await resp.json()
    currentSyntaxData = data
    
    const ranges = []
    for (const action of data.actions) {
      if (action.token_end !== undefined && action.token_start !== undefined) {
        const errorKey = `${action.token_start}-${action.token_end}-${action.original}`
        if (!ignoredErrors.has(errorKey)) {
          ranges.push({ 
            from: action.token_start + 1, 
            to: action.token_end + 1,
            action: action
          })
        }
      }
    }
    return ranges
  } catch (error) {
    console.error('Syntax check failed:', error)
    throw error
  }
}

/**
 * 遍历整个 ProseMirror 文档，查找所有包含字母 "h" 的单词，并为这些单词生成装饰（Decoration）。
 * @param {Node} doc - ProseMirror 的文档根节点
 * @returns {DecorationSet} - 包含所有高亮装饰的集合
 */
function getHWordDecorations(doc) {
  const decorations = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text
      if (!text) return
      // 利用 findHWordRanges 获取所有匹配范围
      const ranges = findHWordRanges(text)
      for (const { from, to } of ranges) {
        // 计算单词在整个文档中的绝对位置
        decorations.push(
          Decoration.inline(pos + from, pos + to, { class: 'h-word-highlight' })
        )
      }
    }
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Generate syntax error decorations with hover event handling
 * @param {Node} doc - ProseMirror document
 * @param {Array} ranges - Error ranges with action data
 * @returns {DecorationSet}
 */
function getSyntaxErrorDecorations(doc, ranges) {
  const decorations = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const textLen = node.text.length
      for (const range of ranges) {
        const { from, to, action } = range
        const nodeFrom = Math.max(0, from - pos)
        const nodeTo = Math.min(textLen, to - pos)
        
        if (nodeFrom < nodeTo && nodeFrom < textLen && nodeTo > 0) {
          decorations.push(
            Decoration.inline(pos + nodeFrom, pos + nodeTo, {
              class: 'syntax-error-highlight',
              'data-error': JSON.stringify(action),
              'data-range': JSON.stringify({ from: pos + nodeFrom, to: pos + nodeTo })
            })
          )
        }
      }
    }
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Show tooltip with error correction info
 * @param {Object} action - Error action data
 * @param {Object} range - Error range in document
 * @param {number} x - Mouse X position
 * @param {number} y - Mouse Y position
 */
function showTooltip(action, range, x, y) {
  currentError.value = action
  currentErrorRange.value = range
  tooltipX.value = x + 10
  tooltipY.value = y - 50
  tooltipVisible.value = true
}

/**
 * Hide tooltip
 */
function hideTooltip() {
  tooltipVisible.value = false
  currentError.value = null
  currentErrorRange.value = null
}

/**
 * Apply suggestion (placeholder function)
 */
function applySuggestion() {
  if (!currentError.value || !currentErrorRange.value || !view) {
    console.warn('No current error or view available')
    return
  }
  
  // TODO: Implement actual text replacement
  console.log('Apply suggestion:', currentError.value.real_replacement)
  console.log('Range:', currentErrorRange.value)
  
  // Placeholder: Replace text in the editor
  const { from, to } = currentErrorRange.value
  const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(currentError.value.real_replacement))
  view.dispatch(tr)
  
  hideTooltip()
}

/**
 * Ignore suggestion - add to ignored list and remove highlighting
 */
function ignoreSuggestion() {
  if (!currentError.value) return
  
  const errorKey = `${currentError.value.token_start}-${currentError.value.token_end}-${currentError.value.original}`
  ignoredErrors.add(errorKey)
  
  // Trigger re-check to update decorations
  if (view) {
    const text = view.state.doc.textContent
    fetchSyntaxCheck(text).then(ranges => {
      const deco = getSyntaxErrorDecorations(view.state.doc, ranges)
      const tr = view.state.tr.setMeta('syntax-check-update', deco)
      view.dispatch(tr)
    }).catch(console.error)
  }
  
  hideTooltip()
}

// 高亮plugin
/**
 * 创建一个ProseMirror插件，用于高亮所有包含"h"字母的单词。
 * 
 * ProseMirror插件（Plugin）可以扩展编辑器的行为。此插件主要用于管理装饰（Decoration）。
 * 装饰（Decoration）是ProseMirror用于在文档中渲染额外样式（如高亮、下划线等）的机制，
 * 不会改变实际文档内容，只影响显示。
 * 
 * 该插件的核心是state字段，定义了如何初始化和更新装饰集合（DecorationSet）。
 * - init: 插件初始化时调用，生成初始装饰集合。
 * - apply: 每当有事务（tr）发生时调用，决定是否需要重新计算装饰集合。
 *   - tr.docChanged: 文档内容发生变化时为true。
 *   - tr.getMeta('highlight-h-words'): 外部通过事务meta强制触发高亮时为true。
 * 
 * props字段中的decorations方法，返回当前编辑器状态下的装饰集合，供ProseMirror渲染。
 */
function createHighlightPlugin() {
  return new Plugin({
    key: highlightPluginKey,
    state: {
      /**
       * 插件初始化时调用，生成初始装饰集合。
       * @param {*} _ - 插件配置参数（未用到）
       * @param {*} param1 - 包含doc属性的对象，doc为当前文档节点
       * @returns DecorationSet
       */
      init(_, { doc }) {
        return getHWordDecorations(doc)
      },
      /**
       * 每当有事务（tr）发生时调用，决定是否需要重新计算装饰集合。
       * @param {*} tr - 当前事务
       * @param {*} old - 旧的装饰集合
       * @param {*} oldState - 旧的编辑器状态
       * @param {*} newState - 新的编辑器状态
       * @returns DecorationSet
       */
      apply(tr, old, oldState, newState) {
        // 如果文档有变更或外部触发（如点击高亮按钮），则重新计算装饰
        if (tr.docChanged || tr.getMeta('highlight-h-words')) {
          return getHWordDecorations(newState.doc)
        }
        // 否则复用旧的装饰集合
        return old
      }
    }
  })
}

/**
 * 语法检查异步插件
 */
function createSyntaxCheckPlugin() {
  let currentDeco = DecorationSet.empty
  return new Plugin({
    key: syntaxPluginKey,
    state: {
      init(_, { doc }) {
        currentDeco = DecorationSet.empty
        return currentDeco
      },
      apply(tr, old, oldState, newState) {
        const newDeco = tr.getMeta('syntax-check-update')
        if (newDeco) {
          currentDeco = newDeco
          return currentDeco
        }
        if (tr.docChanged) {
          currentDeco = DecorationSet.empty
          return currentDeco
        }
        return currentDeco
      }
    },
    view(editorView) {
      let timeout = null
      let destroyed = false
      
      async function check() {
        if (destroyed) return
        const text = editorView.state.doc.textContent
        try {
          const ranges = await fetchSyntaxCheck(text)
          if (destroyed) return
          const deco = getSyntaxErrorDecorations(editorView.state.doc, ranges)
          const tr = editorView.state.tr.setMeta('syntax-check-update', deco)
          editorView.dispatch(tr)
        } catch (e) {
          console.error('Syntax check error:', e)
        }
      }
      
      function scheduleCheck() {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(check, 400)
      }
      
      /**
       * Handle click events using ProseMirror's position resolution
       * This is more reliable than DOM event handling for decorated text
       */
      function handleClick(view, pos, event) {
        console.log('ProseMirror click at position:', pos)
        
        // Get decorations at the clicked position
        const decorations = syntaxPluginKey.getState(view.state)
        if (!decorations || decorations.isEmpty) {
          hideTooltip()
          return false
        }
        
        // Find decoration at clicked position
        const foundDecorations = decorations.find(pos, pos)
        console.log('Found decorations at position:', foundDecorations)
        
        for (const decoration of foundDecorations) {
          const spec = decoration.spec
          console.log('Decoration spec:', spec)
          if (spec && spec['data-error'] && spec['data-range']) {
            try {
              const action = JSON.parse(spec['data-error'])
              const range = JSON.parse(spec['data-range'])
              console.log('Found syntax error decoration:', action)
              
              showTooltip(action, range, event.clientX, event.clientY)
              return true
            } catch (parseError) {
              console.error('Failed to parse decoration data:', parseError)
            }
          }
        }
        
        hideTooltip()
        return false
      }
      
      // Enhanced document click handler
      function handleDocumentClick(event) {
        if (!event || !event.target) return
        
        // Don't hide if clicking on tooltip
        if (tooltip.value && tooltip.value.contains(event.target)) {
          return
        }
        
        hideTooltip()
      }
      
      // Add document click listener
      document.addEventListener('click', handleDocumentClick)
      
      editorView.setProps({
        handleDOMEvents: {
          input: () => { scheduleCheck(); return false }
        },
        handleClick: handleClick
      })
      
      scheduleCheck()
      
      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc) {
            scheduleCheck()
          }
        },
        destroy() {
          destroyed = true
          if (timeout) clearTimeout(timeout)
          document.removeEventListener('click', handleDocumentClick)
          hideTooltip()
        }
      }
    }
  })
}

/**
 * 合并所有插件的装饰集合
 */
function combineDecorationsPlugin() {
  return new Plugin({
    key: new PluginKey('combine-decorations'),
    props: {
      decorations(state) {
        let decos = []
        // highlight
        const highlight = highlightPluginKey.get(state)
        console.log('Highlight decorations:', highlight)
        if (highlight) {
          const d = highlight.getState(state)
          if (d && !d.isEmpty) decos.push(d)
        }
        // syntax check
        const syntax = syntaxPluginKey.get(state)
        console.log('Syntax check decorations:', syntax)
        if (syntax) {
          const d = syntax.getState(state)
          if (d && !d.isEmpty) decos.push(d)
        }
        if (decos.length === 0) return null
        if (decos.length === 1) return decos[0]
        let result = decos[0]
        for (let i = 1; i < decos.length; ++i) {
          result = result.add(state.doc, result.find().concat(decos[i].find()))
        }
        return result
      }
    }
  })
}

const highlightPluginKey = new PluginKey('highlight-h-words')
const syntaxPluginKey = new PluginKey('syntax-check')

function trChanged(view, tr) {
  //console.log('Transaction changed:', tr)
  // 打印被改动的节点文本和类型，避免越界
  const docSize = view.state.doc.content.size
  tr.mapping.maps.forEach((stepMap) => {
    stepMap.forEach((from, to) => {
      // 限制范围在文档有效区间
      const safeFrom = Math.max(0, Math.min(from, docSize))
      const safeTo = Math.max(0, Math.min(to, docSize))
      if (safeFrom < safeTo) {
        view.state.doc.nodesBetween(safeFrom, safeTo, (node, pos) => {
          if (node.isTextblock || node.isText) {
            //console.log('Changed node type:', node.type.name, 'text:', node.textContent)
          }
        })
      }
    })
  })
}

function highlightHWords() {
  if (view) {
    // 触发plugin重新计算装饰
    const tr = view.state.tr.setMeta('highlight-h-words', true)
    view.dispatch(tr)
  }
}

onMounted(() => {
  // 定义初始化内容
  const initialContent = document.createElement('div')
  initialContent.innerHTML = '<p>hello world, my name is lili.</p>'

  // 创建编辑器状态
  const state = EditorState.create({
    doc: DOMParser.fromSchema(basicSchema).parse(initialContent),
    plugins: [
      ...exampleSetup({ schema: basicSchema }),
      createHighlightPlugin(),
      createSyntaxCheckPlugin(),
      combineDecorationsPlugin(),
      // 监听变更
      new Plugin({
        props: {
          handleDOMEvents: {},
        },
        // 监听事务
        apply(tr, prev, oldState, newState) {
          if (tr.docChanged) {
            trChanged(view, tr)
          }
          return prev
        }
      })
    ]
  })

  // 创建编辑器视图
  view = new EditorView(editor.value, {
    state,
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr)
      view.updateState(newState)
      if (tr.docChanged) {
        trChanged(view, tr)
      }
    }
  })
})

onBeforeUnmount(() => {
  if (view) {
    view.destroy()
    view = null
  }
})
</script>

<style>
.ProseMirror {
  min-height: 200px;
  border: 1px solid #ccc;
  padding: 10px;
  outline: none;
  width: 600px;
  text-align:left;
}
.h-word-highlight {
  background: yellow;
  border-radius: 2px;
}
.syntax-error-highlight {
  background: #ffb3b3;
  border-bottom: 2px solid red;
  cursor: pointer;
  position: relative;
}

.syntax-error-highlight:hover {
  background: #ff9999;
}

.syntax-tooltip {
  position: fixed;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-width: 250px;
  font-size: 14px;
}

.tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-info, .suggestion-info {
  margin: 0;
  word-break: break-word;
}

.tooltip-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-apply, .btn-ignore {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: white;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s;
}

.btn-apply:hover {
  background: #e6f3ff;
  border-color: #0066cc;
}

.btn-ignore:hover {
  background: #ffe6e6;
  border-color: #cc0000;
}
</style>