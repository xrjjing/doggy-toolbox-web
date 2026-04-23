import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '@renderer/views/DashboardView.vue'
import ToolsView from '@renderer/views/ToolsView.vue'
import AiChatView from '@renderer/views/AiChatView.vue'
import MigrationPlanView from '@renderer/views/MigrationPlanView.vue'
import CommandsView from '@renderer/views/CommandsView.vue'
import CredentialsView from '@renderer/views/CredentialsView.vue'
import PromptsView from '@renderer/views/PromptsView.vue'
import BackupView from '@renderer/views/BackupView.vue'
import LegacyImportPage from '@renderer/views/LegacyImportView.vue'
import NodesView from '@renderer/views/NodesView.vue'
import HttpCollectionsView from '@renderer/views/HttpCollectionsView.vue'

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
      path: '/nodes',
      name: 'nodes',
      component: NodesView
    },
    {
      path: '/http',
      name: 'http-collections',
      component: HttpCollectionsView
    },
    {
      path: '/backup',
      name: 'backup',
      component: BackupView
    },
    {
      path: '/legacy-import',
      name: 'legacy-import',
      component: LegacyImportPage
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
