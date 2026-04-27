import { createRouter, createWebHashHistory } from 'vue-router'

const ToolsView = () => import('@renderer/views/ToolsView.vue')
const AiChatView = () => import('@renderer/views/AiChatView.vue')
const CommandsView = () => import('@renderer/views/CommandsView.vue')
const CredentialsView = () => import('@renderer/views/CredentialsView.vue')
const PromptsView = () => import('@renderer/views/PromptsView.vue')
const DataCenterView = () => import('@renderer/views/DataCenterView.vue')
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
      path: '/data-center',
      name: 'data-center',
      component: DataCenterView
    },
    {
      path: '/backup',
      redirect: '/data-center'
    },
    {
      path: '/legacy-import',
      redirect: '/data-center'
    },
    {
      path: '/ai',
      name: 'ai',
      component: AiChatView
    }
  ]
})
