# 迭代记录

说明：每一次功能/UI改动先单独记录在这里；正式打包发布时，再统一整理进软件内版本日志。

## 2026-05-07

### 01 大数据量采集卡顿优化
- 内容：前端事件队列由逐条消费改为批量消费，降低评论、进场、互动、送礼列表的高频渲染。
- 原因：数据量大时逐条 `setEvents` 会导致 React 高频重排、排序和去重，界面卡顿。
- 效果：采集高峰期 UI 更新次数减少，列表响应更稳定，不改变原采集和展示逻辑。

### 02 特别关注弹窗内容完整展示
- 内容：优化特别关注命中消息弹窗布局，长用户名、备注、消息内容支持换行和内部滚动。
- 原因：原弹窗存在文字截断、内容拥挤、显示不完整的问题。
- 效果：命中消息可完整查看，弹窗内容超出时在弹窗内部滚动。

### 03 顶部状态与直播链接单行展示
- 内容：将登录状态文本和直播间链接输入框合并为同一行展示。
- 原因：原布局分两行，占用顶部空间，信息不够紧凑。
- 效果：顶部信息更紧凑，直播链接区域更易读。

### 04 消息列表用户名去下划线
- 内容：移除进场、互动、评论、送礼列表中可点击用户名的下划线样式。
- 原因：下划线过多影响界面清爽度。
- 效果：消息列表视觉更干净，点击主页功能不变。

### 05 用户进场/用户互动左右分栏
- 内容：将“用户进场”和“用户互动”固定为左右并排展示，窄屏时再自动换行。
- 原因：上下堆叠浪费横向空间。
- 效果：主界面更紧凑，横向空间利用更高。

### 06 特别关注弹窗重构为命中消息浮层
- 内容：特别关注弹窗改为固定浮层，只展示命中消息，不展示文件路径、用户列表、配置说明等冗余区域。
- 原因：原弹窗会被工具栏裁剪，且展示内容偏离“只看命中消息”的需求。
- 效果：弹窗不再被主界面裁剪，信息聚焦命中消息。

### 07 特别关注命中弹窗视觉优化
- 内容：统一标题栏、数量标签、内容卡片、空状态和暗夜主题样式。
- 原因：原弹窗标题栏和内容区配色、比例不协调。
- 效果：弹窗视觉更统一、清爽，主题适配更稳定。

### 08 登录状态误显示“关注”修复
- 内容：服务端登录昵称提取增加导航词过滤，并禁止错误缓存昵称透传到前端。
- 原因：抖音页面中的“关注”按钮/导航文案被误识别为账号昵称。
- 效果：状态栏不再显示“已登录：关注”，账号名无法可靠识别时显示“当前抖音账号”。

### 09 大数据量场景二次性能优化
- 内容：特别关注规则预编译复用，列表行的关键词、神秘人、特别关注状态改为一次性预计算。
- 原因：高消息量时每次渲染都会重复扫描特别关注规则、动态创建通配符正则并逐行计算状态。
- 效果：减少列表渲染期重复计算，降低大数据量采集时 UI 卡顿和响应延迟。

### 10 实时消息批量推送与 UI 降频
- 内容：服务端 SSE 从逐条事件推送改为批量事件推送；前端支持批量接收，并按更低频率批量消费展示队列。
- 原因：高消息量直播间逐条推送和逐条触发 UI 队列消费，会造成 React 高频渲染和主线程占用。
- 效果：后台采集仍完整入库，前端展示按批刷新，降低大数据量场景下 CPU 占用和界面卡顿。

### 11 主消息列表虚拟滚动
- 内容：进场、互动、评论、送礼列表改为只渲染可见区域和少量缓冲行，保留自动跟随、暂停跟随和显示最新消息逻辑。
- 原因：高消息量时 DOM 节点和行渲染是主要卡顿来源。
- 效果：减少列表 DOM 渲染压力，降低滚动和实时刷新卡顿；采用固定行高估算以降低滚动错位风险。

### 12 虚拟列表自动跟随修复与低延迟刷新
- 内容：虚拟列表滚动到底部改为按估算总高度定位，并在数据刷新后增加下一帧兜底滚动；服务端批量推送延迟从 120ms 降到 50ms，前端消费节奏同步加快。
- 原因：虚拟列表只渲染可见 DOM，直接使用 scrollHeight 容易定位不到最新；过度降频会造成消息展示延迟。
- 效果：评论和送礼新消息更稳定显示在底部，同时降低消息展示延迟。

### 13 神秘人列表数据和窗口单例修复
- 内容：修复神秘人统计 SQL 中中文关键词编码异常，改为参数化关键词；神秘人窗口增加单例引用，重复点击只聚焦已有窗口。
- 原因：SQL 中神秘人关键词乱码会导致 activeUsers 查询不到数据；重复 window.open 会造成多个神秘人窗口并存。
- 效果：神秘人列表可正常加载数据，界面只保留一个神秘人列表窗口。

### 14 评论列表首屏位置和神秘人全模块同步
- 内容：虚拟列表首批数据改为从顶部加载，后续新增消息才自动跟随到底部；神秘人统计统一覆盖评论、送礼、进场、互动，并保留 @ 提及排除逻辑。
- 原因：首批数据被当成新增消息滚到底部，导致列表上方空白；神秘人统计需要从所有业务模块统一汇总，避免评论/送礼遗漏。
- 效果：评论区开始采集后从顶部正常填充；神秘人列表可汇总全模块出现的神秘人用户。

### 15 神秘人统计参数数量修复
- 内容：修正神秘人 activeUsers SQL 参数数量，保证绑定参数与占位符一致。
- 原因：神秘人统计 SQL 有 15 个占位符，但传入了 17 个参数，开始采集刷新统计时触发 SQLite 参数错误。
- 效果：开始采集后统计接口不再报 Too many parameter values were provided。

