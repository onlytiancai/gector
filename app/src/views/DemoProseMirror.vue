<template>
  <div>
    <div ref="editor"></div>
  </div>
</template>

<script setup>
import { onMounted, ref, onBeforeUnmount } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { DOMParser } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { exampleSetup } from 'prosemirror-example-setup'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { showTooltip, hideTooltip } from '../utils/tooltip'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-menu/style/menu.css'

const editor = ref(null)
let view = null

// Track ignored errors to prevent re-highlighting
const ignoredErrors = new Set()

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
 * Generate syntax error decorations with click event handling
 * Store error data in both spec and attrs for reliable access
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
            }, {
              // Store in spec for internal access
              errorAction: action,
              errorRange: { from: pos + nodeFrom, to: pos + nodeTo }
            })
          )
        }
      }
    }
  })
  return DecorationSet.create(doc, decorations)
}


/**
 * Apply suggestion with support for append, delete, and replace operations
 * @param {Object} action - Error action data
 * @param {Object} range - Error range in document
 */
function applySuggestion(action, range) {
  if (!action || !range || !view) {
    console.warn('No action, range, or view available')
    return
  }
  
  const { from, to } = range
  let tr
  
  try {
    if (action.action.startsWith('$APPEND_')) {
      // Append operation: insert text after the current position
      console.log('Append operation:', action.real_replacement, 'at position:', to)
      tr = view.state.tr.insert(to, view.state.schema.text(action.real_replacement))
    } else if (action.action === '$DELETE') {
      // Delete operation: remove the specified range
      console.log('Delete operation: removing range', from, 'to', to)
      tr = view.state.tr.delete(from, to)
    } else {
      // Replace operation: replace current range with real_replacement
      console.log('Replace operation:', action.original, '->', action.real_replacement)
      tr = view.state.tr.replaceWith(from, to, view.state.schema.text(action.real_replacement))
    }
    
    view.dispatch(tr)
    console.log('Successfully applied suggestion:', action.action)
  } catch (error) {
    console.error('Failed to apply suggestion:', error)
  }
  
  hideTooltip()
}

/**
 * Ignore suggestion - add to ignored list and remove highlighting
 * @param {Object} action - Error action data
 */
function ignoreSuggestion(action) {
  if (!action) return
  
  const errorKey = `${action.token_start}-${action.token_end}-${action.original}`
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
          // 使用语法检查返回的新装饰集合
          currentDeco = newDeco
          return currentDeco
        }
        if (tr.docChanged) {
          // 文档内容有变化时，清空装饰
          currentDeco = DecorationSet.empty
          return currentDeco
        }
        // 保持原有装饰
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
      
      /**
       * 延迟400ms后执行 `check` 函数，如果在这段时间内再次调用，则会清除上一次的定时器，
       * 保证 `check` 只会在最后一次调用后执行一次。
       * 主要用于防抖处理，比如用户输入等高频事件。
       */
      function scheduleCheck() {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(check, 400)
      }
      
      /**
       * Handle click events with improved positioning using ProseMirror coordinates
       */
      function handleClick(view, pos, event) {
        console.log('ProseMirror click at position:', pos, 'event target:', event.target)
        
        // Check if we clicked on a syntax error highlight
        const clickedElement = event.target
        // 使用 closest 方法查找最近的语法错误高亮元素
        const syntaxErrorElement = clickedElement.closest('.syntax-error-highlight')
        if (!syntaxErrorElement) {
          hideTooltip()
          return false
        }
        
        // Prevent default since we found our target
        event.preventDefault()
        event.stopPropagation()
        
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
          
          // Check if this is a syntax error decoration
          if (spec && spec.errorAction && spec.errorRange) {
            console.log('Found syntax error decoration:', spec.errorAction)
            console.log('Range for positioning:', spec.errorRange)
            
            // Use extracted tooltip utility
            showTooltip(
              spec.errorAction, 
              spec.errorRange, 
              syntaxErrorElement, 
              view,
              applySuggestion,
              ignoreSuggestion
            )
            return true
          }
        }
        
        hideTooltip()
        return false
      }
      
      /**
       * 更新 ProseMirror 编辑器的属性：
       * - handleDOMEvents.input: 当输入事件发生时，调用 scheduleCheck() 进行检查，并返回 false 以允许默认处理。
       * - handleClick: 设置自定义点击事件处理函数。
       */
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

const syntaxPluginKey = new PluginKey('syntax-check')

onMounted(() => {
  // 定义初始化内容
  const initialContent = document.createElement('div')
  initialContent.innerHTML = '<p>hello world, my name is a lili. Here is apple.</p>'

  // 创建编辑器状态
  const state = EditorState.create({
    doc: DOMParser.fromSchema(basicSchema).parse(initialContent),
    plugins: [
      ...exampleSetup({ schema: basicSchema }),
      createSyntaxCheckPlugin(),
      combineDecorationsPlugin(),
    ]
  })

  // 创建编辑器视图
  view = new EditorView(editor.value, {
    state,
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr)
      view.updateState(newState)
    }
  })
})

onBeforeUnmount(() => {
  hideTooltip()
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
  text-align: left;
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

/* Tippy.js theme for syntax corrections */
.tippy-box[data-theme~='syntax-correction'] {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  max-width: 300px;
}

.tippy-box[data-theme~='syntax-correction'] .tippy-content {
  padding: 16px;
}

.tippy-box[data-theme~='syntax-correction'] .tippy-arrow {
  color: white;
}

/* Tooltip content styles */
.tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-info {
  padding: 8px;
  border-radius: 6px;
  border-left: 4px solid;
}

.action-info.append {
  background: #f0f9ff;
  border-left-color: #0ea5e9;
}

.action-info.delete {
  background: #fef2f2;
  border-left-color: #ef4444;
}

.action-info.replace {
  background: #fffbeb;
  border-left-color: #f59e0b;
}

.action-type {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 6px;
  color: #374151;
}

.error-info, .suggestion-info, .reason-info {
  margin: 4px 0;
  word-break: break-word;
  line-height: 1.4;
  color: #374151; /* Darker text color for better readability */
}

.error-info strong, .suggestion-info strong {
  color: #111827; /* Even darker for the labels */
  font-weight: 600;
}

.reason-info {
  font-size: 12px;
  color: #4b5563; /* Darker than the previous light gray */
  font-style: italic;
}

.confidence-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
}

.confidence-label {
  min-width: 50px;
}

.confidence-bar {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.confidence-fill.confidence-high {
  background: #10b981;
}

.confidence-fill.confidence-medium {
  background: #f59e0b;
}

.confidence-fill.confidence-low {
  background: #ef4444;
}

.confidence-value {
  min-width: 35px;
  text-align: right;
  font-weight: 500;
}

.tooltip-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.btn-apply, .btn-ignore {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-apply {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.btn-apply:hover {
  background: #2563eb;
  border-color: #2563eb;
}

.btn-ignore:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}
</style>