<template>
  <div>
    <button @click="highlightHWords">高亮含 h 的单词</button>
    <div ref="editor"></div>
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
import tippy from 'tippy.js'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-menu/style/menu.css'
import 'tippy.js/dist/tippy.css'

const editor = ref(null)
let view = null
let currentTippyInstance = null

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
              'data-error': JSON.stringify(action),
              'data-range': JSON.stringify({ from: pos + nodeFrom, to: pos + nodeTo })
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
 * Create tooltip content DOM element for tippy.js
 * @param {Object} action - Error action data
 * @returns {HTMLElement} - DOM element for tooltip content
 */
function createTooltipContent(action) {
  const container = document.createElement('div')
  container.className = 'tooltip-content'
  
  // Create action info section
  const actionInfo = document.createElement('div')
  actionInfo.className = 'action-info'
  
  const isAppend = action.action.startsWith('$APPEND_')
  const isDelete = action.action === '$DELETE'
  
  if (isAppend) {
    actionInfo.classList.add('append')
    const displayText = getDisplayTextForAction(action)
    actionInfo.innerHTML = `
      <div class="action-type">📝 添加建议</div>
      <div class="suggestion-info">
        <strong>在 "${displayText}" 后添加:</strong> "${action.real_replacement}"
      </div>
    `
  } else if (isDelete) {
    actionInfo.classList.add('delete')
    actionInfo.innerHTML = `
      <div class="action-type">🗑️ 删除建议</div>
      <div class="suggestion-info">
        <strong>建议删除:</strong> "${action.original}"
      </div>
      <div class="reason-info">该词可能是多余的</div>
    `
  } else {
    actionInfo.classList.add('replace')
    actionInfo.innerHTML = `
      <div class="action-type">✏️ 替换建议</div>
      <div class="error-info">
        <strong>原文:</strong> "${action.original}"
      </div>
      <div class="suggestion-info">
        <strong>建议改为:</strong> "${action.real_replacement}"
      </div>
    `
  }
  
  container.appendChild(actionInfo)
  
  // Create confidence info if available
  if (action.confidence) {
    const confidenceInfo = document.createElement('div')
    confidenceInfo.className = 'confidence-info'
    
    const confidencePercent = Math.round(action.confidence * 100)
    const confidenceClass = getConfidenceClass(action.confidence)
    
    confidenceInfo.innerHTML = `
      <span class="confidence-label">置信度:</span>
      <div class="confidence-bar">
        <div class="confidence-fill ${confidenceClass}" style="width: ${confidencePercent}%"></div>
      </div>
      <span class="confidence-value">${confidencePercent}%</span>
    `
    
    container.appendChild(confidenceInfo)
  }
  
  // Create action buttons
  const actionsDiv = document.createElement('div')
  actionsDiv.className = 'tooltip-actions'
  
  const applyBtn = document.createElement('button')
  applyBtn.className = 'btn-apply'
  applyBtn.textContent = getApplyButtonTextForAction(action)
  applyBtn.setAttribute('data-action', 'apply')
  
  const ignoreBtn = document.createElement('button')
  ignoreBtn.className = 'btn-ignore'
  ignoreBtn.textContent = '忽略'
  ignoreBtn.setAttribute('data-action', 'ignore')
  
  actionsDiv.appendChild(applyBtn)
  actionsDiv.appendChild(ignoreBtn)
  container.appendChild(actionsDiv)
  
  return container
}

/**
 * Create a virtual reference element for better positioning
 * @param {EditorView} view - ProseMirror editor view
 * @param {number} from - Start position
 * @param {number} to - End position
 * @returns {Object} - Virtual reference object for tippy
 */
function createVirtualReference(view, from, to) {
  return {
    getBoundingClientRect() {
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)
      
      return {
        left: start.left,
        top: start.top,
        right: end.right,
        bottom: end.bottom,
        width: end.right - start.left,
        height: end.bottom - start.top,
        x: start.left,
        y: start.top
      }
    }
  }
}