### 16 虚拟列表自动到底部修复
- 内容：自动跟随滚动改为使用虚拟列表总高度计算底部位置，不再依赖当前可见 DOM 的 scrollHeight。
- 原因：虚拟列表只渲染可见行，scrollHeight 不能代表完整列表高度，导致评论和送礼无法自动显示最新消息。
- 效果：新消息到达时可自动定位到可见区域底部。

### 17 Chromium 启动失败兜底
- 内容：启动登录/采集浏览器前清理 profile 锁文件；持久 profile 启动失败时自动尝试 fallback profile。
- 原因：残留 Chromium 进程或 profile 锁会导致 launchPersistentContext 启动后立即关闭。
- 效果：降低开始采集时报 Target page/context/browser has been closed 的概率，并避免直接中断启动流程。

### 18 评论/送礼换行遮挡修复
- 内容：虚拟列表从固定行高改为按实际消息高度测量，评论和送礼内容支持自动换行完整展示。
- 原因：原虚拟列表为稳定滚动强制固定行高和单行省略，长消息换行后会被遮挡。
- 效果：长评论、长礼物消息和特别关注标记不再被裁剪，同时保留虚拟滚动和自动跟随逻辑。

### 19 SSE 前端高消息量卡顿优化
- 内容：降低消息队列 UI 消费频率，神秘人/统计刷新增加 2 秒节流，虚拟列表行高测量和滚动位置更新改为按帧批量处理，折叠模块低频排空，列表 hover 动画降级。
- 原因：高消息量下多分类定时刷新、频繁统计查询、逐行高度 setState、滚动事件高频 setState 和 hover 阴影/位移动画会共同造成主线程卡顿。
- 效果：保持 SSE 和数据完整性不变，减少 React 更新次数、统计刷新次数和滚动/测量期间的 UI 抖动。

### 20 直播连线纯数字倒计时屏蔽
- 内容：评论噪音过滤新增 0-180 纯数字规则，并同时覆盖采集端过滤和前端展示兜底过滤。
- 原因：直播连线时主播账号可能持续产生 60、59、58 等纯数字倒计时，主播名识别失败时原规则会漏出。
- 效果：直播间评论区不再展示 0-180 的纯数字倒计时噪音。

### 21 采集时按钮 hover 延迟优化
- 内容：采集状态下工具栏按钮、版本日志、跟随按钮和主题选择器禁用高成本 hover 动画、阴影和毛玻璃重绘，改为轻量背景/边框反馈。
- 原因：采集高峰期主线程繁忙，hover 的 transform、box-shadow、backdrop-filter 会加重重绘，导致导出 Excel、神秘人等按钮反馈延迟。
- 效果：采集时顶部按钮 hover 响应更轻，减少交互卡顿。

### 22 全局高成本视觉效果移除
- 内容：全局禁用 box-shadow、text-shadow、backdrop-filter、filter、transform、transition 和 animation。
- 原因：采集高峰期阴影、毛玻璃、位移和过渡动画会增加重绘与合成压力，导致 hover 和操作反馈延迟。
- 效果：所有模块交互改为无动画、无阴影、无毛玻璃的轻量渲染，降低 UI 卡顿风险。

### 23 Hover 对比度修复
- 内容：统一按钮、模块、列表、特别关注和神秘人区域的 hover 文本与背景颜色，补充暗夜主题对比规则。
- 原因：移除阴影和动画后，部分主题的 hover 背景与文字颜色重合，导致内容看不清。
- 效果：hover 状态下文字保持清晰可读，同时继续保留无动画、无阴影的低成本渲染。

### 24 大数据量卡顿根因优化
- 内容：降低直播页采集脚本的全页兜底扫描频率，缓存评论根节点，取消 body 全树属性监听；前端 SSE 队列改为单一 UI flush，避免多分类分别 setEvents。
- 原因：大数据量时直播页 DOM 变大，高频 querySelectorAll、MutationObserver 全树属性监听、多分类 React 更新会持续抢占主线程。
- 效果：减少采集端 DOM 扫描、观察器回调和前端渲染次数，缓解大数据量直播间卡顿。

### 25 增量化与采集降载优化
- 内容：前端消息追加改为增量处理，不再每批旧数据加新数据全量 normalize；特别关注命中改为新增消息即时匹配并缓存；虚拟行高测量增加 2px 容差；采集端 MutationObserver 取消 characterData 监听。
- 原因：大数据量场景下重复全量排序/去重、全量特别关注扫描、细微行高抖动更新和文本变化监听会持续抢占主线程。
- 效果：UI 只处理新增消息和缓存快照，减少重复计算、重复渲染和采集端 DOM 回调压力。

### 26 降低消息获取和展示速度
- 内容：降低服务端首次评论扫描数量，前端评论/互动单批消费数量减半，并保持更低频的队列刷新节奏。
- 原因：高消息量直播间继续追求最快获取会挤占 UI 主线程，导致 hover、滚动和按钮响应变慢。
- 效果：降低采集和渲染压力，牺牲部分实时性，优先保证大数据量场景下界面可操作性。

### 27 消息获取速度优先调整
- 内容：提高服务端批量推送频率、兜底扫描频率和前端 SSE 队列消费批量，缩短可见消息刷新延迟。
- 原因：上一版降速后消息展示偏慢，不符合实时观察诉求。
- 效果：评论、送礼、进场和互动展示速度更快；代价是高峰期 CPU/UI 压力会比降速版更高。

### 28 采集时窗口拖动卡顿修复
- 内容：Electron 主进程监听窗口移动/缩放状态并通知前端，前端在移动/缩放期间暂停消息队列 UI flush，结束后立即补刷；窗口尺寸保存改为更长防抖。
- 原因：开始采集后高频消息渲染会占用 Electron 渲染线程，窗口拖动和 UI 更新互相抢占，导致窗口严重拖不动。
- 效果：采集不中断、消息不丢，拖动窗口时优先保证窗口响应，拖动结束后恢复最新消息展示。

