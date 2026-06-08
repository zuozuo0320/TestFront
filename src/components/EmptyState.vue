<script setup lang="ts">
/**
 * EmptyState — 通用空状态组件
 * 提供支持暗色主题的科技感三维浮动 SVG 占位图及操作按钮
 */

export interface EmptyStateProps {
  /** 提示文案 */
  description?: string
  /** 占位图尺寸（宽） */
  imageSize?: number
  /** 是否展示操作按钮 */
  showAction?: boolean
  /** 操作按钮文案 */
  actionText?: string
  /** 占位图类型: 'testcase' | 'review' | 'aimodel' | 'tag' */
  type?: 'testcase' | 'review' | 'aimodel' | 'tag'
}

defineProps<EmptyStateProps>()

const emit = defineEmits<{
  /** 按钮点击事件 */
  (e: 'action'): void
}>()

function handleAction() {
  emit('action')
}
</script>

<template>
  <div class="empty-state-wrap">
    <el-empty :description="description || '暂无数据'" :image-size="imageSize || 200">
      <template #description>
        <slot name="description">
          {{ description || '暂无数据' }}
        </slot>
      </template>
      <template #image>
        <svg
          class="empty-state-svg"
          viewBox="0 0 240 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- 渐变和过滤器定义 -->
          <defs>
            <!-- 背景发光效果 -->
            <radialGradient id="es-bg-glow" cx="120" cy="110" r="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="var(--tp-primary)" stop-opacity="0.18" />
              <stop offset="100%" stop-color="var(--tp-primary)" stop-opacity="0" />
            </radialGradient>

            <!-- 底座板面渐变 -->
            <linearGradient
              id="es-plate"
              x1="60"
              y1="95"
              x2="180"
              y2="125"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stop-color="var(--tp-surface-card)" stop-opacity="0.85" />
              <stop offset="100%" stop-color="var(--tp-gray-100)" stop-opacity="0.2" />
            </linearGradient>

            <!-- 主体色卡片渐变（紫到粉） -->
            <linearGradient
              id="es-grad-primary"
              x1="90"
              y1="50"
              x2="150"
              y2="110"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stop-color="#a78bfa" />
              <stop offset="100%" stop-color="#ec4899" />
            </linearGradient>

            <!-- 辅助色齿轮渐变（蓝到绿） -->
            <linearGradient
              id="es-grad-secondary"
              x1="130"
              y1="40"
              x2="180"
              y2="90"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#2dd4bf" />
            </linearGradient>
          </defs>

          <!-- 氛围背景发光椭圆 -->
          <ellipse cx="120" cy="110" rx="85" ry="38" fill="url(#es-bg-glow)" />

          <!-- 等距网格/雷达扫描圆环 -->
          <g class="es-grid" opacity="0.3">
            <ellipse
              cx="120"
              cy="110"
              rx="95"
              ry="42"
              stroke="var(--tp-gray-400)"
              stroke-width="1"
              stroke-dasharray="4 6"
            />
            <ellipse
              cx="120"
              cy="110"
              rx="65"
              ry="29"
              stroke="var(--tp-gray-400)"
              stroke-width="1"
            />
            <line
              x1="25"
              y1="110"
              x2="215"
              y2="110"
              stroke="var(--tp-gray-300)"
              stroke-width="1"
              stroke-dasharray="2 4"
            />
            <line
              x1="120"
              y1="65"
              x2="120"
              y2="155"
              stroke="var(--tp-gray-300)"
              stroke-width="1"
              stroke-dasharray="2 4"
            />
          </g>

          <!-- 三维底座面 -->
          <g class="es-plate-group">
            <!-- 平台底座多边形 -->
            <polygon
              points="120,78 195,110 120,142 45,110"
              fill="url(#es-plate)"
              stroke="var(--tp-border-strong)"
              stroke-width="1.5"
            />
            <!-- 内嵌装饰线条 -->
            <polygon
              points="120,88 175,110 120,132 65,110"
              fill="none"
              stroke="var(--tp-primary)"
              stroke-width="1"
              stroke-opacity="0.35"
            />

            <!-- 底座四角装饰光源点 -->
            <circle cx="120" cy="78" r="3" fill="#8b5cf6" />
            <circle cx="195" cy="110" r="3" fill="#ec4899" />
            <circle cx="120" cy="142" r="3" fill="#8b5cf6" />
            <circle cx="45" cy="110" r="3" fill="#2dd4bf" />
          </g>

          <!-- 1. 用例列表插图 (type === 'testcase' 或未指定) -->
          <g v-if="!type || type === 'testcase'">
            <!-- 浮动核心组件 -->
            <g class="es-float-main">
              <!-- 投影印迹在底座上 -->
              <ellipse
                cx="120"
                cy="122"
                rx="20"
                ry="8"
                fill="var(--tp-primary-dark)"
                fill-opacity="0.25"
                filter="blur(2px)"
              />

              <!-- 主浮动卡片（测试用例象征物） -->
              <g transform="translate(98, 38)">
                <!-- 厚度边框 -->
                <polygon points="20,0 45,0 35,45 10,45" fill="var(--tp-primary-dark)" />
                <!-- 主卡片正面 -->
                <polygon points="18,-2 43,-2 33,43 8,43" fill="url(#es-grad-primary)" />

                <!-- 卡片内的抽象线条样式 -->
                <line
                  x1="16"
                  y1="10"
                  x2="36"
                  y2="10"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />
                <line
                  x1="14"
                  y1="18"
                  x2="34"
                  y2="18"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />
                <line
                  x1="12"
                  y1="26"
                  x2="28"
                  y2="26"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />

                <!-- 象征测试通过的打勾符号 -->
                <path
                  d="M12,34 L16,38 L25,29"
                  fill="none"
                  stroke="#ffffff"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </g>
            </g>

            <!-- 齿轮浮动组件（象征AI智编与任务运行） -->
            <g class="es-float-sec">
              <g transform="translate(155, 55)">
                <g class="es-gear-rotate">
                  <circle cx="15" cy="15" r="9" fill="url(#es-grad-secondary)" />
                  <rect
                    x="13.5"
                    y="1"
                    width="3"
                    height="28"
                    rx="1.5"
                    fill="url(#es-grad-secondary)"
                    transform="rotate(0 15 15)"
                  />
                  <rect
                    x="13.5"
                    y="1"
                    width="3"
                    height="28"
                    rx="1.5"
                    fill="url(#es-grad-secondary)"
                    transform="rotate(45 15 15)"
                  />
                  <rect
                    x="13.5"
                    y="1"
                    width="3"
                    height="28"
                    rx="1.5"
                    fill="url(#es-grad-secondary)"
                    transform="rotate(90 15 15)"
                  />
                  <rect
                    x="13.5"
                    y="1"
                    width="3"
                    height="28"
                    rx="1.5"
                    fill="url(#es-grad-secondary)"
                    transform="rotate(135 15 15)"
                  />
                  <circle cx="15" cy="15" r="4.5" fill="var(--tp-surface-card)" />
                </g>
              </g>
            </g>
          </g>

          <!-- 4. 标签管理插图 (type === 'tag') -->
          <g v-else-if="type === 'tag'">
            <!-- 标签底盘投影 -->
            <ellipse
              cx="120"
              cy="122"
              rx="30"
              ry="10"
              fill="var(--tp-primary-dark)"
              fill-opacity="0.2"
              filter="blur(2.5px)"
            />

            <!-- 浮动核心组件：科技感大吊牌 -->
            <g class="es-float-main">
              <g transform="translate(90, 36)">
                <!-- 3D厚度 -->
                <polygon points="10,0 45,0 35,55 0,55" fill="var(--tp-primary-dark)" />
                <!-- 吊牌正面 -->
                <polygon points="8,-2 43,-2 33,53 -2,53" fill="url(#es-grad-primary)" />

                <!-- 吊牌孔 -->
                <circle cx="20" cy="8" r="3" fill="var(--tp-surface-card)" />

                <!-- 抽象的井号键 '#' 代表 Tag 分类 -->
                <line
                  x1="8"
                  y1="21"
                  x2="28"
                  y2="21"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />
                <line
                  x1="6"
                  y1="31"
                  x2="26"
                  y2="31"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />
                <line
                  x1="14"
                  y1="13"
                  x2="8"
                  y2="39"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />
                <line
                  x1="24"
                  y1="13"
                  x2="18"
                  y2="39"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />
              </g>
            </g>

            <!-- 辅助浮动组件：右侧中等胶囊标签 (蓝绿) -->
            <g class="es-float-sec">
              <g transform="translate(136, 58)">
                <!-- 厚度投影 -->
                <rect
                  x="0"
                  y="2"
                  width="38"
                  height="15"
                  rx="7.5"
                  fill="var(--tp-accent-info-dark)"
                  opacity="0.6"
                />
                <!-- 主体 -->
                <rect x="-2" y="0" width="38" height="15" rx="7.5" fill="url(#es-grad-secondary)" />
                <!-- 胶囊内容 -->
                <circle cx="7" cy="7.5" r="2.2" fill="#ffffff" />
                <line
                  x1="14"
                  y1="7.5"
                  x2="28"
                  y2="7.5"
                  stroke="#ffffff"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </g>
            </g>

            <!-- 辅助悬浮组件：左侧金黄色微型胶囊 -->
            <g class="es-float-nodes">
              <g transform="translate(52, 64)">
                <!-- 琥珀金胶囊 -->
                <rect x="0" y="0" width="28" height="12" rx="6" fill="#f59e0b" opacity="0.85" />
                <circle cx="5" cy="6" r="1.8" fill="#ffffff" />
                <line
                  x1="10"
                  y1="6"
                  x2="20"
                  y2="6"
                  stroke="#ffffff"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </g>
            </g>
          </g>

          <!-- 2. 用例评审中心插图 (type === 'review') -->
          <g v-else-if="type === 'review'">
            <!-- 评审文档底盘投影 -->
            <ellipse
              cx="120"
              cy="122"
              rx="35"
              ry="12"
              fill="var(--tp-primary-dark)"
              fill-opacity="0.18"
              filter="blur(3px)"
            />

            <!-- 浮动核心组件：评审报告面板 -->
            <g class="es-float-main">
              <g transform="translate(75, 42)">
                <!-- 厚度阴影 -->
                <polygon
                  points="10,5 60,5 50,75 0,75"
                  fill="var(--tp-primary-dark)"
                  opacity="0.8"
                />
                <!-- 卡片主体 -->
                <polygon points="8,3 58,3 48,73 -2,73" fill="url(#es-grad-primary)" />
                <!-- 卡片内部线条（列表项形式） -->
                <line
                  x1="8"
                  y1="15"
                  x2="38"
                  y2="15"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-opacity="0.9"
                />
                <!-- 第二行带对勾 -->
                <path
                  d="M8,30 L11,33 L17,26"
                  fill="none"
                  stroke="#2dd4bf"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <line
                  x1="22"
                  y1="29"
                  x2="42"
                  y2="29"
                  stroke="#ffffff"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-opacity="0.75"
                />
                <!-- 第三行带对勾 -->
                <path
                  d="M6,45 L9,48 L15,41"
                  fill="none"
                  stroke="#2dd4bf"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <line
                  x1="20"
                  y1="44"
                  x2="36"
                  y2="44"
                  stroke="#ffffff"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-opacity="0.75"
                />
                <!-- 第四行带警告问号/圆点 -->
                <circle cx="6" cy="59" r="2.5" fill="#f59e0b" />
                <line
                  x1="12"
                  y1="59"
                  x2="32"
                  y2="59"
                  stroke="#ffffff"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-opacity="0.75"
                />
              </g>
            </g>

            <!-- 浮动辅助组件：评审对话协作气泡 -->
            <g class="es-float-sec">
              <g transform="translate(132, 32)">
                <!-- 气泡投影 -->
                <ellipse
                  cx="20"
                  cy="38"
                  rx="14"
                  ry="4"
                  fill="var(--tp-primary-dark)"
                  fill-opacity="0.15"
                  filter="blur(2px)"
                />
                <!-- 气泡主体（含向下尖角） -->
                <polygon points="12,24 16,32 22,24" fill="url(#es-grad-secondary)" />
                <rect x="0" y="0" width="36" height="25" rx="8" fill="url(#es-grad-secondary)" />
                <!-- 气泡内的对话抽象线条 -->
                <line
                  x1="8"
                  y1="8"
                  x2="28"
                  y2="8"
                  stroke="#ffffff"
                  stroke-width="2"
                  stroke-linecap="round"
                />
                <line
                  x1="8"
                  y1="15"
                  x2="22"
                  y2="15"
                  stroke="#ffffff"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </g>
            </g>

            <!-- 浮动辅助组件：放大镜审计 -->
            <g class="es-magnifier">
              <!-- 镜柄 -->
              <rect
                x="14"
                y="14"
                width="5"
                height="18"
                rx="2"
                fill="var(--tp-gray-600)"
                transform="rotate(-45 14 14)"
              />
              <!-- 镜圈 -->
              <circle
                cx="10"
                cy="10"
                r="10"
                fill="none"
                stroke="var(--tp-gray-400)"
                stroke-width="2.5"
              />
              <!-- 镜面玻璃反射 -->
              <circle cx="10" cy="10" r="8.5" fill="rgba(34, 211, 238, 0.25)" />
              <path
                d="M5,5 Q10,2 15,5"
                fill="none"
                stroke="#ffffff"
                stroke-width="1"
                stroke-linecap="round"
                stroke-opacity="0.7"
              />
            </g>
          </g>

          <!-- 3. AI模型配置插图 (type === 'aimodel') -->
          <g v-else-if="type === 'aimodel'">
            <!-- 核心阴影/底盘发光 -->
            <ellipse
              cx="120"
              cy="122"
              rx="40"
              ry="15"
              fill="var(--tp-primary-dark)"
              fill-opacity="0.2"
              filter="blur(3px)"
            />

            <!-- 浮动核心组件：AI 智能芯片 -->
            <g class="es-float-main">
              <!-- 芯片底座厚度 -->
              <polygon
                points="120,62 165,82 120,102 75,82"
                fill="var(--tp-primary-dark)"
                opacity="0.8"
              />
              <!-- 芯片主体面板 -->
              <polygon
                points="120,58 162,79 120,100 78,79"
                fill="var(--tp-surface-card)"
                stroke="var(--tp-border-strong)"
                stroke-width="1.5"
              />

              <!-- 芯片边缘彩色金属触点 -->
              <!-- 西北侧触点 -->
              <line x1="88" y1="74" x2="94" y2="71" stroke="#2dd4bf" stroke-width="2" />
              <line x1="96" y1="70" x2="102" y2="67" stroke="#2dd4bf" stroke-width="2" />
              <line x1="104" y1="66" x2="110" y2="63" stroke="#2dd4bf" stroke-width="2" />

              <!-- 东北侧触点 -->
              <line x1="152" y1="74" x2="146" y2="71" stroke="#8b5cf6" stroke-width="2" />
              <line x1="144" y1="70" x2="138" y2="67" stroke="#8b5cf6" stroke-width="2" />
              <line x1="136" y1="66" x2="130" y2="63" stroke="#8b5cf6" stroke-width="2" />

              <!-- 西南侧触点 -->
              <line x1="88" y1="84" x2="94" y2="87" stroke="#8b5cf6" stroke-width="2" />
              <line x1="96" y1="88" x2="102" y2="91" stroke="#8b5cf6" stroke-width="2" />
              <line x1="104" y1="92" x2="110" y2="95" stroke="#8b5cf6" stroke-width="2" />

              <!-- 东南侧触点 -->
              <line x1="152" y1="84" x2="146" y2="87" stroke="#2dd4bf" stroke-width="2" />
              <line x1="144" y1="88" x2="138" y2="91" stroke="#2dd4bf" stroke-width="2" />
              <line x1="136" y1="92" x2="130" y2="95" stroke="#2dd4bf" stroke-width="2" />

              <!-- 内部印刷电路纹路 -->
              <polygon
                points="120,68 145,80 120,92 95,80"
                fill="none"
                stroke="var(--tp-primary)"
                stroke-width="1"
                stroke-opacity="0.3"
              />
              <line
                x1="120"
                y1="68"
                x2="120"
                y2="92"
                stroke="var(--tp-primary)"
                stroke-opacity="0.2"
              />
              <line
                x1="95"
                y1="80"
                x2="145"
                y2="80"
                stroke="var(--tp-primary)"
                stroke-opacity="0.2"
              />

              <!-- 芯片中心的发光量子核心 -->
              <ellipse cx="120" cy="79" rx="15" ry="8" fill="url(#es-bg-glow)" />
              <!-- 核心立体球体/能量球 -->
              <circle cx="120" cy="76" r="10" fill="url(#es-grad-primary)" />
              <circle cx="117" cy="73" r="3" fill="#ffffff" opacity="0.6" />
            </g>

            <!-- 环绕能量轨道（带粒子） -->
            <g class="es-float-sec">
              <!-- 轨道 -->
              <ellipse
                cx="120"
                cy="72"
                rx="50"
                ry="22"
                fill="none"
                stroke="url(#es-grad-secondary)"
                stroke-width="1.2"
                stroke-dasharray="4 8"
                opacity="0.7"
              />
              <!-- 轨道上流动的粒子 -->
              <circle cx="70" cy="72" r="3" fill="#2dd4bf" />
              <circle cx="170" cy="72" r="2.5" fill="#6366f1" />
            </g>

            <!-- 顶部悬浮的 AI 神经网络连接点 -->
            <g class="es-float-nodes">
              <!-- 细的虚线连接到中央核心 -->
              <line
                x1="120"
                y1="76"
                x2="90"
                y2="40"
                stroke="var(--tp-primary)"
                stroke-width="1"
                stroke-dasharray="2 3"
                opacity="0.5"
              />
              <line
                x1="120"
                y1="76"
                x2="155"
                y2="45"
                stroke="var(--tp-primary)"
                stroke-width="1"
                stroke-dasharray="2 3"
                opacity="0.5"
              />
              <line
                x1="120"
                y1="76"
                x2="120"
                y2="30"
                stroke="var(--tp-primary)"
                stroke-width="1"
                stroke-dasharray="2 3"
                opacity="0.5"
              />

              <!-- 连接点球体 -->
              <g transform="translate(90, 40)" class="es-node-glow">
                <circle cx="0" cy="0" r="4" fill="#a78bfa" />
                <circle
                  cx="0"
                  cy="0"
                  r="7"
                  fill="none"
                  stroke="#a78bfa"
                  stroke-width="1"
                  opacity="0.5"
                />
              </g>
              <g transform="translate(155, 45)" class="es-node-glow">
                <circle cx="0" cy="0" r="3.5" fill="#2dd4bf" />
                <circle
                  cx="0"
                  cy="0"
                  r="6"
                  fill="none"
                  stroke="#2dd4bf"
                  stroke-width="1"
                  opacity="0.5"
                />
              </g>
              <g transform="translate(120, 30)" class="es-node-glow">
                <circle cx="0" cy="0" r="4.5" fill="#ec4899" />
                <circle
                  cx="0"
                  cy="0"
                  r="8"
                  fill="none"
                  stroke="#ec4899"
                  stroke-width="1"
                  opacity="0.5"
                />
              </g>
            </g>
          </g>

          <!-- AI星尘粒子 -->
          <g class="es-aura">
            <path
              d="M72,60 Q76,60 76,56 Q76,60 80,60 Q76,60 76,64 Q76,60 72,60 Z"
              fill="#ec4899"
              class="sparkle-1"
            />
            <path
              d="M165,36 Q168,36 168,33 Q168,36 171,36 Q168,36 168,39 Q168,36 165,36 Z"
              fill="#a78bfa"
              class="sparkle-2"
            />
            <path
              d="M58,118 Q61,118 61,115 Q61,118 64,118 Q61,118 61,121 Q61,118 58,118 Z"
              fill="#2dd4bf"
              class="sparkle-3"
            />
          </g>
        </svg>
      </template>

      <!-- 操作按钮槽 -->
      <template #default>
        <el-button v-if="showAction" type="primary" class="es-action-btn" @click="handleAction">
          {{ actionText || '去新建' }}
        </el-button>
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.empty-state-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--tp-space-8) 0;
  width: 100%;
}

