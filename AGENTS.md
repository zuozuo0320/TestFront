# AGENTS.md

## TestFront 前端规则

修改本目录下任何 Vue、TypeScript、CSS、路由、Store、API、测试或构建配置前，必须先阅读并遵守：

- `../.devin/rules/testfront-frontend-rules.md`
- `../.devin/skills/ui-ux-pro-max/SKILL.md`（任何 UI/UX、样式、组件、页面、交互、响应式、可访问性改动必须自动使用）

## 强制约定

- 所有前端开发、修复、重构都必须按该规则执行。
- 所有影响界面观感、交互体验或用户操作路径的改动，必须先使用 `ui-ux-pro-max` 保障前端美观性、专业感和可访问性。
- 触碰已有违规代码时，必须治理本次触碰区域，禁止继续扩大旧债。
- 完成后按变更范围运行 `npm run lint`、`npm run type-check`、`npm run test`、`npm run build`；无法运行时必须说明原因。
