const fs = require('fs');
const originalFile = 'd:/ai_project/TestFront/src/views/system/UserManagement.vue';
const tmpUiFile = 'd:/ai_project/TestFront/tmp_ui.vue';

let orig = fs.readFileSync(originalFile, 'utf8');
let tmpUi = fs.readFileSync(tmpUiFile, 'utf8');

// The original file is `<template>...<script setup>...<style scoped>`
// Replace `<template>...</template>` with the one from `tmpUi`, and overwrite `<style scoped>...</style>` with the one from `tmpUi`.

// Grab the script logic from orig
const scriptStart = orig.indexOf('<script setup lang="ts">');
const scriptEnd = orig.indexOf('<\/script>') + 9;
if (scriptStart !== -1 && scriptEnd !== -1) {
    let scriptBlock = orig.substring(scriptStart, scriptEnd);

    // Inject icons
    scriptBlock = scriptBlock.replace(
      "import { Search, Plus } from '@element-plus/icons-vue'",
      "import { Search, Plus, Bell, Grid, User, UserFilled, Filter, Download, Edit, Clock, CircleClose, Select } from '@element-plus/icons-vue'"
    );

    // Inject mock data
    const injectStr = `
const sysLogs = ref([
  { id: 1, type: 'danger', title: '多地登录尝试拦截', desc: '用户 ID #9210 (na.li) 尝试从非法 IP 登录。', time: '2023-11-24 14:32:11' },
  { id: 2, type: 'primary', title: '角色变更提醒', desc: '管理员 伟杰 将用户提升为 [QA 工程师]。', time: '2023-11-24 12:05:54' }
]);
const getMockRelativeTime = (id) => id % 2 === 0 ? '2分钟前' : '3天前';
const getMockIp = (id) => id % 2 === 0 ? '192.168.1.45' : '18.23.4.192';
const resolveAvatarUrl = (avatar, name) => avatar || \`https://api.dicebear.com/7.x/initials/svg?seed=\${name}\`;
const getRoleAccentColor = (u) => {
  if (u.active === false) return '#ef4444';
  if ((u.role_names?.[0] || '').includes('管理员')) return '#d2bbff';
  if ((u.role_names?.[0] || '').includes('工程师')) return '#adc6ff';
  return '#94a3b8';
};
`;
    // Insert after "const searchKeyword = ref('')"
    scriptBlock = scriptBlock.replace("const searchKeyword = ref('')", "const searchKeyword = ref('')\n" + injectStr);

    // Fix the computed roleDistribution if needed to match `displayName` property
    scriptBlock = scriptBlock.replace(
      `return res\n})`,
      `res.forEach((r, i) => { r.displayName = r.name; r.color = ['#d2bbff', '#adc6ff', '#ffb784', '#ef4444'][i % 4]; });\n  return res\n})`
    );

    // Replace IconUser -> User, IconSelect -> Select in tmpUi
    tmpUi = tmpUi.replace(/<IconUser *\/>/g, '<User />');
    tmpUi = tmpUi.replace(/<IconSelect *\/>/g, '<Select />');

    // tmpUi has <template>...</template> <style scoped>...</style>
    const tplStart = tmpUi.indexOf('<template>');
    const tplEnd = tmpUi.lastIndexOf('</template>') + 11;
    const styleStart = tmpUi.indexOf('<style scoped>');

    const newTpl = tmpUi.substring(tplStart, tplEnd);
    const newStyle = tmpUi.substring(styleStart);

    const finalContent = newTpl + '\n\n' + scriptBlock + '\n\n' + newStyle;
    fs.writeFileSync(originalFile, finalContent);
} else {
    console.error("Script block not found!");
}
