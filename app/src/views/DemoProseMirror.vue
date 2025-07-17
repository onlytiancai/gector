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
 * Split text into sentences using simple punctuation-based rules
 * @param {string} text - Text to split
 * @returns {Array<{text: string, offset: number}>} - Array of sentences with their offsets
 */
function splitIntoSentences(text) {
  const sentences = []
  const sentenceRegex = /[.!?]+/g
  let lastIndex = 0
  let match
  
  while ((match = sentenceRegex.exec(text)) !== null) {
    const endIndex = match.index + match[0].length
    const sentence = text.slice(lastIndex, endIndex).trim()
    
    if (sentence.length > 0) {
      sentences.push({
        text: sentence,
        offset: lastIndex
      })
    }
    
    lastIndex = endIndex
  }
  
  // Handle remaining text if no punctuation at the end
  const remaining = text.slice(lastIndex).trim()
  if (remaining.length > 0) {
    sentences.push({
      text: remaining,
      offset: lastIndex
    })
  }
  
  return sentences
}

// Cache for sentence syntax check results
const sentenceCache = new Map()

/**
 * 缓存 grammar check API 的应答
 * @type {Map<string, Object>}
 */
const grammarCheckApiCache = new Map()

/**
 * Call the grammar check API for a sentence, with response caching.
 * @param {string} sentenceText
 * @returns {Promise<Object>} API response
 */
async function callGrammarCheckApi(sentenceText) {
  const cacheKey = sentenceText.trim()
  if (grammarCheckApiCache.has(cacheKey)) {
    return grammarCheckApiCache.get(cacheKey)
  }
  try {
    const resp = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence: sentenceText })
    })
    const data = await resp.json()
    grammarCheckApiCache.set(cacheKey, data)
    return data
  } catch (error) {
    console.error('Grammar check API failed:', error)
    throw error
  }
}

/**
 * 解析 API 返回的 actions，生成 ranges
 * @param {Array} actions - API返回的actions
 * @param {number} sentenceAbsolutePos - 句子在文档中的绝对位置
 * @returns {Array}
 */
function parseApiActionsToRanges(actions, sentenceAbsolutePos) {
  const ranges = []
  for (const action of actions) {
    if (action.token_end !== undefined && action.token_start !== undefined) {
      const absoluteStart = sentenceAbsolutePos + action.token_start
      const absoluteEnd = sentenceAbsolutePos + action.token_end
      const errorKey = `${absoluteStart}-${absoluteEnd}-${action.original}`

      if (!ignoredErrors.has(errorKey)) {
        ranges.push({ 
          from: absoluteStart, 
          to: absoluteEnd,
          action: {
            ...action,
            absolute_token_start: absoluteStart,
            absolute_token_end: absoluteEnd
          }
        })
      }
    }
  }
  return ranges
}

/**
 * Fetch syntax check for individual sentence with caching
 * @param {string} sentenceText - Text content of the sentence
 * @param {number} sentenceAbsolutePos - Absolute position of the sentence in the document
 * @returns {Promise<Array>} - Error ranges with absolute positions
 */
async function fetchSentenceSyntaxCheck(sentenceText, sentenceAbsolutePos) {
  console.log('fetchSentenceSyntaxCheck:', sentenceText, 'at absolute position:', sentenceAbsolutePos)
  try {
    const data = await callGrammarCheckApi(sentenceText)
    const ranges = parseApiActionsToRanges(data.actions, sentenceAbsolutePos)
    return ranges
  } catch (error) {
    console.error('Sentence syntax check failed:', error)
    return []
  }
}

/**
 * Fetch syntax check for individual text node with sentence-based caching
 * @param {string} nodeText - Text content of the node
 * @param {number} nodePos - Position of the node in the document
 * @returns {Promise<Array>} - Error ranges with absolute positions
 */
