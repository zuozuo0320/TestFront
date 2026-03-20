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

  function resolveAvatarUrl(avatar?: string, fallbackName?: string) {
    const avatarRaw = (avatar || '').trim()
    if (avatarRaw) {
      if (/^https?:\/\//i.test(avatarRaw)) return avatarRaw
      const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
      if (envBase && /^https?:\/\//i.test(envBase)) {
        const origin = envBase.replace(/\/api\/v1\/?$/, '')
        return `${origin}${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
      }
      return `http://localhost:8080${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
    }
    const seed = encodeURIComponent((fallbackName || 'Aisight').trim() || 'Aisight')
    return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`
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
    avatarUrl,
  }
})
