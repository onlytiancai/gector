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
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-menu/style/menu.css'

const editor = ref(null)
let view = null

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

async function fetchSyntaxCheck(sentText) {
  const resp = await fetch('/api/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence: sentText })
  })
  const data = await resp.json()
  const ranges = []
  for (const action of data.actions) {
    if (action.token_end !== undefined && action.token_start !== undefined) {
      ranges.push({ from: action.token_start, to: action.token_end })
    }
  }
  return ranges
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
 * 根据语法错误范围生成装饰
 * @param {Node} doc - ProseMirror 的文档根节点
 * @param {Array<{from: number, to: number}>} ranges - 错误范围
 * @returns {DecorationSet}
 */
function getSyntaxErrorDecorations(doc, ranges) {
  const decorations = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const textLen = node.text.length
      for (const { from, to } of ranges) {
        // 只高亮当前节点范围内的错误
        const nodeFrom = Math.max(0, from - pos)
        const nodeTo = Math.min(textLen, to - pos)
        console.log('Node from:', nodeFrom, 'to:', nodeTo, 'textLen:', textLen)
        if (nodeFrom < nodeTo && nodeFrom < textLen && nodeTo > 0) {
          console.log('Adding syntax error decoration from', pos + nodeFrom, 'to', pos + nodeTo)
          decorations.push(
            Decoration.inline(pos + nodeFrom, pos + nodeTo, { class: 'syntax-error-highlight' })
          )
        }
      }
    }
  })
  return DecorationSet.create(doc, decorations)
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
  // 用于存储当前的 DecorationSet
  let currentDeco = DecorationSet.empty
  return new Plugin({
    key: new PluginKey('syntax-check'),
    state: {
      init(_, { doc }) {
        currentDeco = DecorationSet.empty
        return currentDeco
      },
      apply(tr, old, oldState, newState) {
        // 检查是否有新的装饰通过 tr.meta 传递
        const newDeco = tr.getMeta('syntax-check-update')
        if (newDeco) {
          currentDeco = newDeco
          return currentDeco
        }
        // 只在文档变更时清空装饰，等待异步检查
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
          console.log('Syntax check ranges:', ranges)
          if (destroyed) return
          const deco = getSyntaxErrorDecorations(editorView.state.doc, ranges)
          // 通过tr更新装饰
          const tr = editorView.state.tr.setMeta('syntax-check-update', deco)
          editorView.dispatch(tr)
        } catch (e) {
          console.error('Syntax check error:', e)
        } finally {
          if (destroyed) return
        }
      }
      function scheduleCheck() {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(check, 400)
      }
      editorView.setProps({
        handleDOMEvents: {
          input: () => { scheduleCheck(); return false }
        }
      })
      // 首次检查
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
        }
      }
    }
  })
}

/**
 * 合并所有插件的装饰集合
 */
function combineDecorationsPlugin() {
  // 将 highlightPluginKey 和 syntaxPluginKey 提前定义并复用
  const syntaxPluginKey = new PluginKey('syntax-check')
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
  initialContent.innerHTML = '<p>这是初始化文字。</p>'

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
}
</style>