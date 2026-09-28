# Agent Note：模型选择面板直达「添加模型提供商」

Status: implemented

[English](2026-09-28-model-picker-add-custom-model-entry.md) | 中文

## 问题

当目录里没有合适的模型时，用户没有任何可执行的下一步。输入框右下角的模型选择面板只列出模型与推理等级；添加提供商或声明自定义路由藏在「设置 → 模型」里，需要先打开设置、找到分区、再按添加按钮。

而模型选择面板与模型设置页属于不同的功能插件，客户端功能插件之间不允许 value 导入：行为经注入式 Cordis 服务跨包，界面经 slot 跨包。此前没有任何机制能让选择面板打开设置并定位到某个分区，更无法请该分区直接开始一个流程。

## 决策

**由设置领域基础层持有该契约。** `ui-settings` 声明 `SettingsNavigation`（`open(sectionId?, intent?)`）与 `ctx.settingsNavigation` 的 Context 合并，并为 `SettingsSectionOwnerProps` 增加 `intent`/`onIntentHandled`。shell（`ui-settings-general`）基于自身的视图 store 实现该服务，因此产品内任意位置打开的都与侧边栏底部同一个面板。

**意图是一次性、由注册方定义的 id。** shell store 把 `intent` 与 `activeId` 放在一起，作为 owner props 交给当前分区，并在任何普通打开、导航切换或关闭时丢弃。`SettingsSectionIntent` 列出已发布的 id；基础层保持通用，因为含义由认领该 id 的分区决定。

**每个入口共用一套实现。** `ModelsSection` 把添加卡片的输入抽为 `addInputs` 与唯一的 `openAddCard`，使入口按钮与选择面板的意图以同一方式打开同一张卡片；意图会等待与按钮相同的「提供商 / 设置 / 凭据」联表就绪。

**选择面板把该入口放在卡片首位。** `ModelSelect` 在当前 pane 之上渲染「+ 添加自定义模型」入口，关闭卡片，并经注入面交棒。该入口进入 root pane 的漫游焦点顺序，但不进入已下钻列表的顺序：`moveFocus` 按当前 pane 限定作用域，pane 切换时的焦点恢复改用命名 ref 定位根单元格，而非依赖位置。

## 考虑过的其他做法

**再建一个模型专属服务。** 由 `ui-settings-models` 暴露 `openAddProvider()`，会把「打开面板」的能力挂到一个输入框座位本无理由依赖的功能包上，而且下一个需要分区意图的功能仍要重新造一遍。

**在导航服务上挂一个请求 store。** 服务本可携带一个供分区订阅的 store。但 owner props 已经能精确送达当前分区，那样只会多一个订阅，并为 shell 已持有的状态制造第二个事实来源。

**只支持鼠标的入口。** 把该入口排除在漫游焦点顺序之外可以不动既有键盘遍历，但一个任何按键都到不了的动效不是菜单项。

## 影响

- 任意功能都能在注册分区上打开设置并声明一次性意图，无需依赖 shell 包。
- 忽略 `intent` 的分区不受影响：不属于它的 id 会被直接丢弃。
- 模型选择面板首位多出一行，root pane 的键盘遍历会包含它。
- 意图是状态而非路由——正常重新打开设置时，分区维持原样，不会弹出添加卡片。
