import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EmptyState from './EmptyState.vue'

describe('EmptyState.vue', () => {
  it('renders default description when no props are provided', () => {
    const wrapper = mount(EmptyState, {
      global: {
        plugins: [ElementPlus],
      },
    })
    expect(wrapper.text()).toContain('暂无数据')
  })

  it('renders description prop when provided', () => {
    const wrapper = mount(EmptyState, {
      props: {
        description: '无可用数据',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    expect(wrapper.text()).toContain('无可用数据')
  })

  it('renders description slot when provided', () => {
    const wrapper = mount(EmptyState, {
      slots: {
        description: '<div class="custom-desc">自定义描述内容</div>',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    expect(wrapper.find('.custom-desc').exists()).toBe(true)
    expect(wrapper.text()).toContain('自定义描述内容')
  })

  it('renders action button when showAction is true', () => {
    const wrapper = mount(EmptyState, {
      props: {
        showAction: true,
        actionText: '点击创建',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    const button = wrapper.find('.es-action-btn')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('点击创建')
  })

  it('emits action event when action button is clicked', async () => {
    const wrapper = mount(EmptyState, {
      props: {
        showAction: true,
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    const button = wrapper.find('.es-action-btn')
    await button.trigger('click')
    expect(wrapper.emitted('action')).toBeTruthy()
  })

  it('renders BOTH description slot and action button when both are provided', () => {
    const wrapper = mount(EmptyState, {
      props: {
        showAction: true,
        actionText: '用例评审创建',
      },
      slots: {
        description: '<div class="custom-desc">自定义评审内容</div>',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    expect(wrapper.find('.custom-desc').exists()).toBe(true)
    const button = wrapper.find('.es-action-btn')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('用例评审创建')
  })

  it('renders testcase SVG elements when type is testcase', () => {
    const wrapper = mount(EmptyState, {
      props: {
        type: 'testcase',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    // 齿轮类名应该存在于用例列表中
    expect(wrapper.find('.es-gear-rotate').exists()).toBe(true)
    // 放大镜类名不应存在
    expect(wrapper.find('.es-magnifier').exists()).toBe(false)
  })

  it('renders review SVG elements when type is review', () => {
    const wrapper = mount(EmptyState, {
      props: {
        type: 'review',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    // 放大镜类名应存在于评审中心中
    expect(wrapper.find('.es-magnifier').exists()).toBe(true)
    // 齿轮类名不应存在
    expect(wrapper.find('.es-gear-rotate').exists()).toBe(false)
  })

  it('renders aimodel SVG elements when type is aimodel', () => {
    const wrapper = mount(EmptyState, {
      props: {
        type: 'aimodel',
      },
      global: {
        plugins: [ElementPlus],
      },
    })
    // 神经网络连接点类名应存在于 AI 模型配置中
    expect(wrapper.find('.es-float-nodes').exists()).toBe(true)
    // 齿轮和放大镜都不应存在
    expect(wrapper.find('.es-gear-rotate').exists()).toBe(false)
    expect(wrapper.find('.es-magnifier').exists()).toBe(false)
  })
})
