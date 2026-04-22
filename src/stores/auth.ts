import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { loginByEmail } from '../api/auth'
import type { LoginResp } from '../api/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('tp-token'))
  const userId = ref<string | null>(localStorage.getItem('tp-user-id'))
  const user = ref<LoginResp['user'] | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  const loginForm = ref({
    email: 'tester@testpilot.local',
    password: 'TestPilot@2026',
  })
  const loginLoading = ref(false)

  async function login() {
    loginLoading.value = true
    try {
      const data = await loginByEmail(loginForm.value.email, loginForm.value.password)
      token.value = data.access_token
      userId.value = String(data.user_id)
      user.value = data.user
      localStorage.setItem('tp-token', data.access_token)
      localStorage.setItem('tp-user-id', String(data.user_id))
      return data
    } finally {
      loginLoading.value = false
    }
  }

  function logout() {
    token.value = null
    userId.value = null
    user.value = null
    localStorage.removeItem('tp-token')
    localStorage.removeItem('tp-user-id')
  }

  // 本地离线头像：基于姓名首字符生成 SVG data URI，不依赖外网
  const AVATAR_PALETTE = [
    '#7C3AED',
    '#3B82F6',
    '#14B8A6',
    '#F59E0B',
    '#EF4444',
    '#EC4899',
    '#8B5CF6',
    '#06B6D4',
    '#10B981',
    '#F97316',
  ]

  function pickColor(seed: string): string {
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
    }
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] || AVATAR_PALETTE[0]!
  }

  function extractInitial(name: string): string {
    const trimmed = (name || '').trim()
    if (!trimmed) return 'A'
    // 中文/日韩等非 ASCII 字符直接取首字
    const first = Array.from(trimmed)[0] || 'A'
    return first.toUpperCase()
  }

  function fallbackAvatarUrl(name?: string) {
    const seed = (name || 'Aisight').trim() || 'Aisight'
    const initial = extractInitial(seed)
    const bg = pickColor(seed)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="${bg}"/><text x="50%" y="50%" dy=".1em" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="'PingFang SC','Microsoft YaHei',system-ui,sans-serif" font-size="56" font-weight="600">${initial}</text></svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  }

  function resolveAvatarUrl(avatar?: string, fallbackName?: string) {
    const avatarRaw = (avatar || '').trim()
    if (avatarRaw) {
      if (/^https?:\/\//i.test(avatarRaw)) return avatarRaw
      const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
      if (envBase && /^https?:\/\//i.test(envBase)) {
        const origin = envBase.replace(/\/api\/v1\/?$/, '')
        return `${origin}${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
      }
      // 默认返回相对路径：dev 下 /uploads 走 Vite proxy，生产由反向代理处理
      return `${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
    }
    return fallbackAvatarUrl(fallbackName)
  }

  // 用作 <img @error="...(e, name)"> 以便上传头像文件 404 时自动 fallback 到本地 SVG 首字母
  function handleAvatarError(event: Event, name?: string) {
    const img = event.target as HTMLImageElement | null
    if (!img) return
    const fallback = fallbackAvatarUrl(name)
    if (img.src === fallback) return // 防止死循环
    img.src = fallback
  }

  const avatarUrl = computed(() => {
    return resolveAvatarUrl((user.value as any)?.avatar, user.value?.name)
  })

  return {
    token,
    userId,
    user,
    isAuthenticated,
    loginForm,
    loginLoading,
    login,
    logout,
    resolveAvatarUrl,
    fallbackAvatarUrl,
    handleAvatarError,
    avatarUrl,
  }
})