### 29 窗口拖动期间 SSE 解析降载
- 内容：窗口移动/缩放期间不再解析 SSE 消息、不做神秘人/特别关注匹配、不入展示队列，仅缓存原始消息；移动结束后统一补处理。
- 原因：上一版只暂停 UI flush，但拖动期间仍持续 JSON 解析和逐条匹配，主线程仍会被高频消息占用。
- 效果：进一步释放拖动窗口时的 Electron 渲染线程，提升采集中的窗口拖动流畅度。

### 30 对齐主分支神秘人列表逻辑
- 内容：按 `docs/main-mystery-users-reference.md` 对齐神秘人列表 SQL、统计刷新和无会话空统计逻辑；`dou` 仅统计非评论事件，保留 `@神秘人/@神秘王者` 评论误判排除。
- 原因：当前分支神秘人统计和主分支参考逻辑存在偏差，普通 `dou` 评论可能污染神秘人列表，无活跃会话时也可能显示历史统计。
- 效果：神秘人列表数据源统一为当前会话 `stats.activeUsers`，按最近活跃倒序展示，评论提及不再误入列表。

### 31 修复神秘人列表全量用户误入
- 内容：神秘人 `dou` 规则不再匹配 `https://www.douyin.com/...` 域名本身，只匹配用户身份值；前端高亮和后端统计同步使用去域名后的身份字段。
- 原因：当前分支 `userLink` 保存为完整抖音主页 URL，域名 `douyin.com` 含有 `dou`，导致所有带主页链接的非评论用户都被误判为神秘人。
- 效果：神秘人列表只展示真实命中 `神秘人`、`神秘王者` 或身份值含 `dou` 的用户，不再展示所有用户动态。

### 32 长时间运行内存增长保护
- 内容：前端待展示队列增加硬上限，虚拟列表行高缓存仅保留当前列表项，用户主页解析缓存增加 LRU 上限；采集端去重 Map、礼物组合 Map 和页面内去重缓存增加硬上限；神秘人活跃列表限制返回 200 条。
- 原因：软件长时间采集时，待渲染队列、行高缓存、去重缓存和统计结果会持续增长，内存越高窗口越卡，极端情况下可能崩溃。
- 效果：长期运行时旧缓存会自动释放，降低内存持续上涨和窗口卡死风险；采集数据仍继续入库，前端只丢弃来不及展示的旧待渲染项。

### 33 神秘人弹窗去除热门礼物
- 内容：神秘人独立窗口移除“热门礼物”模块，活跃用户列表改为单列完整展示。
- 原因：热门礼物不是神秘人核心信息，会占用弹窗空间并增加少量渲染与统计展示成本。
- 效果：神秘人窗口更清爽，只聚焦神秘人活跃用户数据。

### 34 长时间采集性能治理
- 内容：采集页每 45 分钟自动重建释放直播页内存；视频资源继续拦截并强制 video/audio 静音、暂停、缩小显示；当前会话 `/api/stats` 改为写入事件时维护内存统计快照，避免每次统计全表扫描。
- 原因：软件长时间运行后，Chrome 直播页、视频解码和全量统计查询会持续累积压力，导致窗口越来越卡甚至崩溃。
- 效果：降低 Chrome 长期内存上涨、视频解码占用和统计接口耗时；采集会话继续保持，数据仍正常入库。

### 35 可点击用户名 Hover 对比度修复
- 内容：可点击用户名 hover/focus 改为固定浅黄底深色文字，不再使用主题强色背景；暗夜主题同步使用高对比浅底。
- 原因：部分主题下用户名 hover 背景与文字颜色撞色，导致昵称难以辨认。
- 效果：评论区、送礼区、神秘人列表中的可点击用户名 hover 时保持清晰可读。

### 36 禁用 Electron 窗口 Ctrl+A
- 内容：主窗口和神秘人子窗口拦截 `Ctrl+A / Command+A` 快捷键。
- 原因：误触全选会导致窗口内容被选中，影响观察和操作体验。
- 效果：Electron 窗口内不再触发全局全选。

### 37 神秘人列表严格过滤
- 内容：神秘人列表、内存统计快照和前端实时刷新触发全部改为只识别 `神秘人`、`神秘王者`，不再用 `dou` 作为神秘人列表命中条件。
- 原因：神秘人列表的目标是只展示神秘人相关用户，`dou` 扩展规则容易把普通用户带入列表。
- 效果：神秘人列表不再展示全量用户动态，只展示明确带神秘人身份的用户。

### 38 评论和礼物展示加速
- 内容：提高评论/礼物前端单批消费量，缩短可见消息刷新延迟；采集端评论兜底扫描从 900ms 调整为 600ms，并增加每次扫描行数。
- 原因：评论区和礼物区新消息展示体感偏慢。
- 效果：评论和送礼消息展示更接近实时；高峰期 UI 压力会略有增加。

### 39 神秘人消息命中补齐
- 内容：神秘人统计补充识别评论/送礼消息正文和原始 payload 中的 `神秘人`、`神秘王者`，同时保留普通用户 `@神秘人` 评论排除。
- 原因：部分神秘人只出现在礼物区或评论区消息文本中，身份字段未带神秘人标识，导致列表漏显示。
- 效果：评论区、礼物区出现的神秘人可同步进入神秘人列表，普通提及不误入。

### 40 神秘人统计排除规则修复
- 内容：神秘人列表统计改为优先识别 userName/userId/userLink 和 payload 内身份字段；普通评论 @ 神秘人仅在发送者身份不含神秘人时排除；历史统计 SQL 同步按 payload 身份字段判断，不再把整段 payload 当身份字段。
- 原因：上一版把 message/payload 命中和 @ 提及排除混在一起，导致真实神秘人只出现在消息或 payload 时被误排除，神秘人列表为空或漏显示。
- 效果：评论区、礼物区真实出现的神秘人能进入神秘人列表，同时普通用户 @ 神秘人不会变成独立神秘人条目。

