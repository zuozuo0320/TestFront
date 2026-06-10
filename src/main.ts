import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import type { Language } from 'element-plus/es/locale'
import 'element-plus/dist/index.css'
import './styles/variables.css'
import './styles/icon-fonts.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/layout-enhance.css'
import './styles/animations.css'
import './styles/ai-script.css'
import router from './router'
import App from './App.vue'
import { initializeTheme } from './composables/useTheme'

initializeTheme()
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn as unknown as Language })
app.mount('#app')
