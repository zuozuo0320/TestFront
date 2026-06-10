<script setup lang="ts">
/**
 * 测试智编资产模块空态组件。
 *
 * 用于承接尚未接入后端能力的 P0 二级入口，避免展示不可操作的假功能。
 */
interface Props {
  icon: string
  title: string
  status: string
  description: string
}

defineProps<Props>()
</script>

<template>
  <div class="ai-page ai-module-empty-page">
    <section class="ai-module-empty-panel" aria-live="polite">
      <div class="ai-module-empty-icon">
        <span class="material-symbols-outlined">{{ icon }}</span>
      </div>
      <div class="ai-module-empty-copy">
        <span class="ai-module-empty-status">{{ status }}</span>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ai-module-empty-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  box-sizing: border-box;
}

.ai-module-empty-panel {
  display: grid;
  min-height: 360px;
  flex: 1;
  place-items: center;
  gap: var(--tp-space-4);
  padding: var(--tp-space-8);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background:
    radial-gradient(circle at 20% 12%, var(--tp-primary-lighter), transparent 30%),
    var(--tp-surface-card);
  text-align: center;
}

.ai-module-empty-icon {
  display: inline-flex;
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--tp-accent-primary-border);
  border-radius: 18px;
  background: var(--tp-primary-lighter);
  color: var(--tp-primary);
}

.ai-module-empty-icon .material-symbols-outlined {
  font-size: 32px;
  font-variation-settings:
    'FILL' 1,
    'wght' 320,
    'GRAD' 0,
    'opsz' 32;
}

.ai-module-empty-copy {
  display: flex;
  max-width: 560px;
  flex-direction: column;
  align-items: center;
  gap: var(--tp-space-2);
}

.ai-module-empty-status {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 var(--tp-space-3);
  border: 1px solid var(--tp-accent-info-border);
  border-radius: 999px;
  background: var(--tp-info-light);
  color: var(--tp-info);
  font-size: 12px;
  font-weight: 700;
}

.ai-module-empty-copy h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.25;
}

.ai-module-empty-copy p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

:global(html[data-theme='genart']) .ai-module-empty-panel {
  background:
    radial-gradient(circle at 20% 12%, rgba(232, 121, 249, 0.13), transparent 32%),
    rgba(18, 20, 30, 0.76);
  border-color: rgba(255, 255, 255, 0.09);
}

:global(html[data-theme='genart']) .ai-module-empty-icon {
  color: var(--tp-primary-light);
  background: rgba(232, 121, 249, 0.13);
  border-color: rgba(232, 121, 249, 0.26);
}
</style>