### 41 登录说明排版对齐优化
- 内容：登录说明区域改为左对齐、垂直居中、统一行高和文字换行规则。
- 原因：原说明文本在卡片内排版松散，换行和对齐不够规整。
- 效果：登录说明更整齐，长文本换行更稳定，顶部信息区观感更规范。

### 42 URL 输入框 Ctrl+A 放开
- 内容：Ctrl+A 禁用逻辑从 Electron 主进程改为前端同步判断，输入框、文本框和可编辑区域允许全选，其它区域继续禁止全局全选。
- 原因：之前主进程全局拦截 Ctrl+A，导致直播间 URL 输入框内无法快速全选替换。
- 效果：URL 输入区域可正常使用 Ctrl+A，界面其它区域仍避免误触全选。

### 43 神秘人弹窗白屏修复
- 内容：神秘人弹窗改为独立轻量入口，只加载运行状态和神秘人统计，不再执行主界面事件列表、特别关注、队列和大量 UI hooks；加载失败时显示错误提示。
- 原因：原弹窗复用完整主 App，长时间采集后打开会触发主界面初始化链路，容易出现白屏、卡顿或无响应。
- 效果：神秘人列表打开更轻，空数据也显示“暂无可展示用户”，接口异常显示错误原因，不再空白页。

### 44 正式包启动资源修复
- 内容：正式包打包配置改为包含完整 assets 目录，启动 loading 页面增加缺失兜底。
- 原因：上一版正式包只包含 app.ico，缺少 loading.html，打开后触发 ERR_FILE_NOT_FOUND。
- 效果：正式包可正常启动，后续即使 loading 页缺失也不会直接报错退出。

### 45 P0 本地 API 安全封口与 Electron high 清零
- 内容：本地 API 改为运行期 HttpOnly Cookie 鉴权，所有 `/api/*` 包括读取、导出和 SSE 都必须鉴权；非法 Origin、`Origin: null`、远程网页来源直接 403；Electron 升级到 `40.10.2`，`better-sqlite3` 升级到 `12.10.0`。
- 原因：P0 风险报告指出本地 API 缺少显式会话密钥、`Origin: null` 数据面边界不足、依赖审计存在 high。
- 效果：`npm run audit:security` high=0；`npm run test:regression` 通过；生成 `V26.5.29.18` 安装包。10 万事件压测可完成但内存较高，当前正式事件保留上限仍为 5 万。

### 46 P0 安装包二次复核
- 内容：在不运行安装器、不覆盖用户现有安装的前提下，重新执行 `npm run test:regression`、`npm run audit:security`，并校验 `V26.5.29.18` 安装包 SHA256、PE/NSIS 标记和 release 目录残留。
- 原因：用户要求继续检查核心功能风险，确保当前产物仍和文档结论一致。
- 效果：自动化回归仍通过，安全审计 high=0；安装包 SHA256 仍为 `AE8ECA5938E3FE2B82CBEF59A05A98C981F6A1D07440B98F0A1D2016FE5FAEEA`；安装包未做 Authenticode 签名，安装向导/安装后启动和真实直播间 smoke 仍列为人工验收项。

### 47 V26.5.29.19 安装后 native ABI 修复
- 内容：修复 `V26.5.29.18` 覆盖安装后启动报 `better_sqlite3.node` NODE_MODULE_VERSION 127/143 不匹配的问题；安装器在写入新文件前清理旧 `better-sqlite3` native 目录；打包流程新增最终 `win-unpacked` native ABI 门禁。
- 原因：原验证只覆盖工作区 native 模块，没有验证最终 `app.asar.unpacked` 中的模块；覆盖安装也可能残留旧 ABI 文件。
- 效果：版本升为 `V26.5.29.19`；`npm run test:regression` 通过，`npm run audit:security` high=0，`npm run desktop:pack:fast` 通过并输出 `electron=40.10.2`、`modules=143`；安装包 SHA256 为 `EC65CFEFF5441BE6E88A285204FE1EF88A747E424F9C966671E40EEAAC0EB30A`。

### 48 V26.5.29.20 native ABI 直加载修复
- 内容：修复 `V26.5.29.19` 仍启动报 `better_sqlite3.node` NODE_MODULE_VERSION 127/143 的问题；native ABI 门禁改为直接加载最终 `better_sqlite3.node` 并创建内存数据库；打包后恢复 Node ABI 127。
- 原因：`V26.5.29.19` 的验证只 require 包入口，没有触发 native addon 加载，属于假通过；Electron ABI 与 Node ABI 共用同一 workspace native 文件也会互相影响。
- 效果：版本升为 `V26.5.29.20`；`npm run test:regression` 通过，`npm run audit:security` high=0，`npm run desktop:pack:fast` 通过并输出 `nativeAddonType=object`、`modules=143`；安装包 SHA256 为 `5C32511A5B0AAE4D72BEC3A66CAAFF073DF4E79C7C441948B3F30A1C91E4B907`。

### 49 版本号日期规则更正
- 内容：用户明确更正版本号规则：版本号按打包日期约定，格式为 `VYY.M.D.N`，其中 `N` 是当天第几个包。
- 原因：此前把 `V26.5.29.x` 误当成固定发布线递增，实际 `V26.5.29.13` 表示 2026-05-29 的第 13 个版本。
- 效果：后续若在 2026-06-09 打包，当天首包应为 `V26.6.9.1`；同日再次重打包则递增最后一段。

### 50 V26.6.9.1 全量历史统计与风险收敛
- 内容：新增会话级累计汇总，统计尽量代表全量直播历史；Excel 增加全量统计汇总和当前保留明细说明；补配置校验、日期版本门禁、中文可读性检查和 collector payload schema。
- 原因：用户要求未修复问题全部收敛，并确认统计/导出应尽量代表全量直播历史。
- 效果：裁剪原始事件后统计不再只代表保留窗口；100k 压测通过，保留明细约 48000 行，`totalMs=8746`、`rssDeltaMb=349.8`；2026-06-09 首个打包版本按规则使用 `V26.6.9.1`。

