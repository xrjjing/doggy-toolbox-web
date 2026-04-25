import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { installBrowserBridge } from './bridge/browser-bridge'
import './styles/theme.css'

installBrowserBridge()

createApp(App).use(createPinia()).use(router).mount('#app')
