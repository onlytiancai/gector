<template>
  <div style="margin-top:28px;">
    <div style="font-weight:bold;margin-bottom:6px;">History (last 10)</div>
    <div v-if="historyList.length === 0" style="color:#aaa;">No history yet.</div>
    <div v-for="(h, idx) in historyList" :key="idx" style="display:flex;align-items:center;margin-bottom:4px;">
      <button
        style="margin-right:8px;padding:2px 10px;border-radius:4px;border:none;background:#eee;cursor:pointer;font-size:0.98em;"
        @click="$emit('applyHistory', idx)"
      >Use</button>
      <span style="white-space:pre-wrap;word-break:break-all;color:#555;">{{ h }}</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  historyList: Array
})
</script>
