const fs = require('fs');
const file = 'd:/ai_project/TestFront/src/views/system/UserManagement.vue';
let content = fs.readFileSync(file, 'utf8');
const styleStart = content.indexOf('<style scoped>');
if (styleStart !== -1) {
  content = content.substring(0, styleStart);
}
fs.writeFileSync(file, content);
