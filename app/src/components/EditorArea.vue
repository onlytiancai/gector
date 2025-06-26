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
const editorRef = ref(null)
function onInput(e) {
  emits('input', e)
}
function onEditorClick(e) {
  emits('editorClick', e)
}
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
  max-width: 700px;
}
.editor {
  min-height: 90px;
  width: 100%;
  max-width: 700px;
  border: 1.5px solid #c3c8d1;
  border-radius: 8px;
  padding: 14px 12px;
  font-size: 1.1rem;
  outline: none;
  transition: border 0.2s;
  background: #fafdff;
  text-align: left;
  word-break: break-word;
  white-space: pre-wrap;
  box-sizing: border-box;
}
.editor:focus {
  border-color: #4f8cff;
  background: #fff;
}

</style>
