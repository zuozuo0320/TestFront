import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeDirectoryPath, normalizeCaseModulePath } from '../stores/testcase'

describe('normalizeDirectoryPath', () => {
  it('应将空字符串规范化为 /', () => {
    expect(normalizeDirectoryPath('')).toBe('/')
    expect(normalizeDirectoryPath('  ')).toBe('/')
  })

  it('应去除前后斜杠并添加前缀 /', () => {
    expect(normalizeDirectoryPath('/foo/')).toBe('/foo')
    expect(normalizeDirectoryPath('foo')).toBe('/foo')
    expect(normalizeDirectoryPath('//foo//')).toBe('/foo')
  })

  it('应保留多层路径', () => {
    expect(normalizeDirectoryPath('foo/bar/baz')).toBe('/foo/bar/baz')
    expect(normalizeDirectoryPath('/foo/bar/')).toBe('/foo/bar')
  })
})

describe('normalizeCaseModulePath', () => {
  it('应将根路径映射为 /未规划用例', () => {
    expect(normalizeCaseModulePath('')).toBe('/未规划用例')
    expect(normalizeCaseModulePath('/')).toBe('/未规划用例')
  })

  it('应保留正常路径', () => {
    expect(normalizeCaseModulePath('/登录/表单')).toBe('/登录/表单')
    expect(normalizeCaseModulePath('登录')).toBe('/登录')
  })
})
