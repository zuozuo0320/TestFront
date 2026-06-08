import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { loginByEmail } from '../api/auth'
import type { AuthUser } from '../api/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('tp-token'))
  const userId = ref<string | null>(localStorage.getItem('tp-user-id'))
  const user = ref<AuthUser | null>(null)

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
      const nextUserId = data.user_id ?? data.user?.id
      token.value = data.access_token
      userId.value = nextUserId ? String(nextUserId) : null
      user.value = data.user
      localStorage.setItem('tp-token', data.access_token)
      if (nextUserId) {
        localStorage.setItem('tp-user-id', String(nextUserId))
      } else {
        localStorage.removeItem('tp-user-id')
      }
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

  function setUser(nextUser: AuthUser | null) {
    user.value = nextUser
  }

  // 本地离线头像：使用精挑细选的 10 款双色渐变色彩搭配方案，提升头像质感，不依赖外网
  const AVATAR_GRADIENTS = [
    { start: '#8B5CF6', end: '#6366F1' }, // 紫罗兰 - 靛蓝
    { start: '#3B82F6', end: '#1D4ED8' }, // 蓝色 - 深蓝
    { start: '#10B981', end: '#059669' }, // 翡翠 - 翠绿
    { start: '#F59E0B', end: '#D97706' }, // 琥珀 - 橙黄
    { start: '#EF4444', end: '#B91C1C' }, // 红色 - 深红
    { start: '#EC4899', end: '#C084FC' }, // 粉色 - 紫色
    { start: '#06B6D4', end: '#0891B2' }, // 青色 - 深青
    { start: '#14B8A6', end: '#0D9488' }, // 蓝绿 - 深绿
    { start: '#F97316', end: '#EA580C' }, // 橙色 - 深橙
    { start: '#6366F1', end: '#4338CA' }, // 靛蓝 - 深靛蓝
  ]

  function pickGradient(seed: string) {
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
    }
    return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length] || AVATAR_GRADIENTS[0]!
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
    const grad = pickGradient(seed)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="avatarGrad-${initial}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${grad.start}"/><stop offset="100%" stop-color="${grad.end}"/></linearGradient></defs><rect width="128" height="128" fill="url(#avatarGrad-${initial})"/><text x="50%" y="50%" dy=".08em" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-family="'Inter','Outfit','PingFang SC',system-ui,sans-serif" font-size="52" font-weight="700" letter-spacing="1">${initial}</text></svg>`
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
    return resolveAvatarUrl(user.value?.avatar, user.value?.name)
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
    setUser,
    resolveAvatarUrl,
    fallbackAvatarUrl,
    handleAvatarError,
    avatarUrl,
  }
})
