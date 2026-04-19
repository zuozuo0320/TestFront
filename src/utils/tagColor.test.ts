/**
 * tagColor 工具函数单元测试
 *
 * 测试覆盖：
 *   - nextAvailableColor: 无已用色、跳过占用色、大小写无关、全部占用循环
 *   - allocateBatchColors: 正常分配、跳过占用、不重复、循环分配、回退、边界值
 */
import { describe, it, expect } from 'vitest'
import { presetColors, nextAvailableColor, allocateBatchColors } from './tagColor'

describe('nextAvailableColor', () => {
  it('无已用颜色时返回第一个预设色', () => {
    expect(nextAvailableColor([])).toBe(presetColors[0])
  })

  it('跳过已占用的颜色', () => {
    const used = [presetColors[0]!] // #3B82F6
    expect(nextAvailableColor(used)).toBe(presetColors[1]) // #10B981
  })

  it('颜色比较不区分大小写', () => {
    const used = ['#3b82f6'] // 小写
    expect(nextAvailableColor(used)).toBe(presetColors[1])
  })

  it('跳过多个已用颜色', () => {
    const used = [presetColors[0]!, presetColors[1]!, presetColors[2]!]
    expect(nextAvailableColor(used)).toBe(presetColors[3]) // #EF4444
  })

  it('所有预设色用完时循环分配', () => {
    const used = [...presetColors]
    const result = nextAvailableColor(used)
    expect(presetColors).toContain(result)
  })
})

describe('allocateBatchColors', () => {
  it('无已用颜色时从第一个开始分配', () => {
    const colors = allocateBatchColors(3, [])
    expect(colors).toEqual([presetColors[0], presetColors[1], presetColors[2]])
  })

  it('跳过已占用颜色', () => {
    const used = [presetColors[0]!, presetColors[1]!] // 蓝、绿已用
    const colors = allocateBatchColors(2, used)
    // 应该从第3个预设色开始
    expect(colors[0]).toBe(presetColors[2]) // #F59E0B
    expect(colors[1]).toBe(presetColors[3]) // #EF4444
  })

  it('分配的颜色不与已有标签重复', () => {
    const used = ['#3B82F6', '#10B981', '#F59E0B']
    const colors = allocateBatchColors(4, used)
    const usedSet = new Set(used.map((c) => c.toUpperCase()))
    // 至少前几个分配的不应与已用颜色重复（在可用色池内）
    for (const c of colors) {
      expect(usedSet.has(c.toUpperCase())).toBe(false)
    }
  })

  it('需要数量超过可用颜色时循环分配', () => {
    // 用掉10个颜色，剩2个可用
    const used = presetColors.slice(0, 10)
    const colors = allocateBatchColors(5, used)
    // 可用池只有2个颜色，分配5个应该循环
    expect(colors[0]).toBe(colors[2]) // 第1和第3相同
    expect(colors[1]).toBe(colors[3]) // 第2和第4相同
  })

  it('所有颜色均被占用时回退到完整预设色循环', () => {
    const used = [...presetColors]
    const colors = allocateBatchColors(3, used)
    // 回退到 presetColors 循环
    expect(colors).toEqual([presetColors[0], presetColors[1], presetColors[2]])
  })

  it('分配0个返回空数组', () => {
    expect(allocateBatchColors(0, [])).toEqual([])
  })

  it('大小写混合的已用颜色也能正确排除', () => {
    const used = ['#3b82f6', '#10B981'] // 混合大小写
    const colors = allocateBatchColors(1, used)
    expect(colors[0]).toBe(presetColors[2]) // 跳过前两个
  })
})
