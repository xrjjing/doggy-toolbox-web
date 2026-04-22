import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '@renderer/views/DashboardView.vue'
import ToolsView from '@renderer/views/ToolsView.vue'
import AiChatView from '@renderer/views/AiChatView.vue'
import MigrationPlanView from '@renderer/views/MigrationPlanView.vue'
import CommandsView from '@renderer/views/CommandsView.vue'
import CredentialsView from '@renderer/views/CredentialsView.vue'
import PromptsView from '@renderer/views/PromptsView.vue'
import BackupView from '@renderer/views/BackupView.vue'

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
      path: '/commands',
      name: 'commands',
      component: CommandsView
    },
    {
      path: '/credentials',
      name: 'credentials',
      component: CredentialsView
    },
    {
      path: '/prompts',
      name: 'prompts',
      component: PromptsView
    },
    {
      path: '/backup',
      name: 'backup',
      component: BackupView
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
