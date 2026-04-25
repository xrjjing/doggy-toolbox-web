import { createRouter, createWebHashHistory } from 'vue-router'

const ToolsView = () => import('@renderer/views/ToolsView.vue')
const AiChatView = () => import('@renderer/views/AiChatView.vue')
const CommandsView = () => import('@renderer/views/CommandsView.vue')
const CredentialsView = () => import('@renderer/views/CredentialsView.vue')
const PromptsView = () => import('@renderer/views/PromptsView.vue')
const BackupView = () => import('@renderer/views/BackupView.vue')
const LegacyImportPage = () => import('@renderer/views/LegacyImportView.vue')
const HttpCollectionsView = () => import('@renderer/views/HttpCollectionsView.vue')

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/tools'
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
    }
  ]
})
