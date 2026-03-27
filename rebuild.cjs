const fs = require('fs');
const file = 'd:/ai_project/TestFront/src/views/system/UserManagement.vue';
let content = fs.readFileSync(file, 'utf8');

const tplStart = content.indexOf('<template>');
const styleEnd = content.lastIndexOf('</style>') + 8;

const before = content.substring(0, tplStart);

const newTpl = `<template>
  <div v-loading="usersLoading" class="um-root">

    <div class="um-top-header">
      <div class="um-th-left">
        <h2 class="um-title">User Management</h2>
        <nav class="um-nav">
          <a class="um-nav-item active">All Users</a>
          <a class="um-nav-item">Roles</a>
          <a class="um-nav-item">Permissions</a>
          <a class="um-nav-item">Audit Logs</a>
        </nav>
      </div>
      <div class="um-th-right">
        <div class="um-search-box">
          <el-icon class="um-search-icon"><Search /></el-icon>
          <input type="text" class="um-search-input" placeholder="搜索用户..." v-model="searchKeyword" />
        </div>
        <div class="um-toolbar-icons">
          <button class="um-icon-btn um-notify">
            <el-icon><Bell /></el-icon>
            <span class="um-notify-dot"></span>
          </button>
          <button class="um-icon-btn"><el-icon><Grid /></el-icon></button>
          <div class="um-avatar-border">
            <img class="um-admin-avatar" src="https://api.dicebear.com/7.x/initials/svg?seed=Admin" alt="Admin" />
          </div>
        </div>
        <button class="um-add-btn" @click="openCreateUser">ADD USER</button>
      </div>
    </div>

    <div class="um-dashboard-bento">
      <div class="um-bento-card">
        <div class="um-bento-bg-icon group-hover-icon"><el-icon><IconUser /></el-icon></div>
        <p class="um-bento-label">总用户量</p>
        <div class="um-bento-value-row">
          <h3 class="um-bento-value text-white">{{ users.length.toLocaleString() }}</h3>
          <span class="um-bento-trend success">↑ 12%</span>
        </div>
      </div>
      <div class="um-bento-card">
        <div class="um-bento-bg-icon group-hover-icon"><el-icon><UserFilled /></el-icon></div>
        <p class="um-bento-label">活跃用户</p>
        <div class="um-bento-value-row">
          <h3 class="um-bento-value text-secondary">{{ activeUserCount.toLocaleString() }}</h3>
          <span class="um-bento-trend faint">76.6% 转化率</span>
        </div>
      </div>
      <div class="um-bento-card col-span-2 flex-card">
        <div class="um-role-dist-wrapper">
          <p class="um-bento-label mb-md">角色分布 (Role Distribution)</p>
          <div class="um-role-bar">
            <div v-for="rd in roleDistribution" :key="rd.name" class="um-role-segment" :style="{ width: rd.percent + '%', background: rd.color }"></div>
          </div>
          <div class="um-role-legends">
            <span v-for="rd in roleDistribution" :key="rd.name" class="um-role-legend">
              <span class="um-legend-dot" :style="{ background: rd.color }"></span>
              {{ rd.displayName }} ({{ Math.round(rd.percent) }}%)
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- User List Panel -->
    <div class="um-list-panel">
      <div class="um-list-header">
        <div class="um-list-h-left">
          <h4 class="um-list-title">所有用户</h4>
          <span class="um-live-badge">LIVE UPDATE</span>
        </div>
        <div class="um-list-h-right">
          <button class="um-action-btn"><el-icon><Filter /></el-icon></button>
          <button class="um-action-btn"><el-icon><Download /></el-icon></button>
        </div>
      </div>

      <div class="um-table-wrapper">
        <table class="um-table">
          <thead>
            <tr>
              <th>用户信息</th>
              <th>角色级别</th>
              <th>最后登录</th>
              <th>状态</th>
              <th class="text-right">管理操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in pagedUsers" :key="u.id" class="um-tr">
              <td>
                <div class="um-user-cell">
                  <div class="um-avatar-glass">
                    <img :src="resolveAvatarUrl(u.avatar, u.name)" />
                  </div>
                  <div class="um-user-text">
                    <p class="um-name">{{ u.name }}</p>
                    <p class="um-email">{{ u.email }}</p>
                  </div>
                </div>
              </td>
              <td>
                <span class="um-role-badge" :style="{ color: getRoleAccentColor(u), backgroundColor: \`\${getRoleAccentColor(u)}1A\`, borderColor: \`\${getRoleAccentColor(u)}33\` }">
                  {{ u.role_names[0] || u.role || '未分配' }}
                </span>
              </td>
              <td>
                <p class="um-time">{{ getMockRelativeTime(u.id) }}</p>
                <p class="um-ip">IP: {{ getMockIp(u.id) }}</p>
              </td>
              <td>
                <div class="um-status-cell">
                  <span class="um-status-dot" :class="u.active ? 'active' : 'disabled'"></span>
                  <span class="um-status-text" :class="u.active ? 'text-success' : 'text-error'">{{ u.active ? '在线' : '禁用' }}</span>
                </div>
              </td>
              <td class="text-right">
                <div class="um-actions-cell">
                  <button class="um-act hover-white" title="Edit" @click="openEditUser(u)"><el-icon><Edit /></el-icon></button>
                  <button class="um-act hover-secondary" title="Reset Password" @click="openResetPwd(u)"><el-icon><Clock /></el-icon></button>
                  <button class="um-act" :class="u.active ? 'hover-error' : 'hover-success'" :title="u.active ? 'Disable' : 'Enable'" :disabled="isAdmin(u)" @click="!isAdmin(u) && removeUser(u)">
                    <el-icon><CircleClose v-if="u.active" /><IconSelect v-else /></el-icon>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!usersLoading && filteredUsers.length === 0" class="um-empty">暂无用户</div>
      </div>

      <div v-if="filteredUsers.length > 0" class="um-pagination">
        <div>显示 {{ (userPage - 1) * userPageSize + 1 }} - {{ Math.min(userPage * userPageSize, filteredUsers.length) }} 的 {{ filteredUsers.length.toLocaleString() }} 名用户</div>
        <el-pagination
          background
          small
          :current-page="userPage"
          :page-size="userPageSize"
          :total="filteredUsers.length"
          layout="prev, pager, next"
          @current-change="onUserPaginationCurrentChange"
        />
      </div>
    </div>

    <!-- Security Cards -->
    <div class="um-security-section">
      <div class="um-sec-panel sys-logs">
        <div class="um-sec-header">
          <h5 class="um-sec-title">系统安全日志</h5>
          <button class="um-sec-link">查看全部</button>
        </div>
        <div class="um-log-list">
          <div v-for="log in sysLogs" :key="log.id" class="um-log-row group">
            <div class="um-log-dot" :class="log.type"></div>
            <div class="um-log-content">
              <p class="um-log-desc"><span class="text-white">{{ log.title }}:</span> {{ log.desc }}</p>
              <span class="um-log-time">{{ log.time }}</span>
            </div>
            <button class="um-log-link"><el-icon><Edit /></el-icon></button> <!-- Fake external icon -->
          </div>
        </div>
      </div>

      <div class="um-sec-panel audit-status">
        <el-icon class="um-audit-bg-icon"><Clock /></el-icon>
        <h6 class="um-sec-title white-text mb-md">安全审查状态</h6>
        <div class="um-audit-progress">
          <div class="um-audit-bar-track">
            <div class="um-audit-bar-fill"></div>
          </div>
          <span class="um-audit-pct">92%</span>
        </div>
        <p class="um-audit-desc">您的系统安全等级为“优”。当前有 12 个账号未开启多因素认证 (MFA)，建议立即执行审查。</p>
        <button class="um-audit-btn">启动全员审查</button>
      </div>
    </div>

    <!-- Dialogs -->
    <el-dialog v-model="userDialogVisible" :title="editingUserId ? '编辑用户' : '新建用户'" width="640px" class="um-dialog">
      <el-form label-position="top">
        <el-form-item label="姓名">
          <el-input v-model="userForm.name" placeholder="2-40字符" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="userForm.email" :disabled="!!editingUserId" placeholder="登录邮箱（创建后不可修改）" />
        </el-form-item>
        <el-form-item v-if="!editingUserId" label="初始密码">
          <el-input v-model="userForm.password" type="password" show-password placeholder="≥8位，含大写+小写+数字" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="userForm.phone" placeholder="选填" />
        </el-form-item>
        <el-form-item label="角色（必选，可多选）">
          <el-select v-model="userForm.roleIds" multiple filterable placeholder="请选择角色" style="width: 100%">
            <el-option v-for="r in editingUserId ? roles : creatableRoles" :key="r.id" :label="r.display_name || r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目（必选，可多选）">
          <el-select v-model="userForm.projectIds" multiple filterable placeholder="请选择项目" style="width: 100%">
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="userForm.active" active-text="启用" inactive-text="冻结" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingUser" @click="submitUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetPwdDialogVisible" title="重置密码" width="440px" class="um-dialog">
      <p style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.6); font-size: 13px">
        为用户【{{ resetPwdUserName }}】设置新密码
      </p>
      <el-form label-position="top">
        <el-form-item label="新密码">
          <el-input v-model="resetPwdForm.newPassword" type="password" show-password placeholder="≥8位，含大写+小写+数字" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="resettingPwd" @click="submitResetPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ── Typography & Variables ── */
.um-root {
  --bg-main: #11131e;
  --bg-card: #191b26;
  --bg-card-high: #272935;
  --text-on-surface: #e1e1f2;
  --text-on-surface-variant: #ccc3d8;
  --text-slate: #94a3b8;
  --primary: #d2bbff;
  --secondary: #adc6ff;
  --tertiary: #ffb784;
  --error: #ffb4ab;
  --success: #10b981;
  --primary-container: #7c3aed;
  --secondary-container: #0566d9;
  --border-light: rgba(74, 68, 85, 0.1);
  --border-lighter: rgba(74, 68, 85, 0.05);

  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--text-on-surface);
  line-height: 1.5;
  min-height: 100vh;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Utilities */
.text-white { color: #fff; }
.text-secondary { color: var(--secondary); }
.text-success { color: var(--success); }
.text-error { color: var(--error); }
.mb-md { margin-bottom: 16px; }

/* ── Top Header ── */
.um-top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 32px;
  background: rgba(17, 19, 30, 0.8);
  backdrop-filter: blur(24px);
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-lighter);
}
.um-th-left { display: flex; align-items: center; gap: 32px; }
.um-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-slate);
  margin: 0;
}
.um-nav { display: flex; gap: 24px; }
.um-nav-item {
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-slate);
  padding-bottom: 8px;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}
.um-nav-item:hover { color: #fff; }
.um-nav-item.active {
  color: var(--primary);
  border-bottom-color: var(--primary-container);
  font-weight: 700;
}

.um-th-right { display: flex; align-items: center; gap: 24px; }
.um-search-box { position: relative; }
.um-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
}
.um-search-input {
  background: #0c0e18;
  border: none;
  border-radius: 8px;
  padding: 6px 16px 6px 40px;
  font-size: 12px;
  color: #fff;
  width: 256px;
  outline: none;
}
.um-search-input::placeholder { color: #475569; }

.um-toolbar-icons {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-left: 24px;
  border-left: 1px solid rgba(74, 68, 85, 0.2);
}
.um-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-slate);
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  display: flex;
  transition: color 0.2s;
}
.um-icon-btn:hover { color: #fff; }
.um-notify { position: relative; }
.um-notify-dot {
  absolute: true;
  right: -2px;
  top: -2px;
  width: 8px;
  height: 8px;
  background: var(--primary);
  border: 2px solid var(--bg-main);
  border-radius: 50%;
}
.um-avatar-border {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(210, 187, 255, 0.3);
  overflow: hidden;
}
.um-admin-avatar { width: 100%; height: 100%; object-fit: cover; }
.um-add-btn {
  background: linear-gradient(to right, var(--primary-container), var(--secondary-container));
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.02em;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.um-add-btn:active { box-shadow: 0 0 15px rgba(124, 58, 237, 0.5); transform: scale(0.98); }

/* ── Bento Grid ── */
.um-dashboard-bento {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}
.um-bento-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.um-bento-card.col-span-2 { grid-column: span 2; }
.um-bento-bg-icon {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 60px;
  opacity: 0.1;
  transition: opacity 0.3s;
}
.um-bento-card:hover .um-bento-bg-icon { opacity: 0.2; }
.um-bento-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-on-surface-variant);
  margin: 0 0 8px 0;
}
.um-bento-value-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.um-bento-value {
  font-size: 36px;
  font-weight: 600;
  margin: 0;
  line-height: 1;
}
.um-bento-trend { font-size: 12px; font-weight: 500; margin-bottom: 4px; }
.um-bento-trend.success { color: var(--success); }
.um-bento-trend.faint { color: #64748b; }

.um-role-dist-wrapper { flex: 1; }
.um-role-bar {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--bg-card-high);
}
.um-role-segment { height: 100%; }
.um-role-legends {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-slate);
}
.um-role-legend { display: flex; align-items: center; gap: 6px; }
.um-legend-dot { width: 8px; height: 8px; border-radius: 50%; }

/* ── User List Panel ── */
.um-list-panel {
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-lighter);
  overflow: hidden;
}
.um-list-header {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-light);
}
.um-list-h-left { display: flex; align-items: center; gap: 16px; }
.um-list-title { font-size: 18px; font-weight: 600; margin: 0; }
.um-live-badge {
  background: var(--bg-card-high);
  color: var(--primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}
.um-list-h-right { display: flex; gap: 8px; }
.um-action-btn {
  background: var(--bg-card-high);
  border: none;
  padding: 8px;
  border-radius: 8px;
  color: var(--text-slate);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}
.um-action-btn:hover { color: #fff; }

.um-table-wrapper { width: 100%; overflow-x: auto; }
.um-table { width: 100%; border-collapse: collapse; text-align: left; }
.um-table th {
  padding: 16px 24px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
  border-bottom: 1px solid var(--border-lighter);
}
.um-tr { transition: background 0.2s; }
.um-tr:hover { background: rgba(255, 255, 255, 0.02); }
.um-tr td {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-lighter);
  vertical-align: middle;
}
.um-user-cell { display: flex; align-items: center; gap: 12px; }
.um-avatar-glass {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
}
.um-avatar-glass img { width: 100%; height: 100%; object-fit: cover; }
.um-name { font-size: 14px; font-weight: 600; color: var(--text-on-surface); margin: 0; }
.um-email { font-size: 11px; color: #64748b; margin: 0; }

.um-role-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -0.02em;
  border: 1px solid transparent;
}

.um-time { font-size: 12px; color: var(--text-on-surface-variant); margin: 0; }
.um-ip { font-size: 10px; color: #475569; margin: 0; }

.um-status-cell { display: flex; align-items: center; gap: 8px; }
.um-status-dot { width: 8px; height: 8px; border-radius: 50%; }
.um-status-dot.active { background: var(--success); box-shadow: 0 0 8px rgba(16, 185, 129, 0.5); }
.um-status-dot.disabled { background: var(--error); box-shadow: 0 0 8px rgba(239, 68, 68, 0.5); }
.um-status-text { font-size: 12px; font-weight: 500; }

.um-actions-cell {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  opacity: 0.4;
  transition: opacity 0.2s;
}
.um-tr:hover .um-actions-cell { opacity: 1; }
.um-act {
  background: transparent;
  border: none;
  padding: 8px;
  border-radius: 8px;
  color: var(--text-slate);
  cursor: pointer;
  display: flex;
  transition: all 0.2s;
}
.um-act:hover { background: var(--bg-card-high); }
.um-act.hover-white:hover { color: #fff; }
.um-act.hover-secondary:hover { color: var(--secondary); }
.um-act.hover-error:hover { color: var(--error); }
.um-act.hover-success:hover { color: var(--success); }
.um-act:disabled { opacity: 0.3; cursor: not-allowed; }

.um-empty { text-align: center; padding: 48px; color: #64748b; font-size: 14px; }

.um-pagination {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
  border-top: 1px solid var(--border-lighter);
}
.um-pagination :deep(.el-pagination) {
  --el-pagination-bg-color: transparent;
  --el-pagination-button-disabled-bg-color: transparent;
  --el-pagination-hover-color: #fff;
}
.um-pagination :deep(.btn-prev), .um-pagination :deep(.btn-next) { color: #64748b; }
.um-pagination :deep(.el-pager li) {
  background: transparent;
  color: #64748b;
  border-radius: 4px;
}
.um-pagination :deep(.el-pager li.is-active) {
  background: var(--primary-container) !important;
  color: #fff;
}
.um-pagination :deep(.el-pager li:hover) { background: var(--bg-card-high); }

/* ── Security Cards ── */
.um-security-section {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 32px;
}
.um-sec-panel {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 24px;
}
.um-sec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.um-sec-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
}
.um-sec-title.white-text { color: #fff; }
.um-sec-link {
  background: none;
  border: none;
  font-size: 10px;
  font-weight: 700;
  color: var(--primary);
  text-transform: uppercase;
  cursor: pointer;
}
.um-sec-link:hover { text-decoration: underline; }

.um-log-list { display: flex; flex-direction: column; gap: 16px; }
.um-log-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px;
  border-radius: 8px;
  transition: background 0.2s;
}
.um-log-row:hover { background: rgba(255, 255, 255, 0.03); }
.um-log-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; }
.um-log-dot.danger { background: var(--error); }
.um-log-dot.primary { background: var(--secondary); }

.um-log-content { flex: 1; }
.um-log-desc { font-size: 12px; color: var(--text-on-surface); margin: 0 0 4px 0; }
.um-log-time { font-size: 10px; font-weight: 600; color: #475569; }
.um-log-link {
  background: none;
  border: none;
  color: #334155;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}
.um-log-row:hover .um-log-link { opacity: 1; }

.audit-status {
  background: linear-gradient(to bottom right, rgba(124, 58, 237, 0.2), rgba(5, 102, 217, 0.2));
  border: 1px solid rgba(210, 187, 255, 0.1);
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.um-audit-bg-icon {
  position: absolute;
  right: -16px;
  bottom: -16px;
  font-size: 120px;
  opacity: 0.1;
}
.um-audit-progress {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.um-audit-bar-track {
  flex: 1;
  height: 4px;
  background: var(--bg-card-high);
  border-radius: 99px;
  overflow: hidden;
}
.um-audit-bar-fill {
  width: 92%;
  height: 100%;
  background: var(--primary);
}
.um-audit-pct { font-size: 12px; font-weight: 700; color: var(--primary); }
.um-audit-desc {
  font-size: 11px;
  color: var(--text-slate);
  line-height: 1.6;
  margin-bottom: 24px;
  position: relative;
  z-index: 1;
}
.um-audit-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px;
  width: 100%;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
  z-index: 1;
}
.um-audit-btn:hover { background: rgba(255, 255, 255, 0.1); }

/* Modals */
.um-dialog :deep(.el-dialog) { background: #1e1e2d; border-radius: 12px; }
.um-dialog :deep(.el-dialog__title) { color: #fff; }
</style>
`;
fs.writeFileSync(file, before + newTpl);