### 51 V26.6.9.2 特别关注旧版展示恢复
- 内容：特别关注命中恢复旧版展示口径：标记区继续显示 `特别关注 备注名`，礼物和评论正文用户名区只显示原昵称，不再显示 `备注名 / 原昵称`。
- 原因：用户确认该展示属于 P0 边界，只允许修正展示口径，不能改采集、匹配、入库、统计和导出逻辑。
- 效果：新增/更新礼物特别关注展示回归；每会话原始明细继续固定 5 万，Excel 导出架构、代码签名、CI/覆盖率和外部 API 支持本轮不做。

### 52 V26.6.9.2 安装版真实直播间 smoke
- 内容：覆盖安装 `V26.6.9.2` 到 `D:\糖三角\@douyin-live-suitedesktop`，启动安装版并验证日志、端口、登录状态、真实直播间采集、停止自动保存和导出接口。
- 原因：用户提供真实直播间 `https://live.douyin.com/962565925628` 并允许安装运行当前包，需要补齐安装后真实链路验收。
- 效果：启动日志包含 `releaseTag=V26.6.9.2`、`serverUrl=http://127.0.0.1:3100`，主界面无白屏；会话 `8O4oe_OrQC` 采集到评论 42、进场 18、互动 12、礼物 161、唯一用户 220；停止后桌面自动保存 Excel，ExcelJS 可读取分类 sheet 和全量统计 sheet。特别关注真实命中因无真实 ID 未覆盖，继续由隔离 mock 回归保障。

### 53 V26.6.9.3 评论重复与礼物顺序修复
- 内容：修复带 `sourceId` 的同源评论重复扫描后生成不同 `uniqueKey` 的问题；采集 payload 增加 `ingestSeq`，前端礼物排序和身份补齐合并保留原始顺序字段。
- 原因：用户反馈评论区出现重复、礼物区消息顺序乱，且礼物顺序属于新 bug。
- 效果：新增/更新 `regression-comment-unique-key.mjs`、`regression-gift-display-order.mjs`；`npm run test:regression` 通过 server 18、web 9、desktop 6；生成 `糖三角-V26.6.9.3-安装包.exe`，SHA256 `46209A29BAB8127250F719CBD256B10C302980047EB672106447638B2970D8CD`。

### 54 V26.6.9.3 安装版真实直播间 smoke
- 内容：安装并启动 `V26.6.9.3`，使用用户提供直播间 `https://live.douyin.com/127874409138` 做短时采集、停止和导出验证。
- 原因：修复完成后需要用真实直播间验证核心链路，不能只依赖 mock。
- 效果：会话 `ehGrIJDv6x` 识别房间 `婷哥kiki🎙️ ⁸⁰²³的抖音直播间`，短时采集评论 13、进场 111、互动 6、礼物 5、日志 2；评论 `DUP_UNIQUE_KEY=0`，`sourceId/userId/message` 重复组为 0；礼物 `id/createdAt/ingestSeq` 顺序一致；导出接口生成 25,770 bytes Excel。

### 55 2026-06-10 采集完整性 P0 修复
- 内容：修复礼物名紧凑前缀被误吞的问题，`用户A 送你花花 x1` 现在保留礼物名 `送你花花`；同时保留 `用户A 送 玫瑰 x1` 这种独立动作词解析为 `玫瑰`。
- 内容：修复评论富文本候选重叠风险，`@XX欢迎 @XX欢迎 后续正文` 这类父子节点重复拼接会折叠为完整正文，避免短尾或重复前缀影响展示。
- 内容：特别关注匹配候选补充 `payload.userLink`，评论区/礼物区只有 payload 链接身份时也能按稳定 ID/link 命中。
- 原因：用户反馈糖三角采集到的礼物名缺少开头 `送`、富文本评论不完整、特别关注用户出现在评论区/礼物区时可能漏命中。
- 效果：新增/更新 `regression-gift-name-prefix.mjs`、`regression-comment-rich-mention-body.mjs`、`regression-highlight-payload-identity.mjs`；`npm run test:regression` 通过 server 20、web 10、desktop 6。本次未改采集入口、入库结构、统计口径、导出逻辑和特别关注展示口径。

### 56 V26.6.10.1 采集完整性修复打包
- 内容：按用户日期版本规则升级为 `V26.6.10.1` / `26.6.10-1`，并重新打包安装包。
- 内容：服务端回归 runner 改为使用项目内 `tmp/server-regression-storage` 隔离数据库，避免测试打开项目父级默认 storage 失败或污染真实数据；该改动只影响测试脚本，不影响业务运行路径。
- 原因：6 月 10 日修复完成后需要形成可验收安装包；完整回归在当前沙箱路径下发现 SQLite 默认测试路径不稳定，需要先修正测试隔离。
- 效果：`npm run test:regression` 通过 server 20、web 10、desktop 6；`npm run audit:security` high=0，仅保留 `exceljs -> uuid` 2 个 moderate；`npm run desktop:pack:fast` 通过并执行 packaged native ABI 门禁。
- 产物：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.1-安装包.exe`，大小 `85,327,097` bytes，SHA256 `77CBA10028BFAD590ABEF3EA93769BC65983EF3BE60BAA622F1B17C98515EE84`。
- 验收边界：自动化和打包已完成；用户反馈截图对应的真实直播间 DOM 仍需要现场复验。如果再次出现富文本评论不完整，需要保留会话 ID、时间点、截图、直播间真实可见文本和“复制诊断”内容继续定位。

### 57 V26.6.10.2 富文本评论根因补强
- 内容：补强富文本评论正文选择逻辑：当完整评论挂在整行或容器 `aria-label/title` 上、子节点只显示短前缀 `@XX欢迎` 时，优先保留完整正文。
- 原因：进一步复核发现 `V26.6.10.1` 已覆盖子节点完整正文，但如果真实 DOM 把完整评论放在外层行属性中，仍可能只采到内部短文本。
- 修复：评论候选扫描纳入当前节点；候选清洗支持去掉用户名前缀；带 @ 或标点的真实评论候选不再仅因包含“直播间”等通用词被误判为噪音；完整候选包含当前短正文时提高评分。
- 效果：`regression-comment-rich-mention-body.mjs` 新增整行 `aria-label` 完整正文用例；`npm run test:regression` 通过 server 20、web 10、desktop 6；`npm run audit:security` high=0；`npm run desktop:pack:fast` 通过。
- 产物：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.2-安装包.exe`，大小 `85,325,946` bytes，SHA256 `50AE8AF70AF1CDED74AA530DD5E67C1F7BEC8B7D2FBD9E389F353FD4B585660A`。

