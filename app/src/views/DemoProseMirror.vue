<template>
  <div ref="editor"></div>
</template>

<script setup>

import { onMounted, ref } from 'vue'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { Schema, DOMParser } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { exampleSetup } from 'prosemirror-example-setup'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-menu/style/menu.css'

const editor = ref(null)
let view = null

onMounted(() => {
  // 定义初始化内容
  const initialContent = document.createElement('div')
  initialContent.innerHTML = '<p>这是初始化文字。</p>'

  // 创建编辑器状态
  const state = EditorState.create({
    doc: DOMParser.fromSchema(basicSchema).parse(initialContent),
    plugins: exampleSetup({ schema: basicSchema })
  })

  // 创建编辑器视图
  view = new EditorView(editor.value, {
    state
  })
})
</script>

<style>
.ProseMirror {
  min-height: 200px;
  border: 1px solid #ccc;
  padding: 10px;
  outline: none;
  width: 600px;
}
</style>