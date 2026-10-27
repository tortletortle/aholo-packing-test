# Packing Test — 3D 装箱技术小样

固定俯视斜角 + 键盘逐格移动 + 组合占格判定。  
无物理引擎、无经营/剧情；几何体占位。真实不规则模型接入 **尚未验证**。

## 要求

- Node.js ≥ 18（本机已用官方 Node 24 / npm 11）
- 默认开发端口 **5174**（避免与赛车原型 5173 冲突）

## 命令

```powershell
cd C:\Workspace\01_Projects\3D\prototypes\packing-test
$env:Path = "C:\Program Files\nodejs;" + $env:Path

npm install
npm run dev      # http://127.0.0.1:5174/
# 停止：终端 Ctrl+C

npm test         # 纯逻辑 vitest
npm run build    # 产出 dist/
npm run preview  # http://127.0.0.1:4174/
```

## 操作

| 操作 | 键 / UI |
|---|---|
| 选择物品 | 点击右侧列表（未放入 / 已放入均可；已放入=取出重摆） |
| 移动一格 | `WASD` 或方向键（按住可重复） |
| 水平旋转 90° | `R` |
| 确认占格 | `Enter`（仅预览合法时生效） |
| 取消 | `Esc`（重摆取消后布局不变） |
| 两层示例 | 「载入两层示例布局」按钮 |

预览为半透明；不可放置时状态区有**文字原因**（越界/重叠/无支撑/部分支撑/上方阻挡），不只靠颜色。  
输入框等可编辑控件聚焦时不响应游戏快捷键。

## 架构

- `src/logic/` — 占格集合、支撑、封闭空隙、游戏状态（可单测）
- `src/view/` — Three.js 渲染
- `src/input/` — 键盘
- `src/ui/` — 列表与状态

箱子：`6×4` 底面 × `2` 层。支撑规则：首版要求完整足迹底面支撑；从上向下落入，不可穿入封闭空隙。

## 验证报告

见 `_verify/PACKING_VERIFY.md`。
