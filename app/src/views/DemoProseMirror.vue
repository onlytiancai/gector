<template>
  <div ref="editor"></div>
</template>

<script setup>
import { onMounted, ref, onBeforeUnmount } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema, DOMParser } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { exampleSetup } from 'prosemirror-example-setup'
import { Plugin } from 'prosemirror-state'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-menu/style/menu.css'

const editor = ref(null)
let view = null


function trChanged(view, tr) {
  // 打印被改动的节点文本和类型
  tr.mapping.maps.forEach((stepMap) => {
    stepMap.forEach((from, to) => {
      view.state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.isTextblock || node.isText) {
          console.log('Changed node type:', node.type.name, 'text:', node.textContent)
        }
      })
    })
  })
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
</style>