### 58 2026-06-11 P0 评论与礼物备注强闭环
- 内容：新增采集完整性账本和 `/api/diagnostics/capture-integrity`，记录评论/礼物从 raw 接收、过滤、去重、DB 入库、唯一冲突到 SSE 发布的关键计数。
- 内容：复制诊断新增持久化礼物、近期礼物、采集完整性账本和特别关注命中详情；命中详情记录 `matchedBy/matchedValue`，便于定位礼物备注是否按稳定身份命中。
- 内容：礼物身份后到仍只补齐身份字段和 payload，不覆盖原始排序字段；补齐后重新发布同一礼物行，让前端重新计算特别关注备注。
- 原因：用户将“评论区丢评论”和“礼物区丢备注”列为频繁出现且未彻底修复的 P0，要求数据库、统计、导出、诊断链路不丢，UI 仍只显示近期窗口。
- 效果：新增 `regression-capture-integrity-ledger.mjs`、`regression-capture-integrity-runtime.mjs`、`regression-copy-diagnostics-gift-remarks.mjs`；`npm run test:regression` 通过 server 22、web 11、desktop 6；`npm run audit:security` high=0，保留 `exceljs -> uuid` moderate。
- 边界：未改版本号、未重新打包；未改采集入口、统计/导出口径、SQLite 表结构、每会话原始明细 50000 条上限、特别关注展示口径和昵称不兜底规则。

### 59 V26.6.11.1 手工测试包
- 内容：按用户日期版本规则升级为 `V26.6.11.1` / `26.6.11-1`，用于用户手工测试本轮 P0 评论与礼物备注闭环。
- 验证：`node apps/desktop/scripts/regression-release-version.cjs` 通过；`npm run test:regression` 通过 server 22、web 11、desktop 6；`npm run audit:security` high=0，保留 `exceljs -> uuid` moderate。
- 打包：`npm run desktop:pack:fast` 通过；打包过程自动将 `better-sqlite3` 从 Node ABI 127 重编为 Electron ABI 143，packaged native ABI 门禁通过。
- 产物：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.1-安装包.exe`，大小 `85,327,837` bytes，SHA256 `32B409FAC6C0E06E975C51F16B0FF9FB36A0A82BC28A7A55CD784DF49937E47C`。
- 边界：该包供手工验收；是否发布仍由用户拍板。

### 60 2026-06-11 P0 评论/礼物备注强 mock 门禁补强
- 内容：新增 `regression-capture-integrity-strong-mock.mjs`，用隔离 mock 会话验证同源评论重扫、真实连续同文评论、不同用户同文评论、礼物身份后到、payload-only 身份、DB/export/ledger/SSE/highlight 诊断闭环。
- 内容：新增 `regression-gift-identity-update-remark-mock.mjs`，验证前端收到同一 `uniqueKey` 礼物身份更新时替换原行、不重复展示、保留原始 `createdAt/ingestSeq`，并重新命中特别关注备注。
- 原因：用户要求用 mock 数据完善测试，目标是把“评论区重复/丢评论”和“礼物区丢备注”变成稳定可重复的自动化门禁。
- 效果：未改业务功能、未重新打包；`npm run test:server` 通过 server 23，`npm run test:web` 通过 web 12，`npm run test:regression` 通过 server 23、web 12、desktop 6；`npm run audit:security` high=0，保留 `exceljs -> uuid` moderate。

### 61 V26.6.11.2 真实直播间消息丢失修复
- 内容：采集页批次发送失败时把未发送 batch 重新放回 pending 队列，不再直接清空；为无 `sourceId` 评论增加 `collectorClientId`，重试时保持同一 `uniqueKey`，真实连续相同评论仍可用不同 client id 区分。
- 内容：采集页 `MutationObserver` 对聊天根节点启用文本节点变化监听，并把高频兜底扫描从每 600ms 最近 14 行提升到每 250ms 最近 80 行，降低抖音复用 DOM 行时漏采中间消息的风险。
- 内容：服务端 SSE 不再在发送前裁剪 pending events；前端评论实时入队上限提升到当前每会话 50000 条保留边界，UI 仍只显示最近 200 条；Vite 开发代理跟随 `PORT`，避免 3100 被其他项目占用时误连。
- 原因：用户反馈真实直播间仍出现消息丢失，要求提供直播间后真实测试并修复到底；排查发现风险点集中在采集 batch 失败丢弃、DOM 文本复用漏采、SSE/前端入队阶段裁剪，以及本地开发代理误连其他项目。
- 验证：`npm run test:regression` 通过 server 24、web 14、desktop 6；`npm run audit:security` high=0，保留 `exceljs -> uuid` moderate；真实直播间 `https://live.douyin.com/127874409138` 运行 90 秒 smoke，房间 `婷哥kiki🎙️ ⁸⁰²³的抖音直播间`，raw 58、评论 raw 3、入库 56、入库评论 1、进场 53、互动 2；3 条 raw 评论为同一 `sourceId=7650137793749947402` 的 DOM 重扫，账本显示去重 2、入库 1、发布 1，符合“不重复、不丢真实不同消息”的边界。
- 打包：版本升为 `V26.6.11.2` / `26.6.11-2`，`npm run desktop:pack:fast` 通过；安装包 `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.2-安装包.exe`，大小 `85,327,499` bytes，SHA256 `1369BD4C4A56C7E12B001C9CEDC94C5BFD9ACF26CC8615B7158C34F39E06B2A4`。
- 边界：本轮不改变采集入口、SQLite 表结构、统计/导出口径、每会话原始明细 50000 条上限、UI 近期展示窗口和特别关注展示口径；安装后最终人工验收仍由用户拍板。