async function fetchTextNodeSyntaxCheck(nodeText, nodePos) {
  console.log('fetchTextNodeSyntaxCheck:', nodeText, 'at position:', nodePos)
  const sentences = splitIntoSentences(nodeText)
  console.log('Split into sentences:', sentences)
  const allRanges = []
  const checkPromises = []
  for (const sentence of sentences) {
    const promise = fetchSentenceSyntaxCheck(sentence.text, nodePos + sentence.offset)
      .then(ranges => {
        allRanges.push(...ranges)
      })
      .catch(error => {
        console.error(`Failed to check sentence "${sentence.text}":`, error)
      })
    checkPromises.push(promise)
  }
  await Promise.all(checkPromises)
  console.log(`fetchTextNodeSyntaxCheck completed. Total ranges: ${allRanges.length}`)
  return allRanges
}

/**
 * Check syntax for all text nodes in the document
 * @param {Node} doc - ProseMirror document
 * @returns {Promise<Array>} - All error ranges across all text nodes
 */
async function checkAllTextNodes(doc) {
  const allRanges = []
  const checkPromises = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text && node.text.trim()) {
      console.log(`checkAllTextNodes: pos=${pos}, node.type=${node.type.name}, node.text=[${node.text}]`)
      const promise = fetchTextNodeSyntaxCheck(node.text, pos)
        .then(ranges => {
          allRanges.push(...ranges)
        })
        .catch(error => {
          console.error(`Failed to check text node at position ${pos}:`, error)
        })
      checkPromises.push(promise)
    }
  })
  await Promise.all(checkPromises)
  console.log(`checkAllTextNodes completed. Total ranges: ${allRanges.length}, Cache size: ${grammarCheckApiCache.size}`)
  return allRanges
}

/**
 * Generate syntax error decorations with proper position mapping
 * @param {Node} doc - ProseMirror document
 * @param {Array} ranges - Error ranges with absolute positions
 * @returns {DecorationSet}
 */
function getSyntaxErrorDecorations(doc, ranges) {
  const decorations = []
  
  // Create decorations directly from absolute positions
  for (const range of ranges) {
    const { from, to, action } = range
    
    // Validate positions are within document bounds
    if (from >= 0 && to <= doc.content.size && from < to) {
      try {
        decorations.push(
          Decoration.inline(from, to, {
            class: 'syntax-error-highlight',
          }, {
            // Store in spec for internal access
            errorAction: action,
            errorRange: { from, to }
          })
        )
        console.log(`Created decoration: ${from}-${to} for "${action.original}"`)
      } catch (error) {
        console.error(`Failed to create decoration for range ${from}-${to}:`, error)
      }
    } else {
      console.warn(`Invalid range: ${from}-${to}, doc size: ${doc.content.size}`)
    }
  }
  
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

  const errorKey = `${action.absolute_token_start}-${action.absolute_token_end}-${action.original}`
  ignoredErrors.add(errorKey)
  
  
  // Trigger re-check to update decorations
  if (view) {
    checkAllTextNodes(view.state.doc).then(ranges => {
      const deco = getSyntaxErrorDecorations(view.state.doc, ranges)
      const tr = view.state.tr.setMeta('syntax-check-update', deco)
      view.dispatch(tr)
    }).catch(console.error)
  }
  
  hideTooltip()
}

/**
 * 分析并打印文档变化中的文本节点修改信息
 * @param {Transaction} tr - ProseMirror事务
 * @param {Node} oldDoc - 修改前的文档
 * @param {Node} newDoc - 修改后的文档
 */
