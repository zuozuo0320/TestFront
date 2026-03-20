<script setup lang="ts">
import { List, CircleCheck, Aim, TrendCharts } from '@element-plus/icons-vue'
import { useProjectStore } from '../stores/project'
import { useTestCaseStore } from '../stores/testcase'

const projectStore = useProjectStore()
const testCaseStore = useTestCaseStore()
</script>

<template>
  <div class="module-card">
    <div class="dashboard-grid">
      <div class="dash-card">
        <div class="dash-icon blue"><el-icon><List /></el-icon></div>
        <div class="dash-info">
          <div class="dash-label">总用例数</div>
          <div class="dash-value">{{ testCaseStore.total || 0 }}</div>
          <div class="dash-sub">当前项目</div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dash-icon green"><el-icon><CircleCheck /></el-icon></div>
        <div class="dash-info">
          <div class="dash-label">通过率</div>
          <div class="dash-value">--</div>
          <div class="dash-sub">% passed</div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dash-icon amber"><el-icon><Aim /></el-icon></div>
        <div class="dash-info">
          <div class="dash-label">今日执行</div>
          <div class="dash-value">0</div>
          <div class="dash-sub">executions</div>
        </div>
      </div>
      <div class="dash-card">
        <div class="dash-icon purple"><el-icon><TrendCharts /></el-icon></div>
        <div class="dash-info">
          <div class="dash-label">活跃项目</div>
          <div class="dash-value">{{ projectStore.projects.length }}</div>
          <div class="dash-sub">projects</div>
        </div>
      </div>
    </div>

    <div class="activity-card">
      <div class="activity-title">最近活动</div>
      <div class="timeline">
        <div class="timeline-item">
          <div class="timeline-dot active"></div>
          <div class="timeline-content">
            <div class="timeline-text">系统初始化完成，已创建默认项目与角色</div>
            <div class="timeline-time">system · just now</div>
          </div>
        </div>
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-text">种子数据导入成功，包含示例用例</div>
            <div class="timeline-time">seed · on deploy</div>
          </div>
        </div>
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-text">工作台仪表盘、测试计划、E2E模块即将上线</div>
            <div class="timeline-time">roadmap · coming soon</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
