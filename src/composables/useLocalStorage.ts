import { ref, watch } from 'vue'
import type { Ref } from 'vue'

/**
 * 类型安全的 localStorage 封装
 *
 * @param key - localStorage key
 * @param defaultValue - 默认值
 * @returns 响应式 ref，自动同步到 localStorage
 *
 * @example
 * const theme = useLocalStorage('tp-theme', 'light')
 * theme.value = 'dark' // 自动写入 localStorage
 */
export function useLocalStorage<T>(key: string, defaultValue: T): Ref<T> {
  const stored = localStorage.getItem(key)
  let initial: T = defaultValue

  if (stored !== null) {
    try {
      initial = JSON.parse(stored) as T
    } catch {
      initial = stored as unknown as T
    }
  }

  const data = ref<T>(initial) as Ref<T>

  watch(
    data,
    (newVal) => {
      if (newVal === null || newVal === undefined) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, typeof newVal === 'string' ? newVal : JSON.stringify(newVal))
      }
    },
    { deep: true },
  )

  return data
}
