import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'

/** 无权访问系统管理的角色（与 AppSidebar 保持一致） */
const NO_SYSTEM_ROLES = new Set(['readonly', 'developer', 'reviewer'])

/** 从 JWT token 中解析用户角色（不校验签名，仅解码 payload） */
function getRoleFromToken(): string | null {
  const token = localStorage.getItem('tp-token')
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
    return payload.role || null
  } catch {
    return null
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/LoginPage.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'Workbench',
      component: () => import('../views/WorkbenchPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/testcases',
      name: 'TestCases',
      component: () => import('../views/TestCasePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/forbidden',
      name: 'Forbidden',
      component: () => import('../views/ForbiddenPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/system/users',
      name: 'UserManagement',
      component: () => import('../views/system/UserManagement.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/system/roles',
      name: 'RoleManagement',
      component: () => import('../views/system/RoleManagement.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/system/projects',
      name: 'ProjectManagement',
      component: () => import('../views/system/ProjectManagement.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/ai-script',
      name: 'AiScriptTaskList',
      component: () => import('../views/ai-script/AiScriptTaskList.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/ai-script/library',
      name: 'AiScriptLibrary',
      component: () => import('../views/ai-script/AiScriptLibrary.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/ai-script/:taskId',
      name: 'AiScriptTaskDetail',
      component: () => import('../views/ai-script/AiScriptTaskDetail.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/defects',
      name: 'Defects',
      component: () => import('../views/ComingSoonPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/analytics',
      name: 'Analytics',
      component: () => import('../views/ComingSoonPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Catch-all: coming soon pages
      path: '/:pathMatch(.*)*',
      name: 'ComingSoon',
      component: () => import('../views/ComingSoonPage.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('tp-token')
  if (to.meta.requiresAuth !== false && !token) {
    return { name: 'Login' }
  }
  if (to.name === 'Login' && token) {
    return { path: '/' }
  }
  // 系统管理页面权限校验：readonly/developer/reviewer 无权访问
  if (to.meta.requiresAdmin && token) {
    const role = getRoleFromToken()
    if (role && NO_SYSTEM_ROLES.has(role.toLowerCase())) {
      ElMessage.warning('无权限访问系统管理，请联系管理员')
      return {
        name: 'Forbidden',
        query: typeof to.fullPath === 'string' && to.fullPath ? { from: to.fullPath } : undefined,
      }
    }
  }
})

export default router