function analyzeTextNodeChanges(tr, oldDoc, newDoc) {
  if (!tr.docChanged) return

  console.group('📝 Text Node Changes Detected')
  
  // 遍历事务中的所有步骤
  tr.steps.forEach((step, stepIndex) => {
    console.log(`\n--- Step ${stepIndex + 1} ---`)
    console.log('Step type:', step.constructor.name)
    console.log('Step JSON:', step.toJSON())
    
    if (step.from !== undefined && step.to !== undefined) {
      /*
      from和to 通常指的是 ProseMirror 的“步骤”（step）对象中的位置。
      它们表示在文档中要应用更改的起始位置（from）和结束位置（to）。

      具体来说：

      from：更改开始的位置（偏移量，通常是字符或节点索引）。
      to：更改结束的位置。
      这两个位置是针对**旧文档（oldDoc）**的，因为步骤（step）是在旧文档上定义的操作，
      应用后才得到新文档（newDoc）。
      换句话说，step 的 from 和 to 是描述如何从 oldDoc 变成 newDoc 的位置范围。

      补充说明：
      如果你在处理 ProseMirror 的 transaction 或 step，
      通常这些位置都是基于应用更改前的文档（即 oldDoc）。      
      */
      const from = step.from
      const to = step.to
      
      console.log(`Position range: ${from} → ${to}`)
      // 只收集 from 和 to 之间的所有节点
      const nodesBetween = []

      oldDoc.descendants((node, pos, parent) => {
        if (pos + node.nodeSize > from && pos < to) {
          nodesBetween.push({ node, pos, parent })
        }
      })

      // 输出 from 和 to 之间的所有节点信息
      console.log('Nodes between from and to:', nodesBetween.map(info => ({
        type: info.node.type.name,
        pos: info.pos,
        text: info.node.isText ? info.node.text : null,
        nodeSize: info.node.nodeSize
      })))
      
      // 获取修改前的内容
      if (from <= oldDoc.content.size && to <= oldDoc.content.size) {
        const oldSlice = oldDoc.slice(from, to)
        console.log('Old content:', {
          size: oldSlice.size,
          content: oldSlice.content.toString(),
          textContent: oldSlice.content.textBetween(0, oldSlice.content.size)
        })
        
        // 分析旧内容中的节点
        oldSlice.content.forEach((node, offset) => {
          console.log(`  Old node at offset ${offset}:`, {
            type: node.type.name,
            isText: node.isText,
            content: node.isText ? `"${node.text}"` : node.content.toString(),
            size: node.nodeSize
          })
        })
      }
      
      // 获取修改后的内容（如果是替换操作）
      if (step.slice) {
        const newSlice = step.slice
        console.log('New content:', {
          size: newSlice.size,
          content: newSlice.content.toString(),
          textContent: newSlice.content.textBetween(0, newSlice.content.size)
        })
        
        // 分析新内容中的节点
        newSlice.content.forEach((node, offset) => {
          console.log(`  New node at offset ${offset}:`, {
            type: node.type.name,
            isText: node.isText,
            content: node.isText ? `"${node.text}"` : node.content.toString(),
            size: node.nodeSize
          })
        })
      }
    }
  })
  
  // 额外分析：比较整个文档的文本节点变化
  console.log('\n--- Document Text Nodes Comparison ---')
  const oldTextNodes = extractTextNodes(oldDoc)
  const newTextNodes = extractTextNodes(newDoc)
  
  console.log('Old text nodes:', oldTextNodes)
  console.log('New text nodes:', newTextNodes)
  
  // 找出变化的文本节点
  const changes = findTextNodeChanges(oldTextNodes, newTextNodes)
  if (changes.length > 0) {
    console.log('Detected text node changes:', changes)
  }
  
  console.groupEnd()
}

/**
 * 提取文档中所有文本节点的信息
 * @param {Node} doc - ProseMirror文档
 * @returns {Array} 文本节点信息数组
 */
function extractTextNodes(doc) {
  const textNodes = []
  
  doc.descendants((node, pos) => {
    if (node.isText) {
      textNodes.push({
        position: pos,
        text: node.text,
        length: node.text.length,
        type: node.type.name
      })
    }
  })
  
  return textNodes
}

/**
 * 比较两组文本节点，找出变化
 * @param {Array} oldNodes - 修改前的文本节点
 * @param {Array} newNodes - 修改后的文本节点
 * @returns {Array} 变化信息数组
 */
