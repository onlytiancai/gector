<template>
  <div class="editor-area">
    <div
      class="editor"
      contenteditable="true"
      spellcheck="false"
      ref="editor"
      v-html="editorHtml"
      @input="onInput"
      @keydown.enter.stop
      @click="onEditorClick"
    ></div>
  </div>
</template>

<script setup>
import { watch, onMounted, nextTick, ref } from 'vue'
const props = defineProps({
  editorHtml: String,
})
const emits = defineEmits(['input', 'editorClick'])
function onInput(e) {
  emits('input', e)
}
function onEditorClick(e) {
  emits('editorClick', e)
}
// 保证每次 editorHtml 变化后光标在末尾
const editorRef = ref(null)
onMounted(() => {
  watch(() => props.editorHtml, () => {
    nextTick(() => {
      const el = editorRef.value
      if (el && document.activeElement === el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    })
  })
})
</script>

<style scoped>
.editor-area {
  position: relative;
  margin-bottom: 18px;
  flex: 1;
  min-width: 0;
  /* 不居中，去除 place-items:center 等 */
}
.editor {
  min-height: 90px;
  width: 100%;
  border: 1.5px solid #c3c8d1;
  border-radius: 8px;
  padding: 14px 12px;
  font-size: 1.1rem;
  outline: none;
  transition: border 0.2s;
  background: #fafdff;
  text-align: left;
  /* 不居中 */
  word-break: break-word;
  white-space: pre-wrap;
}
.editor:focus {
  border-color: #4f8cff;
  background: #fff;
}
.suggestion {
  position: relative;
  display: inline-block;
  background: #fffbe6;
  border-bottom: 2px dotted #f7b500;
  border-radius: 2px;
  box-shadow: 0 2px 8px #f7b50022;
  transition: background 0.18s;
}
.suggestion.highlight {
  background: #ffeaea;
  border-bottom: 2px solid #e74c3c;
  box-shadow: 0 2px 8px #e74c3c22;
}
.suggestion:hover {
  background: #fff3c1;
}
.underline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  background: linear-gradient(to right, #f7b500 60%, transparent 0%);
  background-size: 6px 2px;
  background-repeat: repeat-x;
  border-radius: 1px;
  pointer-events: none;
}
</style>
