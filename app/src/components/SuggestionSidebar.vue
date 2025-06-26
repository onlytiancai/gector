<template>
  <div class="sidebar">
    <div class="sidebar-title">Suggestions</div>
    <div class="actions-bar" style="margin-bottom:10px;">
      <template v-if="actions && actions.length">
        {{ actions.length }} suggestion{{ actions.length > 1 ? 's' : '' }} found.
      </template>
      <template v-else>
        <span style="color:#27ae60;font-weight:600;">Grammar is correct!</span>
      </template>
    </div>
    <div class="sidebar-list">
      <div
        v-for="(act, idx) in actions"
        :key="idx"
        class="sidebar-item"
        :data-active="hoveredSidebarIdx === idx"
        @mouseenter="$emit('update:hoveredSidebarIdx', idx)"
        @mouseleave="$emit('update:hoveredSidebarIdx', null)"
      >
        <div>
          <b>Type:</b>
          <span v-if="act.action === '$DELETE'">Delete</span>
          <span v-else-if="act.action.startsWith('$APPEND_')">Append</span>
          <span v-else-if="act.action.startsWith('$TRANSFORM_')">Transform</span>
          <span v-else-if="act.action.startsWith('$REPLACE_')">Replace</span>
          <span v-else>{{ act.action }}</span>
        </div>
        <div><b>Original:</b> <i>{{ act.original }}</i></div>
        <div><b>Suggestion:</b> <i>{{ act.real_replacement }}</i></div>    
        <div><b>Confidence:</b> {{ Math.round(act.confidence * 100) }}%</div>
        <div v-if="act.action"><b>Action:</b> {{ act.action }}</div>
        <button
          class="apply-btn"
          v-if="hoveredSidebarIdx === idx"
          @click="$emit('applySidebarSuggestion', idx)"
        >Apply</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  actions: Array,
  hoveredSidebarIdx: Number
})
</script>

<style scoped>
.sidebar {
  position: static;
  margin-left: 36px;
  width: 320px;
  max-height: 70vh;
  background: #fafdff;
  border: 1.5px solid #c3c8d1;
  border-radius: 10px;
  box-shadow: 0 2px 12px #0001;
  padding: 16px 14px 12px 14px;
  overflow-y: auto;
  z-index: 1;
}
.sidebar-title {
  font-weight: bold;
  font-size: 1.08rem;
  margin-bottom: 10px;
  color: #4f8cff;
}
.actions-bar {
  margin-bottom: 10px;
}
.sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sidebar-item {
  background: #fffbe6;
  border-left: 4px solid #f7b500;
  border-radius: 5px;
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.98rem;
  margin-bottom: 4px;
  position: relative;
}
.sidebar-item:hover {
  background: #fff3c1;
}
.apply-btn {
  display: none;
  position: absolute;
  right: 12px;
  top: 10px;
  background: #4f8cff;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 3px 12px;
  font-size: 0.97em;
  cursor: pointer;
  font-weight: 600;
  z-index: 2;
  transition: background 0.18s;
}
.sidebar-item:hover .apply-btn {
  display: inline-block;
}
.apply-btn:active {
  background: #2562c7;
}
.sidebar-item.active,
.sidebar-item[data-active="true"] {
  background: #e6f0ff !important;
  border-left-color: #4f8cff !important;
}
.sidebar-item.active .apply-btn,
.sidebar-item[data-active="true"] .apply-btn {
  display: inline-block;
}
</style>
