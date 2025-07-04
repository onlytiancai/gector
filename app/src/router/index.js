import { createRouter, createWebHistory } from 'vue-router'
import DemoProseMirror from '../views/DemoProseMirror.vue'
// ... 其他页面import

const routes = [
  {
    path: '/demo',
    name: 'DemoProseMirror',
    component: DemoProseMirror
  },
  // 你可以在这里添加其他页面路由
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