/* 覆盖 Element Plus 默认样式，让其更美观舒适 */
:deep(.el-empty) {
  padding: var(--tp-space-6) 0;
}

:deep(.el-empty__description) {
  margin-top: var(--tp-space-4);
  font-size: var(--tp-text-sm);
  color: var(--tp-text-muted);
  font-weight: var(--tp-font-medium);
}

:deep(.el-empty__bottom) {
  margin-top: var(--tp-space-6);
}

/* 自定义 SVG 占位图样式 */
.empty-state-svg {
  width: 100%;
  max-width: 240px;
  height: auto;
  overflow: visible;
}

/* 渐变按钮 */
.es-action-btn {
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  border: none;
  font-weight: var(--tp-font-bold);
  padding: 8px var(--tp-space-6);
  border-radius: var(--tp-btn-radius);
  box-shadow: var(--tp-btn-shadow);
  transition: all var(--tp-transition);
  height: var(--tp-btn-height-md);
}

.es-action-btn:hover {
  background: var(--tp-btn-bg-hover);
  box-shadow: var(--tp-btn-shadow-hover);
  transform: translateY(-1px);
}

.es-action-btn:active {
  transform: translateY(0);
}

/* ── 动画定义 ── */

/* 主卡片悬浮浮动 */
.es-float-main {
  animation: floatMain 4s ease-in-out infinite;
}

