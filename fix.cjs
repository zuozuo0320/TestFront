const fs = require('fs');

const currentFile = 'd:/ai_project/TestFront/src/views/system/UserManagement.vue';
const tmpUiFile = 'd:/ai_project/TestFront/tmp_ui.vue';

let currentContent = fs.readFileSync(currentFile, 'utf8');
let tmpUiContent = fs.readFileSync(tmpUiFile, 'utf8');

// 1. Extract the current script block from UserManagement.vue
const scriptStart = currentContent.indexOf('<script setup');
const scriptEnd = currentContent.indexOf('</script>') + 9;
let scriptBlock = '';
if (scriptStart !== -1 && scriptEnd !== -1) {
    scriptBlock = currentContent.substring(scriptStart, scriptEnd);
}

// 2. Extract the full template and style from tmp_ui.vue
// tmpUi has some <User /> tags that need to be replaced if they haven't been
tmpUiContent = tmpUiContent.replace(/<IconUser *\/>/g, '<User />');
tmpUiContent = tmpUiContent.replace(/<IconSelect *\/>/g, '<Select />');

const tplStart = tmpUiContent.indexOf('<template>');
const tplEnd = tmpUiContent.lastIndexOf('</template>') + 11;
const styleStart = tmpUiContent.indexOf('<style scoped>');

const fullTpl = tmpUiContent.substring(tplStart, tplEnd);
const fullStyle = tmpUiContent.substring(styleStart);

// 3. Recombine EVERYTHING into UserManagement.vue
const finalContent = fullTpl + '\n\n' + scriptBlock + '\n\n' + fullStyle;

fs.writeFileSync(currentFile, finalContent);
