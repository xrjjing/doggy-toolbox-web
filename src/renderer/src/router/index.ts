import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '@renderer/views/DashboardView.vue'
import ToolsView from '@renderer/views/ToolsView.vue'
import AiChatView from '@renderer/views/AiChatView.vue'
import MigrationPlanView from '@renderer/views/MigrationPlanView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView
    },
    {
      path: '/tools',
      name: 'tools',
      component: ToolsView
    },
    {
      path: '/ai',
      name: 'ai',
      component: AiChatView
    },
    {
      path: '/plan',
      name: 'plan',
      component: MigrationPlanView
    }
  ]
})
