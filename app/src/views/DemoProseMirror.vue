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
 * 遍历整个 ProseMirror 文档，查找所有包含字母 "h" 的单词，并为这些单词生成装饰（Decoration）。
 * 
 * ProseMirror 的文档（doc）是一个树状结构，由节点（Node）组成。
 * 该函数会递归遍历所有节点，定位到文本节点（isText），
 * 然后用正则表达式匹配所有包含 "h" 的单词（\b\w*h\w*\b，忽略大小写）。
 * 
 * 对每个匹配到的单词，计算其在文档中的绝对位置（from, to），
 * 并创建一个 inline 类型的装饰（Decoration.inline），
 * 这样这些单词就会被高亮显示（通过 class: 'h-word-highlight'）。
 * 
 * 返回值是 DecorationSet，ProseMirror 用它来管理和渲染所有装饰。
 * 
 * @param {Node} doc - ProseMirror 的文档根节点
 * @returns {DecorationSet} - 包含所有高亮装饰的集合
 */
function getHWordDecorations(doc) {
  const decorations = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text
      if (!text) return
      // 匹配所有包含h的单词（忽略大小写）
      const regex = /\b\w*h\w*\b/gi
      let match
      while ((match = regex.exec(text)) !== null) {
        // 计算单词在整个文档中的绝对位置
        const from = pos + match.index
        const to = from + match[0].length
        // 创建一个内联装饰，应用高亮样式
        decorations.push(
          Decoration.inline(from, to, { class: 'h-word-highlight' })
        )
      }
    }
  })
  // 返回所有装饰的集合
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
    },
    props: {
      /**
       * 返回当前状态下的装饰集合，供ProseMirror渲染。
       * @param {*} state - 当前编辑器状态
       * @returns DecorationSet
       */
      decorations(state) {
        return this.getState(state)
      }
    }
  })
}

const highlightPluginKey = new PluginKey('highlight-h-words')

function trChanged(view, tr) {
  console.log('Transaction changed:', tr)
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
            console.log('Changed node type:', node.type.name, 'text:', node.textContent)
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
</style>