/**
 * Show tooltip using tippy.js with proper positioning using ProseMirror coordinates
 * @param {Object} action - Error action data
 * @param {Object} range - Error range in document
 * @param {HTMLElement} targetElement - Element to attach tooltip to (fallback)
 */
function showTooltip(action, range, targetElement) {
  console.log('Show tooltip for action:', action, 'at range:', range)
  
  // Hide existing tooltip
  hideTooltip()
  
  if (!view) {
    console.warn('No editor view available')
    return
  }
  
  // Create virtual reference using ProseMirror coordinates
  const virtualRef = createVirtualReference(view, range.from, range.to)
  const testRect = virtualRef.getBoundingClientRect()
  console.log('Virtual reference rect:', testRect)
  
  // Validate coordinates
  if (testRect.width === 0 && testRect.height === 0) {
    console.warn('Invalid coordinates, falling back to target element')
    if (!targetElement) return
    
    const rect = targetElement.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      console.warn('Target element also has no dimensions')
      return
    }
  }
  
  // Create DOM content for tooltip
  const tooltipContent = createTooltipContent(action)
  
  // Create tippy instance with virtual reference
  currentTippyInstance = tippy(document.body, {
    content: tooltipContent,
    allowHTML: true,
    interactive: true,
    trigger: 'manual',
    placement: 'top-start',
    theme: 'syntax-correction',
    arrow: true,
    offset: [0, 8],
    appendTo: document.body,
    getReferenceClientRect: () => virtualRef.getBoundingClientRect(),
    hideOnClick: false,
    onShow(instance) {
      const rect = instance.reference.getBoundingClientRect()
      console.log('Tippy tooltip shown with reference rect:', rect)
    },
    onHide() {
      console.log('Tippy tooltip hidden')
    },
    onClickOutside() {
      hideTooltip()
    }
  })
  
  // Add event listeners to tooltip buttons using event delegation
  tooltipContent.addEventListener('click', (e) => {
    const button = e.target.closest('button')
    if (!button) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const actionType = button.getAttribute('data-action')
    if (actionType === 'apply') {
      applySuggestion(action, range)
    } else if (actionType === 'ignore') {
      ignoreSuggestion(action)
    }
  })
  
  // Show the tooltip
  currentTippyInstance.show()
}

/**
 * Hide tooltip and cleanup
 */
function hideTooltip() {
  if (currentTippyInstance) {
    currentTippyInstance.destroy()
    currentTippyInstance = null
  }
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
 * Get display text for the action context
 * @param {Object} action - Error action data
 * @returns {string} - Text to display in tooltip
 */
function getDisplayTextForAction(action) {
  if (!action.action.startsWith('$APPEND_')) {
    return action.original || ''
  }
  
  // For append operations, try to get context from view
  if (view) {
    // This is a simplified version - you might want to enhance this
    // based on your specific append logic
    return '此处'
  }
  
  return '此处'
}

/**
 * Get appropriate button text based on action type
 * @param {Object} action - Error action data
 * @returns {string} - Button text
 */
function getApplyButtonTextForAction(action) {
  if (!action) return '应用修改'
  
  if (action.action.startsWith('$APPEND_')) {
    return '添加'
  } else if (action.action === '$DELETE') {
    return '删除'
  } else {
    return '替换'
  }
}

/**
 * Get CSS class for confidence level
 * @param {number} confidence - Confidence value (0-1)
 * @returns {string} - CSS class name
 */
function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'confidence-high'
  if (confidence >= 0.6) return 'confidence-medium'
  return 'confidence-low'
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
       * Handle click events with improved positioning using ProseMirror coordinates
       */
      function handleClick(view, pos, event) {
        console.log('ProseMirror click at position:', pos, 'event target:', event.target)
        
        // Check if we clicked on a syntax error highlight
        const clickedElement = event.target
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
            
            // Use ProseMirror coordinates for positioning instead of DOM element
            showTooltip(spec.errorAction, spec.errorRange, syntaxErrorElement)
            return true
          }
        }
        
        hideTooltip()
        return false
      }
      
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
  initialContent.innerHTML = '<p>hello world, my name is a lili. Here is apple.</p>'

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