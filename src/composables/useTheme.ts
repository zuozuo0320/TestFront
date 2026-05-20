import { computed, ref, watch } from 'vue'

export type AppTheme = 'default' | 'genart'

const THEME_STORAGE_KEY = 'tp-theme'
const currentTheme = ref<AppTheme>(readStoredTheme())
let initialized = false

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'default' || value === 'genart'
}

function readStoredTheme(): AppTheme {
  if (typeof localStorage === 'undefined') return 'default'

  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isAppTheme(value) ? value : 'default'
  } catch {
    return 'default'
  }
}

function storeTheme(theme: AppTheme) {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    return
  }
}

function applyTheme(theme: AppTheme) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.style.removeProperty('background')
  if (theme === 'default') {
    root.removeAttribute('data-theme')
    root.style.colorScheme = 'light'
    return
  }

  root.dataset.theme = theme
  root.style.colorScheme = 'dark'
}

/**
 * 初始化系统主题，确保页面挂载前恢复用户选择。
 */
export function initializeTheme() {
  if (initialized) return
  initialized = true

  applyTheme(currentTheme.value)
  watch(currentTheme, (theme) => {
    storeTheme(theme)
    applyTheme(theme)
  })
}

/**
 * 管理系统颜色主题切换状态。
 */
export function useTheme() {
  initializeTheme()

  const isGenArtTheme = computed(() => currentTheme.value === 'genart')
  const themeLabel = computed(() => (isGenArtTheme.value ? '黑曜' : '默认'))

  function setTheme(theme: AppTheme) {
    currentTheme.value = theme
  }

  function toggleTheme() {
    setTheme(isGenArtTheme.value ? 'default' : 'genart')
  }

  return {
    currentTheme,
    isGenArtTheme,
    themeLabel,
    setTheme,
    toggleTheme,
  }
}
