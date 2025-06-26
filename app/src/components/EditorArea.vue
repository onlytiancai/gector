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
</script>

<style scoped>
.editor-area {
  position: relative;
  margin-bottom: 18px;
  flex: 1;
  min-width: 0;
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
}
.editor:focus {
  border-color: #4f8cff;
  background: #fff;
}
</style>
