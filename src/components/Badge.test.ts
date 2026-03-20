import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from '../components/StatusBadge.vue'
import LevelBadge from '../components/LevelBadge.vue'

describe('StatusBadge', () => {
  it('应渲染 pass 状态', () => {
    const wrapper = mount(StatusBadge, { props: { value: '已通过' } })
    expect(wrapper.text()).toBe('已通过')
    expect(wrapper.find('.status-badge').classes()).toContain('pass')
  })

  it('应渲染 fail 状态', () => {
    const wrapper = mount(StatusBadge, { props: { value: '不通过' } })
    expect(wrapper.find('.status-badge').classes()).toContain('fail')
  })

  it('应渲染 blocked 状态', () => {
    const wrapper = mount(StatusBadge, { props: { value: '阻塞' } })
    expect(wrapper.find('.status-badge').classes()).toContain('blocked')
  })

  it('应渲染 pending 状态（默认）', () => {
    const wrapper = mount(StatusBadge, { props: { value: '未评审' } })
    expect(wrapper.find('.status-badge').classes()).toContain('pending')
  })

  it('成功状态也应映射为 pass', () => {
    const wrapper = mount(StatusBadge, { props: { value: '成功' } })
    expect(wrapper.find('.status-badge').classes()).toContain('pass')
  })
})

describe('LevelBadge', () => {
  it('应渲染等级文字', () => {
    const wrapper = mount(LevelBadge, { props: { level: 'P0' } })
    expect(wrapper.text()).toBe('P0')
    expect(wrapper.find('.level-badge').classes()).toContain('p0')
  })

  it('应将等级转为小写 class', () => {
    const wrapper = mount(LevelBadge, { props: { level: 'P2' } })
    expect(wrapper.find('.level-badge').classes()).toContain('p2')
  })
})
