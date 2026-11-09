# 探针项目开发与审查铁律

本项目包含前端（React 18 + Radix UI + Vite）与后端（Cloudflare Workers + Supabase）。所有在此项目进行开发维护的 Agent 必须严格遵守以下规范：

## React 与前端架构硬性审查铁律（防崩溃死锁）

1. Hook 物理置顶与绝无早退铁律：
   - 所有 `use*` 系列 Hooks（`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `useLayoutEffect`, 自定义 Hooks 等）必须无条件物理集中置顶于函数组件最前部。
   - **绝对禁止**在任何条件分支（`if`）、循环、事件回调、嵌套函数或任何形式的提前退出分支（早退如 `if (loading) return ...`、`if (error) return ...`）之后调用任何 Hook。所有分支返回必须严格位于全部 Hooks 执行完毕之后。

2. 全局生命周期时序推演（反局部盲区）：
   - 编写或修改前端大型视图组件时，严禁仅审视局部代码段，必须先通盘检索该组件内所有的 `return` 语句。
   - 必须逐一推演组件在“初次挂载（无数据/异步加载）”、“数据更新重新渲染”、“错误兜底”等全生命周期各阶段中，Hooks 的调用总数与执行顺序是否绝对恒定一致，彻底杜绝 React Error #300/#310 崩溃。

3. 交付前真机/无头挂载验证：
   - 前端代码修改后，严禁仅凭 `tsc` 或打包绿灯就草率交付（TypeScript 编译器默认不校验 Hook 执行时序）。
   - 涉及核心页面和复杂状态改动，必须通过无头浏览器挂载或自动化测试，实机核验控制台 0 项异常、0 项报错，且绝不命中 `ErrorBoundary` 后方可宣布交付。

## 敏感数据、凭据与 Git 提交门禁（强制执行）

1. **零环境变量文件提交**：
   - `.env*`、`.dev.vars*`（非 `.example` 模板）绝对禁止提交入库；修改配置模板时仅允许使用 `replace-with-...` 等显式占位符。

2. **零真实公钥与凭据数据入库**：
   - 数据库迁移（`supabase/migrations/*.sql`）只允许包含 DDL 与存储过程，严禁包含任何真实用户 Passkey 公钥（`public_key`）、`credential_id`、密码 Hash 或会话数据。
   - 单元测试与 Mock 数据中一律使用规范前缀（如 `TEST_`、`mock_`），严禁使用与生产环境不可区分的真实格式凭据。

3. **提交前必须进行确定性反查**：
   - 任何改动提交前，必须运行 `git diff --cached` 确保未包含任何真实 Cloudflare Account ID、Supabase 私有实例地址、私钥或 Telegram Token。
   - 必须确保本地 `.git/hooks/pre-commit` 处于激活状态，严禁使用 `--no-verify` 绕过安全提交检查。