### 62 V26.6.11.3 React payload 缓存失效修复
- 内容：采集器读取直播行 React payload 时，不再对同一 DOM 行永久复用旧 `sourceId/userId/userLink`；缓存改为按当前行可见文本/属性 fingerprint 和 120ms TTL 失效。
- 原因：真实直播间虚拟列表会复用 DOM 行。若旧 React payload 被带入新消息，可能造成新评论被旧 `sourceId` 或旧身份污染，进一步触发误去重或礼物/特别关注备注匹配失败。
- 内容：新增 `regression-react-data-cache-refresh.mjs`，固定 React payload 缓存必须短 TTL 且按当前行 fingerprint 复用；新增 `regression-comment-sourceid-row-reuse.mjs`，固定同一 `sourceId` 但不同用户/正文的评论不得被去重。
- 真实 smoke：`https://live.douyin.com/127874409138` 运行 180 秒，raw comments 27、persisted comments 9、deduped 18、DB/SSE/ledger 一致；所有同 `sourceId` 重复组 `variantCount=1`，说明去重的是同一评论重复扫描，没有发现不同真实评论被同 `sourceId` 合并。
- 验证：`npm run test:regression` 通过 server 26、web 14、desktop 6；`npm run audit:security` high=0，保留 `exceljs -> uuid` moderate；`npm run desktop:pack:fast` 通过并执行 packaged native ABI 门禁。
- 打包：版本升为 `V26.6.11.3` / `26.6.11-3`；安装包 `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.3-安装包.exe`，大小 `85,328,637` bytes，SHA256 `D76B5A9D02C5F38BE3FDB6720CAC20D686AE246809FCBBFC748E33B31B5AB56B`。
- 边界：仍不改变采集入口、SQLite 表结构、统计/导出口径、每会话原始明细 50000 条上限、UI 近期展示窗口和特别关注展示口径；安装后最终人工验收仍由用户拍板。

### 63 V26.6.11.4 真实 smoke 可见行对照与停止竞态修复
- 内容：真实直播间 smoke 的外部 DOM 对照改为只读取叶子级消息行，并拒绝包含多条 `：` 分隔符的拼接容器文本，避免把整块聊天容器误判成一条未匹配评论。
- 内容：修复停止采集时 heartbeat 与页面关闭之间的竞态；`Target page/context/browser has been closed` 这类正常停止期间的 closed-target 错误不再导致进程崩溃或误报 fatal。
- 原因：60 秒真实 smoke 暴露出 stop 后 heartbeat 仍可能进入 `installObserver()` 并抛出 closed-target 异常；同时旧外部观察者会产生拼接伪评论，削弱真实 smoke 证据质量。
- 验证：`npm run test:regression` 通过 server 28、web 14、desktop 6；`npm run audit:security` high=0，保留 `exceljs -> uuid` moderate；真实直播间 `https://live.douyin.com/127874409138` 180 秒 smoke 通过，raw comments 39、persisted comments 13、deduped 26、`suspiciousRawCommentGroups=[]`、`visibleCommentObserver.unmatchedCount=0`。
- 打包：版本升为 `V26.6.11.4` / `26.6.11-4`；安装包 `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.4-安装包.exe`，大小 `85,328,389` bytes，SHA256 `9AD1EFEB9C8ACC9B616268860382A273232E791D6C71500619F5DDA9C80B89C6`。
- 边界：仍不改变业务功能、采集入口、SQLite 表结构、统计/导出口径、每会话原始明细 50000 条上限、UI 近期窗口和特别关注展示口径；安装后最终人工验收仍由用户拍板。

### 64 V26.6.11.5 UI 近期回填与页内探针修复
- 内容：修复前端历史回填倒序窗口问题。后端 `/api/events` 返回最近事件为倒序，旧逻辑在排序前先取数组尾部，超过 600 条评论时可能裁掉最新评论，导致 UI 看起来丢最近消息；现改为先按事件顺序排序，再应用近期窗口。
- 内容：真实直播间 smoke 新增页内 `MutationObserver + 250ms scan` 可见评论探针，记录短暂出现的叶子级评论，并与 raw collector、DB、SSE 账本对照。
- 原因：5 分钟真实 smoke 证明采集/DB/SSE 未复现不同真实评论丢失，但 UI 历史回填存在倒序截断风险，能解释安装版或 SSE 回填后用户看到最近评论缺失。
- 验证：新增 `regression-comment-history-desc-order.mjs`；`npm run test:regression` 通过 server 28、web 15、desktop 6；`npm run audit:security` high=0，保留 `exceljs -> uuid` moderate；增强真实 smoke 在 `https://live.douyin.com/127874409138` 跑 5 分钟，raw comments 126、persisted comments 42、deduped 84、`suspiciousRawCommentGroups=[]`、`visibleCommentObserver.unmatchedCount=0`、`pageProbe.unmatchedCount=0`。
- 打包：版本升为 `V26.6.11.5` / `26.6.11-5`；安装包 `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.5-安装包.exe`，大小 `85,329,047` bytes，SHA256 `A8746750CCE8FF323EDE15A4DD8C0801BD84091E3925AAE87C9943F04C1B3118`。
- 边界：不改变采集入口、SQLite 表结构、统计/导出口径、每会话原始明细 50000 条上限、UI 评论 200 条近期窗口和特别关注展示口径。