function findTextNodeChanges(oldNodes, newNodes) {
  const changes = []
  
  // 简单的变化检测：比较数量和内容
  if (oldNodes.length !== newNodes.length) {
    changes.push({
      type: 'count_change',
      oldCount: oldNodes.length,
      newCount: newNodes.length
    })
  }
  
  // 比较相同位置的节点内容
  const maxLength = Math.max(oldNodes.length, newNodes.length)
  for (let i = 0; i < maxLength; i++) {
    const oldNode = oldNodes[i]
    const newNode = newNodes[i]
    
    if (!oldNode && newNode) {
      changes.push({
        type: 'added',
        index: i,
        node: newNode
      })
    } else if (oldNode && !newNode) {
      changes.push({
        type: 'removed',
        index: i,
        node: oldNode
      })
    } else if (oldNode && newNode && oldNode.text !== newNode.text) {
      changes.push({
        type: 'modified',
        index: i,
        oldNode: oldNode,
        newNode: newNode,
        oldText: oldNode.text,
        newText: newNode.text
      })
    }
  }
  
  return changes
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
      /**
       * Applies a transformation to the editor state.
       * 
       * @param {Transaction} tr - The ProseMirror transaction object representing changes to be applied.
       * @param {any} old - The previous value or state before the transaction.
       * @param {EditorState} oldState - The previous ProseMirror editor state.
       * @param {EditorState} newState - The new ProseMirror editor state after the transaction.
       * @returns {any} The updated value or state after applying the transaction.
       */
      apply(tr, old, oldState, newState) {
        // 🆕 添加文本节点变化分析
        //if (tr.docChanged) {
        //  analyzeTextNodeChanges(tr, oldState.doc, newState.doc)
        //}

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
        try {
          const ranges = await checkAllTextNodes(editorView.state.doc)
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
          /*
          DOM事件驱动: 直接响应浏览器的原生 input DOM事件
          更早触发: 在用户键盘输入、粘贴等操作时立即触发
          更广泛覆盖: 捕获所有可能的输入操作，包括一些ProseMirror可能未完全处理的边缘情况
          DOM层面: 在DOM事件层面工作
          */
          input: () => { 
            scheduleCheck(); 
            return false 
          }
        },
        handleClick: handleClick
      })
      /*
      这里调用 scheduleCheck() 通常是为了在组件初始化时进行一次文本检查。
      这样可以确保页面刚加载或内容刚渲染时，用户看到的文本已经被检查过语法或错误，而不是等到用户操作后才开始检查。

      常见场景：
      - 页面首次加载时自动检查已有内容。
      - 初始化编辑器时确保内容状态是最新的。
      
      注意事项：
      - 如果 scheduleCheck() 里有异步操作或依赖于某些数据，建议放在合适的生命周期钩子（如 onMounted）里调用。
      - 如果内容为空或不需要检查，可以加条件判断，避免无效检查。
      */
      scheduleCheck()
      
      return {
        /*
        这个 update(view, prevState) 函数通常是 ProseMirror 插件的 view 生命周期钩子之一。它会在编辑器的状态发生变化时被调用，比如：

        - 用户输入或删除文本
        - 文档内容发生变更（如插入、删除节点）
        - 编辑器状态（如 selection、marks）发生变化

        只有当文档内容（doc）发生变化时，才会执行 scheduleCheck()。这意味着：
        - 用户实际修改了文本内容时会触发
        - 光标移动、样式变化但内容未变时不会触发
        
        特点：
        - 状态变化驱动: 响应ProseMirror文档状态的变化
        - 有条件触发: 只有当文档内容真正改变时才触发（view.state.doc !== prevState.doc）
        - 更精确: 过滤掉光标移动、选择变化等不影响内容的操作
        - ProseMirror层面: 在编辑器状态层面工作

        为什么需要两个（handleDOMEvents.input和update(view, prevState)）？
        - 冗余保障: 防止某些边缘情况下的遗漏
        - 不同触发时机: DOM事件可能比状态更新更早触发
        - 不同覆盖范围: DOM事件覆盖更广，状态检查更精确
        - 防抖机制: 由于 scheduleCheck 内部有400ms防抖，多次调用不会造成性能问题

        即使两个地方都调用，最终只会在最后一次调用的400ms后执行一次检查，
        确保了性能优化的同时提供了可靠的触发保障。
        */
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
        //console.log('Syntax check decorations:', syntax)
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
  initialContent.innerHTML = '<p>hello world, my name is a lili.</p><p>here is a apple.</p>'

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