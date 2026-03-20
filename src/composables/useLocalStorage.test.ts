import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLocalStorage } from '../composables/useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('应返回默认值（当 localStorage 无数据时）', () => {
    const val = useLocalStorage('test-key', 'default')
    expect(val.value).toBe('default')
  })

  it('应从 localStorage 恢复已有值', () => {
    localStorage.setItem('test-key', JSON.stringify('saved'))
    const val = useLocalStorage('test-key', 'default')
    expect(val.value).toBe('saved')
  })

  it('应从 localStorage 恢复对象值', () => {
    localStorage.setItem('test-obj', JSON.stringify({ a: 1, b: 'x' }))
    const val = useLocalStorage('test-obj', { a: 0, b: '' })
    expect(val.value).toEqual({ a: 1, b: 'x' })
  })

  it('应在值变化后写入 localStorage', async () => {
    const val = useLocalStorage('test-write', 'init')
    val.value = 'updated'
    // watch is async, flush manually
    await new Promise((r) => setTimeout(r, 10))
    expect(localStorage.getItem('test-write')).toBe('updated')
  })

  it('应在值为 null 时删除 localStorage 项', async () => {
    localStorage.setItem('test-rm', '"exists"')
    const val = useLocalStorage<string | null>('test-rm', 'exists')
    val.value = null
    await new Promise((r) => setTimeout(r, 10))
    expect(localStorage.getItem('test-rm')).toBeNull()
  })
})
