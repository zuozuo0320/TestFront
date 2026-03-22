import { createRouter, createWebHistory } from 'vue-router'

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
      path: '/system/users',
      name: 'UserManagement',
      component: () => import('../views/system/UserManagement.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/system/roles',
      name: 'RoleManagement',
      component: () => import('../views/system/RoleManagement.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/system/projects',
      name: 'ProjectManagement',
      component: () => import('../views/system/ProjectManagement.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/executions',
      name: 'Executions',
      component: () => import('../views/ComingSoonPage.vue'),
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
})

export default router