@keyframes floatMain {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

/* 辅助齿轮浮动（略带延迟与更小幅度） */
.es-float-sec {
  animation: floatSec 3.5s ease-in-out infinite;
}

@keyframes floatSec {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

/* 齿轮旋转动画 */
.es-gear-rotate {
  transform-origin: 15px 15px;
  animation: rotateGear 12s linear infinite;
}

@keyframes rotateGear {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 星尘闪烁动画 */
.sparkle-1 {
  animation: pulseSparkle 2s ease-in-out infinite;
}
.sparkle-2 {
  animation: pulseSparkle 2.5s ease-in-out infinite 0.5s;
}
.sparkle-3 {
  animation: pulseSparkle 3s ease-in-out infinite 1s;
}

@keyframes pulseSparkle {
  0%,
  100% {
    opacity: 0.2;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* 放大镜微动动画 */
.es-magnifier {
  animation: floatMagnifier 5s ease-in-out infinite;
}

@keyframes floatMagnifier {
  0%,
  100% {
    transform: translate(122px, 70px) rotate(0deg) scale(1);
  }
  50% {
    transform: translate(125px, 66px) rotate(-6deg) scale(1.05);
  }
}

/* AI 神经网络连接点浮动 */
.es-float-nodes {
  animation: floatNodes 4.5s ease-in-out infinite;
}

@keyframes floatNodes {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

/* 神经网络节点发光呼吸灯效果 */
.es-node-glow {
  animation: nodeGlow 3s ease-in-out infinite alternate;
}

@keyframes nodeGlow {
  0% {
    opacity: 0.8;
    transform: scale(0.95);
  }
  100% {
    opacity: 1;
    transform: scale(1.05);
  }
}
</style>
