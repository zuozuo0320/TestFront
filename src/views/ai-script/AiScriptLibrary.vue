<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useAiScriptStore } from '../../stores/aiScript'
import {
  ScriptStatusLabel,
  ScriptStatusColor,
  SourceType,
  SourceTypeLabel,
} from '../../api/aiScript'

const store = useAiScriptStore()

onMounted(() => {
  // 加载脚本资产数据（复用任务 29280 的脚本列表）
  store.loadScriptVersions(29280)
  store.loadCurrentScript(29280)
})

const scripts = computed(() => store.scriptVersions)
const current = computed(() => store.currentScript)

/** 简易语法高亮 */
function highlightLines(content: string) {
  return content.split('\n').map((line, i) => ({
    no: String(i + 1).padStart(2, '0'),
    html: highlightLine(line),
  }))
}

function highlightLine(line: string): string {
  let s = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (/^\s*\/\//.test(s)) return `<span class="ai-code-comment">${s}</span>`
  s = s.replace(
    /\b(import|from|export|const|let|var|async|await|function|return|test|expect)\b/g,
    '<span class="ai-code-keyword">$1</span>',
  )
  s = s.replace(/'([^']*)'/g, "'<span class=\"ai-code-string\">$1</span>'")
  return s
}
</script>

<template>
  <div class="ai-page">
    <!-- 页面头部 -->
    <div class="ai-page-header">
      <div class="ai-page-header-left">
        <div class="ai-breadcrumb">
          <span>用例管理</span>
          <span class="material-symbols-outlined">chevron_right</span>
          <span class="current">TC-4029 鉴权流程</span>
        </div>
        <h1>脚本管理区</h1>
        <p class="ai-subtitle">管理、回放及验证该用例的所有自动化脚本版本</p>
      </div>
      <div class="ai-action-group">
        <button class="ai-btn ai-btn-secondary">
          <span class="material-symbols-outlined">history</span>
          版本历史
        </button>
        <button class="ai-btn ai-btn-primary">
          <span class="material-symbols-outlined">auto_fix</span>
          智能生成脚本
        </button>
      </div>
    </div>

    <!-- 12 列布局 -->
    <div class="ai-library-grid">
      <!-- 左：脚本列表 + 代码预览 -->
      <div class="ai-library-left">
        <!-- 脚本列表 -->
        <div class="ai-table-wrap">
          <div class="ai-table-header">
            <span class="ai-table-title">活跃脚本</span>
            <span class="ai-case-tag" style="font-size: 0.6rem">{{ scripts.length }} 个脚本</span>
          </div>
          <table class="ai-table">
            <thead>
              <tr>
                <th>脚本名称 / 框架</th>
                <th style="text-align: center">状态</th>
                <th>版本</th>
                <th>来源</th>
                <th>更新时间</th>
                <th style="text-align: right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in scripts"
                :key="s.id"
                :class="{ 'ai-script-row-active': s.isCurrentFlag }"
              >
                <td>
                  <div style="display: flex; align-items: center; gap: 10px">
                    <div
                      style="
                        width: 36px; height: 36px; border-radius: 8px;
                        background: var(--tp-surface-elevated);
                        display: flex; align-items: center; justify-content: center;
                        border: 1px solid rgba(255,255,255,0.06);
                      "
                    >
                      <span class="material-symbols-outlined" style="font-size: 18px; color: var(--tp-primary-light)">code</span>
                    </div>
                    <div>
                      <div style="font-size: 0.85rem; font-weight: 600">{{ s.scriptName }}</div>
                      <div style="font-size: 0.7rem; color: var(--tp-gray-500); font-weight: 300">
                        Playwright (Node.js)
                      </div>
                    </div>
                  </div>
                </td>
                <td style="text-align: center">
                  <div
                    class="ai-status-badge"
                    :class="ScriptStatusColor[s.scriptStatus]"
                    style="margin: 0 auto"
                  >
                    <span class="ai-status-dot"></span>
                    {{ ScriptStatusLabel[s.scriptStatus] }}
                  </div>
                </td>
                <td>
                  <span style="font-family: monospace; font-size: 0.78rem; color: #adc6ff">
                    v{{ s.versionNo }}.0
                  </span>
                </td>
                <td>
                  <div
                    class="ai-source-label"
                    :class="{ 'ai-gen': s.sourceType === SourceType.AI_GENERATED }"
                  >
                    <span class="material-symbols-outlined">
                      {{ s.sourceType === SourceType.AI_GENERATED ? 'bolt' : 'person' }}
                    </span>
                    {{ SourceTypeLabel[s.sourceType] }}
                  </div>
                </td>
                <td style="font-size: 0.78rem; color: var(--tp-gray-500)">
                  {{ s.createdAt }}
                </td>
                <td>
                  <div class="ai-row-actions">
                    <button class="ai-row-action-btn" title="预览">
                      <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button class="ai-row-action-btn" title="复制">
                      <span class="material-symbols-outlined">content_copy</span>
                    </button>
                    <button class="ai-row-action-btn" title="回放验证">
                      <span class="material-symbols-outlined">play_arrow</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 代码预览 -->
        <div class="ai-glass-panel" style="padding: 20px" v-if="current">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px">
            <div style="display: flex; align-items: center; gap: 8px">
              <span class="material-symbols-outlined" style="color: var(--tp-primary-light)">terminal</span>
              <span style="font-size: 0.85rem; font-weight: 600">预览: {{ current.scriptName }}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-size: 0.6rem; text-transform: uppercase; color: var(--tp-gray-600); background: var(--tp-surface-elevated); padding: 2px 8px; border-radius: 3px">
                TypeScript
              </span>
              <button class="ai-code-copy-btn" title="全屏">
                <span class="material-symbols-outlined" style="font-size: 16px">fullscreen</span>
              </button>
            </div>
          </div>
          <div
            style="
              background: rgba(0, 0, 0, 0.3);
              border-radius: var(--tp-radius-md);
              padding: 16px;
              font-family: 'JetBrains Mono', 'Fira Code', monospace;
              font-size: 0.75rem;
              line-height: 1.7;
              border: 1px solid rgba(255, 255, 255, 0.03);
            "
          >
            <div style="display: flex; gap: 14px">
              <div style="color: var(--tp-gray-400); text-align: right; user-select: none; flex-shrink: 0">
                <div v-for="line in highlightLines(current.scriptContent)" :key="line.no">
                  {{ line.no }}
                </div>
              </div>
              <div>
                <div
                  v-for="line in highlightLines(current.scriptContent)"
                  :key="line.no"
                  v-html="line.html"
                  style="color: var(--tp-gray-700)"
                ></div>
              </div>
            </div>
          </div>
          <div class="ai-code-footer">
            <button class="ai-btn ai-btn-ghost" style="font-size: 0.7rem; padding: 6px 14px">
              导出 (.zip)
            </button>
            <button class="ai-btn ai-btn-secondary" style="font-size: 0.7rem; padding: 6px 14px; border: 1px solid rgba(124, 58, 237, 0.2)">
              一键部署
            </button>
          </div>
        </div>
      </div>

      <!-- 右：健康度 + 回放 + AI建议 -->
      <div class="ai-library-right">
        <!-- 自动化健康度 -->
        <div class="ai-health-card">
          <div style="position: relative; z-index: 1">
            <span class="ai-section-title" style="margin-bottom: 14px; display: block">自动化健康度</span>
            <div style="display: flex; align-items: flex-end; gap: 8px">
              <span class="ai-health-value">94%</span>
              <span class="ai-health-trend" style="margin-bottom: 6px">
                <span class="material-symbols-outlined">trending_up</span>
                +2.4%
              </span>
            </div>
            <p class="ai-health-desc">
              脚本在最近 10 次 CI 运行中表现稳定。检测到 1 次因环境波动的随机失败。
            </p>
          </div>
          <div class="ai-health-bg-icon">
            <span class="material-symbols-outlined">analytics</span>
          </div>
        </div>

        <!-- 最近回放分析 -->
        <div class="ai-info-card">
          <div class="ai-info-card-header">
            <span class="ai-section-title">最近回放分析</span>
            <span class="material-symbols-outlined" style="font-size: 16px; color: var(--tp-gray-500); cursor: pointer">more_horiz</span>
          </div>
          <div class="ai-trace-timeline">
            <div class="ai-trace-item">
              <div class="ai-trace-dot success"></div>
              <div class="ai-trace-title">脚本验证通过</div>
              <div class="ai-trace-sub">Browser: Chrome Desktop • 1.2s</div>
            </div>
            <div class="ai-trace-item">
              <div class="ai-trace-dot success"></div>
              <div class="ai-trace-title">Playwright 生成报告</div>
              <div class="ai-trace-sub">Trace 文件已上传至 S3 存储桶</div>
            </div>
            <div class="ai-trace-item">
              <div class="ai-trace-dot warning"></div>
              <div class="ai-trace-title">警告: 元素定位延迟</div>
              <div class="ai-trace-sub">选择器 `#login-btn` 耗时 &gt;500ms</div>
            </div>
          </div>
          <button
            class="ai-btn ai-btn-ghost"
            style="width: 100%; justify-content: center; margin-top: 18px; font-size: 0.7rem"
          >
            查看完整 Trace 日志
          </button>
        </div>

        <!-- AI 建议 -->
        <div class="ai-insight-card">
          <div class="ai-insight-header">
            <span class="material-symbols-outlined">psychology</span>
            <span class="ai-insight-label">AI 建议</span>
          </div>
          <p class="ai-insight-text">
            "当前脚本 version 2 使用了硬编码的等待时间。建议将其替换为 Playwright 的 auto-waiting 机制以提高 15% 的执行效率。"
          </p>
          <button class="ai-insight-action">
            应用优化方案 →
          </button>
        </div>
      </div>
    </div>

    <!-- Toast 通知 -->
    <div class="ai-toast">
      <div class="ai-toast-dot"></div>
      <span class="ai-toast-text">AI 正在后台同步版本差异...</span>
    </div>
  </div>
</template>