### 65 V26.6.11.6 可见叶子评论兜底采集修复
- 内容：采集器新增全页面叶子级可见评论兜底扫描。即使页面存在主 `chatRoot`，只要真实评论行落在外部 `comment-item/chat-item/listitem/messageItem` 叶子节点中，也会进入采集解析。
- 内容：兜底扫描拒绝包含嵌套可见消息叶子的父容器，只对叶子级候选执行 `digestElement`，避免把整块聊天容器拼成一条伪评论。
- 原因：5 分钟真实 smoke 复现可见探针持续看到评论 `中古表时间廊：@天真恋 我的发言和婷哥的分一样的，一惊一乍`，但 raw collector/DB/SSE 没有对应记录；最小回归证明主 chat root 存在时，外部可见叶子评论会被旧扫描路径漏掉。
- 验证：新增 `regression-comment-visible-leaf-fallback.mjs`，先红后绿；新增页面级 `regression-comment-history-desc-order-ui.mjs`；`npm run test:regression` 通过 server 29、web 16、desktop 6；90 秒真实 smoke 在 `https://live.douyin.com/127874409138` 通过，raw comments 42、persisted comments 14、deduped 28、`suspiciousRawCommentGroups=[]`、`visibleCommentObserver.unmatchedCount=0`、`pageProbe.unmatchedCount=0`。
- 打包：版本升为 `V26.6.11.6` / `26.6.11-6`；安装包 `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.6-安装包.exe`，大小 `85,328,840` bytes，SHA256 `A8E138B7F5E4266ECD6C4D0BCDCF66AAE0FFDD4AF5074A94A6ADB4E1FCBE96EE`。
- 边界：不改变采集入口、SQLite 表结构、统计/导出口径、每会话原始明细 50000 条上限、UI 评论 200 条近期窗口和特别关注展示口径。

### 66 2026-06-12 分裂评论与富文本提及补强
- 内容：采集器补强真实直播间分裂 DOM 评论解析。当可见叶子节点只包含 `用户名：`，正文出现在父节点或相邻兄弟节点时，会合并成完整评论再进入原有解析链路。
- 内容：修复富文本评论选择时短正文覆盖完整正文的问题。含 `@提及` 或表情标记的完整文本不再被较短的正文节点替换；重复表情如 `[比心] [比心] [比心]` 不再被误当成重复前缀压缩。
- 内容：真实直播间 smoke 增加全可见消息探针，除评论外也记录礼物、进场、互动和 unknown 可见行，便于后续用户反馈时判断“可见但未采集”的具体类型。
- 原因：真实直播间 `https://live.douyin.com/127874409138` 复现过两类采集缺口：`用户名：` 与正文被拆成兄弟节点，以及 `@提及 + 正文 + 表情` 被短正文候选截断。
- 验证：`regression-comment-sibling-body-fallback.mjs`、`regression-comment-rich-mention-body.mjs`、`regression-real-room-smoke-visible-message-probe.mjs` 均通过；`npm run test:regression` 通过 server 31、web 16、desktop 6；`npm run audit:security` high=0，仅保留 `exceljs -> uuid` moderate。
- 真实 smoke：180 秒真实直播间 smoke 通过，raw comments 21、persisted comments 7、deduped 14，`visibleCommentObserver.unmatchedCount=0`、`pageProbe.unmatchedCount=0`、`visibleMessageProbe.unmatchedCount=0`、`pageMessageProbe.unmatchedCount=0`。
- 边界：本次是源码修复并提交 GitHub，未改版本号、未重新打包；不改变采集入口、SQLite 表结构、统计/导出口径、每会话原始明细 50000 条上限、UI 近期窗口和特别关注展示口径。

### 67 2026-06-12 停止边界最后一批消息 drain 修复
- 内容：采集器停止时不再直接清空浏览器页内 `pending` 队列；停止清理前会先执行一次 `bootstrapScan()`、`scanVisibleLeafComments()` 和 `await flush()`，再断开 observer、清定时器和关闭上下文。
- 内容：真实 smoke 可见消息分类修正：先识别 `来了/进入直播间` 进场消息，再识别礼物；礼物倍数 `xN` 必须是独立 token，避免用户名如 `dy98y8xx5j` 被误判成礼物。
- 原因：5 分钟真实 smoke 发现结束边界附近出现 `来了` 可见行未匹配；代码排查确认旧 cleanup 会取消 flushTimer 并直接 `pending.length = 0`，存在停止瞬间丢最后一批事件的生产风险。
- 验证：新增 `regression-collector-stop-drains-pending.mjs`，修复前失败为 `events=[]`，修复后通过；`npm run test:server` 通过 32 scripts；`npm run test:regression` 通过 server 32、web 16、desktop 6；`npm run audit:security` high=0，仅保留 `exceljs -> uuid` moderate。
- 真实 smoke：`https://live.douyin.com/127874409138` 5 分钟复测通过，raw total 268、raw comments 90、persisted total 144、persisted comments 18、entries 126；`visibleCommentObserver.unmatchedCount=0`、`pageProbe.unmatchedCount=0`、`visibleMessageProbe.unmatchedCount=0`、`pageMessageProbe.unmatchedCount=0`、`unmatchedVisibleMessages=[]`、`suspiciousRawCommentGroups=[]`。
- 打包：版本升为 `V26.6.12.1` / `26.6.12-1`；`npm run desktop:pack:fast` 通过并执行 packaged native ABI 门禁；安装包 `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.12.1-安装包.exe`，大小 `85,329,128` bytes，SHA256 `3AE6D269F9A90BEB52585649C131C7E47A9D822A7D16D294555FDFCA3B71CEEB`。
- 边界：不改变采集入口、SQLite 表结构、统计/导出口径、每会话原始明细 50000 条上限、UI 近期窗口和特别关注展示口径；安装后最终人工验收仍由用户拍板。
