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
const editor = ref(null)

function getCaretCharacterOffsetWithin(element) {
  let caretOffset = 0
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const preCaretRange = range.cloneRange()
    preCaretRange.selectNodeContents(element)
    preCaretRange.setEnd(range.endContainer, range.endOffset)
    caretOffset = preCaretRange.toString().length
  }
  return caretOffset
}

function logCaretPosition() {
  const el = editor.value
  if (!el) {
    console.warn('Editor element not found')
    return
  }
  
  const offset = getCaretCharacterOffsetWithin(el)
  console.log('Caret character offset:', offset)
}

function onInput(e) {
  emits('input', e)
  logCaretPosition()
}
function onEditorClick(e) {
  emits('editorClick', e)
  logCaretPosition()
}
onMounted(() => {
  console.log('onMounted editor.value:', editor.value)
  watch(() => props.editorHtml, () => {
    console.log('Editor HTML updated:', props.editorHtml)
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
