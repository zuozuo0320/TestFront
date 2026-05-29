<script setup lang="ts">
/**
 * 通用占位页：展示"即将推出"状态。
 * 根据路由自动匹配模块名称、描述和规划特性列表。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

interface ModuleMeta {
  title: string
  desc: string
  icon: string
  features: string[]
}

const moduleMap: Record<string, ModuleMeta> = {
  defects: {
    title: '缺陷管理',
    icon: 'bug_report',
    desc: '缺陷录入、跟踪、分析与闭环管理',
    features: ['缺陷录入与分派', '状态流转追踪', '缺陷分析报表', '关联用例与需求'],
  },
  analytics: {
    title: '数据分析',
    icon: 'monitoring',
    desc: '多维度质量数据可视化与趋势洞察',
    features: ['质量趋势仪表盘', '用例覆盖率分析', '缺陷分布热力图', '团队效能报表'],
  },
  e2e: {
    title: 'E2E 测试',
    icon: 'select_check_box',
    desc: '端到端自动化测试管理与回归验证',
    features: ['E2E 用例管理', '自动化执行调度', '回归结果看板', '环境配置管理'],
  },
  plan: {
    title: '测试计划',
    icon: 'assignment',
    desc: '测试计划创建、进度追踪与报告生成',
    features: ['计划创建与排期', '进度实时追踪', '测试报告导出', '里程碑管理'],
  },
}

const pathKey = computed(() => {
  if (route.name === 'Defects') return 'defects'
  if (route.name === 'Analytics') return 'analytics'
  const match = String(route.params.pathMatch || 'e2e')
    .replace(/^\//, '')
    .split('/')[0]
  return match || 'e2e'
})

const meta = computed<ModuleMeta>(
  () =>
    moduleMap[pathKey.value] ?? {
      title: '功能模块',
      icon: 'widgets',
      desc: '该功能模块正在开发中',
      features: ['敬请期待'],
    },
)
</script>

<template>
  <div class="cs-page">
    <!-- 装饰环 -->
    <div class="cs-ring cs-ring--1" aria-hidden="true"></div>
    <div class="cs-ring cs-ring--2" aria-hidden="true"></div>
    <div class="cs-dot cs-dot--1" aria-hidden="true"></div>
    <div class="cs-dot cs-dot--2" aria-hidden="true"></div>
    <div class="cs-dot cs-dot--3" aria-hidden="true"></div>

    <div class="cs-content">
      <!-- 图标 -->
      <div class="cs-icon-wrap">
        <div class="cs-icon-ring" aria-hidden="true"></div>
        <span class="material-symbols-outlined cs-icon">{{ meta.icon }}</span>
      </div>

      <!-- 标题区 -->
      <h1 class="cs-title">{{ meta.title }}</h1>
      <p class="cs-desc">{{ meta.desc }}</p>

      <!-- 状态标签 -->
      <div class="cs-badge">
        <span class="cs-badge-dot"></span>
        开发中 · 即将推出
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 页面容器 ── */
.cs-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  overflow: hidden;
  background: var(--tp-surface-base, #fafafa);
}

/* ── 装饰环 ── */
.cs-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px dashed var(--tp-primary-lighter, rgba(139, 92, 246, 0.1));
  pointer-events: none;
}

.cs-ring--1 {
  width: 520px;
  height: 520px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: cs-spin 60s linear infinite;
}

.cs-ring--2 {
  width: 380px;
  height: 380px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-style: dotted;
  border-color: var(--tp-primary-lighter, rgba(139, 92, 246, 0.08));
  animation: cs-spin-r 45s linear infinite;
}

.cs-dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tp-primary-light, #a78bfa);
  opacity: 0.25;
  pointer-events: none;
  animation: cs-float 6s ease-in-out infinite;
}

.cs-dot--1 {
  top: 22%;
  left: 18%;
  animation-delay: 0s;
}
.cs-dot--2 {
  top: 68%;
  right: 22%;
  animation-delay: 2s;
}
.cs-dot--3 {
  bottom: 18%;
  left: 35%;
  animation-delay: 4s;
}

/* ── 内容区 ── */
.cs-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 440px;
  padding: 48px 24px;
  text-align: center;
  animation: cs-fade-in 0.5s ease-out both;
}

/* ── 图标 ── */
.cs-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin-bottom: 28px;
}

.cs-icon-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--tp-primary-lighter, rgba(139, 92, 246, 0.12));
  animation: cs-pulse 3s ease-in-out infinite;
}

.cs-icon {
  font-size: 40px;
  color: var(--tp-primary, #8b5cf6);
  z-index: 1;
}

/* ── 标题 ── */
.cs-title {
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 700;
  color: var(--tp-text-primary, var(--tp-gray-900));
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.cs-desc {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--tp-text-muted, var(--tp-gray-500));
  line-height: 1.6;
  max-width: 320px;
}

/* ── 状态标签 ── */
.cs-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 18px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tp-primary, #8b5cf6);
  background: var(--tp-primary-lighter, rgba(139, 92, 246, 0.1));
  border: 1px solid var(--tp-primary-shadow, rgba(139, 92, 246, 0.18));
  letter-spacing: 0.02em;
}

.cs-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tp-primary, #8b5cf6);
  animation: cs-blink 2s ease-in-out infinite;
}

/* ── 动画 ── */
@keyframes cs-spin {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

@keyframes cs-spin-r {
  from {
    transform: translate(-50%, -50%) rotate(360deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(0deg);
  }
}

@keyframes cs-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.12);
    opacity: 1;
  }
}

@keyframes cs-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

@keyframes cs-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-12px);
  }
}

@keyframes cs-fade-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── 窄屏适配 ── */
@media (max-width: 520px) {
  .cs-ring--1 {
    width: 340px;
    height: 340px;
  }
  .cs-ring--2 {
    width: 240px;
    height: 240px;
  }
}

/* ── reduced-motion ── */
@media (prefers-reduced-motion: reduce) {
  .cs-ring,
  .cs-dot,
  .cs-icon-ring,
  .cs-badge-dot {
    animation: none !important;
  }
  .cs-content {
    animation-duration: 0.01ms !important;
  }
}
</style>
