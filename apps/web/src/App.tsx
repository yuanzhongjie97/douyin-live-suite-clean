import {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { api } from './api';
import './styles.css';
import type {
  BrowserState,
  EventCategory,
  HighlightUserConfig,
  HighlightUsersSnapshot,
  LiveEvent,
  RuntimeSnapshot,
  SessionStats,
  StreamMessage,
} from './types';


type EventBuckets = Record<EventCategory, LiveEvent[]>;
type MatchMode = 'any' | 'all';
type FrontendCommentDiagnostics = {
  sseMessages: number;
  sseCommentRows: number;
  skippedClearedAt: number;
  skippedNoise: number;
  queueOverflow: number;
  displayDuplicate: number;
  displayUniqueKeyDuplicate: number;
  displayNoise: number;
  displayCategoryMismatch: number;
  historyCommentBackfill: number;
  lastCommentUniqueKey: string;
  lastCommentCreatedAt: string;
  lastSseCommentReceivedAt: string;
  lastCommentEnqueuedAt: string;
  lastCommentDisplayFlushAt: string;
  maxCommentQueueLength: number;
  commentFlushCount: number;
  commentRowsFlushed: number;
};
type DiagnosticEventSummary = {
  uniqueKey: string;
  category: EventCategory;
  createdAt: string;
  userName?: string;
  userId?: string;
  userLink?: string;
  message?: string;
  rawText?: string;
  payloadText?: string;
  sourceId?: string;
};
type DisplaySkipReason = 'categoryMismatch' | 'noise' | 'uniqueKeyDuplicate' | 'duplicate';
type DisplaySkipDiagnostic = {
  reason: DisplaySkipReason;
  at: string;
  candidate: DiagnosticEventSummary;
  matchedExisting?: DiagnosticEventSummary;
  duplicateWindowMs?: number;
};
type ThemeId =
  | 'slate'
  | 'emerald'
  | 'amber'
  | 'night'
  | 'ocean'
  | 'rose'
  | 'graphite'
  | 'aurora'
  | 'copper'
  | 'mattePink'
  | 'authorityRed'
  | 'luxuryGold';
type CollapseState = {
  entryInteraction: boolean;
  gift: boolean;
  comment: boolean;
};
type PanelSizeState = {
  entryInteraction: number;
  gift: number;
  comment: number;
};
type PanelSplitState = {
  commentGift: number;
};

const STORAGE_KEYS = {
  filters: 'douyin-live-suite.filters',
  collapse: 'douyin-live-suite.collapse',
  panelSizes: 'douyin-live-suite.panel-sizes',
  panelSplits: 'douyin-live-suite.panel-splits',
  theme: 'douyin-live-suite.theme',
  messageFontSize: 'douyin-live-suite.message-font-size',
} as const;

const DEFAULT_URL = 'https://live.douyin.com/127874409138';
const COMMENT_DUPLICATE_WINDOW_MS = 1500;
const NON_COMMENT_DUPLICATE_WINDOW_MS = 300000;

const THEME_OPTIONS: Array<{ id: ThemeId; label: string }> = [
  { id: 'slate', label: '蓝灰' },
  { id: 'emerald', label: '翠绿' },
  { id: 'amber', label: '暖橙' },
  { id: 'ocean', label: '深海' },
  { id: 'rose', label: '玫瑰' },
  { id: 'graphite', label: '石墨' },
  { id: 'aurora', label: '极光' },
  { id: 'copper', label: '铜金' },
  { id: 'night', label: '暗夜' },
  { id: 'mattePink', label: '黑粉甜酷' },
  { id: 'authorityRed', label: '红黑权威' },
  { id: 'luxuryGold', label: '黑金奢华' },
];

type MessageFontSize = 'small' | 'normal' | 'large' | 'xlarge';

const FONT_SIZE_OPTIONS: Array<{ id: MessageFontSize; label: string }> = [
  { id: 'small', label: '小' },
  { id: 'normal', label: '标准' },
  { id: 'large', label: '大' },
  { id: 'xlarge', label: '超大' },
];

const VERSION_LOGS = [
  {
    version: 'V26.6.11.6',
    date: '2026-06-11',
    items: [
      '修复真实直播间可见叶子评论不在主聊天根节点下时可能漏采的问题，采集器新增叶子级可见评论兜底扫描。',
      '新增真实复现回归：主 chat root 存在但评论行落在外部可见叶子节点时，必须采集入 raw/DB/SSE 链路。',
      '真实直播间 127874409138 已执行 90 秒 smoke：raw 评论 42、入库评论 14、可见探针 unmatchedCount 为 0。',
    ],
  },
  {
    version: 'V26.6.11.5',
    date: '2026-06-11',
    items: [
      '修复历史回填时后端倒序事件被前端先截尾再排序的问题，避免超过 600 条评论后最新评论被裁掉。',
      '增强真实直播间 smoke：新增页内 MutationObserver 可见评论探针，持续记录短暂出现的叶子级评论并与 raw/DB/SSE 对照。',
      '真实直播间 127874409138 已执行 5 分钟增强 smoke：raw 评论 126、入库评论 42、页内探针 unmatchedCount 为 0。',
    ],
  },
  {
    version: 'V26.6.11.4',
    date: '2026-06-11',
    items: [
      '增强真实直播间 smoke 外部可见行对照：只采集叶子级消息行，并过滤多条评论拼接文本，避免误判容器文本。',
      '修复停止采集时 heartbeat 与页面关闭竞态导致的 Target closed 崩溃，正常停止不再触发 fatal 或中断测试。',
      '真实直播间 127874409138 已执行 180 秒 smoke：外部可见评论 unmatchedCount 为 0，DB/SSE/ledger 一致。',
    ],
  },
  {
    version: 'V26.6.11.3',
    date: '2026-06-11',
    items: [
      '修复真实直播间 DOM 行复用时 React payload 缓存可能带入旧 sourceId、userId、userLink 的风险，避免新评论被旧身份污染后误去重或丢备注。',
      '新增同 sourceId 不同用户/正文不得被去重的回归，以及 React payload 缓存必须按当前行内容和短 TTL 失效的门禁。',
      '真实直播间 127874409138 已执行 180 秒 smoke：raw/DB/SSE 账本一致，同 sourceId 重复组均为同一评论重复扫描。',
    ],
  },
  {
    version: 'V26.6.11.2',
    date: '2026-06-11',
    items: [
      '修复真实直播间消息链路丢失风险：采集批次发送失败会重试，不再直接丢弃 pending 消息。',
      '采集页监听聊天文本节点变化并提高高频兜底扫描密度，降低抖音复用 DOM 行时漏采中间消息的概率。',
      '服务端 SSE 不再发送前裁剪事件，前端评论入队保留到当前 5 万事件边界；开发预览代理跟随当前后端端口，避免误连其他本地项目。',
    ],
  },
  {
    version: 'V26.6.11.1',
    date: '2026-06-11',
    items: [
      '新增评论/礼物采集完整性账本，可追踪 raw、过滤、去重、入库、唯一冲突和 SSE 发布计数。',
      '增强复制诊断：加入持久化礼物、近期礼物、采集完整性账本和特别关注命中字段 matchedBy/matchedValue。',
      '礼物身份后到时继续只补齐身份和 payload，并重新发布同一礼物行以触发特别关注备注重算。',
    ],
  },
  {
    version: 'V26.6.10.2',
    date: '2026-06-10',
    items: [
      '修复礼物名采集不全：紧凑礼物名“送你花花”会保留开头“送”，独立动作“送 玫瑰”仍按动作词处理。',
      '补强富文本评论采集：@ 提及、短尾节点和完整正文节点重叠时，保留完整正文并折叠重复前缀。',
      '补齐特别关注 payload 身份匹配：评论区和礼物区可使用 payload 中的稳定用户主页链接命中，仍不使用昵称兜底。',
    ],
  },
  {
    version: 'V26.6.9.3',
    date: '2026-06-09',
    items: [
      '修复同一来源评论被直播间 DOM 重扫后重复显示的问题：有源消息 ID 的评论现在保持稳定唯一键，不受采集时间和序号变化影响。',
      '修复礼物区身份补齐消息后到时可能打乱显示顺序的问题：前端按数据库 ID 或采集顺序稳定排序，并在替换身份时保留原始排序字段。',
      '本次不改变特别关注展示口径、采集规则、匹配规则、入库结构、统计口径和 Excel 导出逻辑。',
    ],
  },
  {
    version: 'V26.6.9.2',
    date: '2026-06-09',
    items: [
      '恢复特别关注旧版展示口径：命中标记继续显示备注名，礼物和评论正文用户标签只显示原昵称。',
      '本次只改前端展示，不改变采集、特别关注匹配、入库、统计和 Excel 导出逻辑。',
      '继续保持每会话原始明细保留上限 5 万；暂不改导出架构、代码签名、CI/覆盖率和外部 API 支持。',
    ],
  },
  {
    version: 'V26.6.9.1',
    date: '2026-06-09',
    items: [
      '统计口径改为尽量代表全量直播历史：新增会话级累计汇总，原始明细裁剪后统计仍保留累计值。',
      'Excel 导出增加全量统计汇总和当前保留明细说明，明确区分全量统计与保留窗口明细。',
      '补充配置校验、日期版本规则门禁和导出/统计回归，降低大直播间和发布验收风险。',
    ],
  },
  {
    version: 'V26.5.29.20',
    date: '2026-06-08',
    items: [
      '修复 V26.5.29.19 仍会启动报 better_sqlite3.node NODE_MODULE_VERSION 127/143 不匹配的问题。',
      'native ABI 门禁改为直接加载最终 better_sqlite3.node 文件，并创建内存数据库验证真实可用性，避免只 require 包入口造成假通过。',
      '重编 better-sqlite3 时强制使用 electron-rebuild 源码构建 Electron 40 ABI 143 模块。',
    ],
  },
  {
    version: 'V26.5.29.19',
    date: '2026-06-08',
    items: [
      '修复覆盖安装后可能继续加载旧 better-sqlite3 native 模块导致启动报 NODE_MODULE_VERSION 不匹配的问题。',
      '打包流程新增最终安装目录 native ABI 门禁，使用打包后的 Electron 验证 app.asar.unpacked 内模块可加载。',
      '安装器会在写入新程序文件前清理旧版本 better-sqlite3 native 残留，不影响业务数据和采集数据。',
    ],
  },
  {
    version: 'V26.5.29.18',
    date: '2026-06-08',
    items: [
      '本地 API 增加运行期 HttpOnly Cookie 鉴权，所有 /api/* 读取、导出和 SSE 接口都必须由桌面首屏授权后访问。',
      '显式拒绝 Origin: null、file/data、远程网页等非本机来源，带非法 Origin 的 /api/* 读取请求也会直接返回 403。',
      '升级 Electron 以清除 high 安全审计项；10 万事件压测已完成，本版仍保持当前 5 万总事件保留边界。',
    ],
  },
  {
    version: 'V26.5.29.16',
    date: '2026-06-06',
    items: [
      '收紧本地 API 安全边界：限制本机来源、拒绝跨站状态变更请求，并限制采集入口只接受抖音直播间 HTTPS 地址。',
      '新增统一回归入口和测试 SOP，发布前可一键执行构建、服务端、前端和桌面端回归检查。',
      '非破坏性升级安全相关依赖，保留 Electron 大版本升级和 ExcelJS 依赖链为专项验证项。',
    ],
  },
  {
    version: 'V26.5.29.15',
    date: '2026-06-03',
    items: [
      '修复同用户同一句评论在同毫秒内可能生成相同 uniqueKey 的问题，评论 key 现在包含源消息和采集序号，真实重复发言不会被入库或前端误跳过。',
      '服务端实时统计和 SSE 只使用 SQLite 实际插入成功的事件，避免 INSERT OR IGNORE 后统计数高于可导出评论数。',
      '前端不再因直播间心跳反复补拉最近 1000 条评论，减少评论显示延迟和重复回填；复制诊断新增服务端评论链路和入库评论快照。',
    ],
  },
  {
    version: 'V26.5.29.14',
    date: '2026-06-03',
    items: [
      '彻底禁用评论显示层的正文/身份短窗口去重，避免未来调用旧函数时再次隐藏同用户重复真实评论。',
      '延续 V26.5.29.13 的规则：评论区仅显示最近 200 条、导出读取全量会话事件、“推荐了直播”归入用户互动。',
    ],
  },
  {
    version: 'V26.5.29.13',
    date: '2026-06-03',
    items: [
      '评论区显示只保留最近 200 条，但不再按同用户同正文短窗口隐藏真实重复评论。',
      '导出 Excel 改为读取会话全量事件；“推荐了直播”归入用户互动，升级和贡献恭喜仍保留在评论区。',
    ],
  },
  {
    version: 'V26.5.29.12',
    date: '2026-06-03',
    items: [
      '修复评论区超过 120 条后看起来丢消息的问题：评论前端显示保留窗口扩大到最近 1000 条。',
      '复制诊断新增前端显示保留上限和统计数减当前显示数，便于区分真实采集丢失与显示窗口裁剪。',
    ],
  },
  {
    version: 'V26.5.29.11',
    date: '2026-06-03',
    items: [
      '增强复制诊断：新增最近评论摘要、最近被前端隐藏的评论样本、去重命中的已有行和去重窗口配置。',
      '复制诊断新增前端队列积压长度，便于区分采集丢失、SSE 到达、前端去重隐藏和队列积压。',
    ],
  },
  {
    version: 'V26.5.29.10',
    date: '2026-06-03',
    items: [
      '修复“为主播点赞了”这类点赞动作被放进直播间评论栏的问题，冒号格式和紧凑格式都会归为用户互动。',
      '保留“点赞很累 还伤腰”等真实评论的评论分类，避免重新出现正文含点赞就被吞掉的问题。',
    ],
  },
  {
    version: 'V26.5.29.9',
    date: '2026-06-03',
    items: [
      '修复真实评论正文含“点赞”时被误归为用户互动的问题，例如“点赞很累 还伤腰”会继续显示在直播间评论栏。',
      '修复带 @ 提及和表情的评论正文被短尾文本覆盖的问题，避免“@某人 表情 对”只剩“对”。',
      '收紧采集端和服务端兜底互动分类规则，互动提示仍保留，普通评论优先不丢。',
    ],
  },
  {
    version: 'V26.5.29.8',
    date: '2026-06-03',
    items: [
      '修复评论正文错采旁侧等级/时间噪音：评论行同时包含昵称、18。等徽章文本和真实正文时，优先选择正文内容节点。',
      '修复礼物区特别关注备注名显示丢失：礼物行标签继续使用稳定身份匹配到的备注名 / 原昵称，不再被礼物文本解析出的昵称覆盖。',
    ],
  },
  {
    version: 'V26.5.29.7',
    date: '2026-06-02',
    items: [
      '修复点击登录/开始采集后前端 React #440 运行时错误，避免主界面在轮询和状态刷新中崩溃或空白。',
      '修复登录浏览器上下文已关闭或卡死后 /api/browser/state 返回 500：现在会清理失效上下文并恢复为未登录状态。',
      '登录窗口复用失败时会清理旧浏览器上下文并重新启动，减少直播间页面转圈后白屏卡死。',
      '增强其他电脑白屏诊断：记录实际启动 exe、app 路径、主入口和 JS/CSS 资源请求状态，并延迟检查 React 根节点。',
      '本地存储写入增加异常防护，避免少数受限环境下 localStorage.setItem 抛错导致界面初始化中断。',
      '修复其他电脑升级安装后仍可能只显示浅色网格空白页：桌面端启动时清理 Electron HTTP 缓存，并给主入口添加本次启动参数。',
      '修复安装升级后可能只显示浅色网格空白页：index.html 和 SPA 回退页改为禁止缓存。',
      '缺失的旧 hash JS/CSS 资源不再回退返回 index.html，避免模块脚本因 HTML MIME 类型加载失败。',
      '增加渲染器启动诊断和本地存储读取防护，便于定位安装后空白页根因。',
    ],
  },
  {
    version: 'V26.5.29.2',
    date: '2026-05-29',
    items: [
      '新增评论链路诊断计数，可复制前端收到、入队、溢出、显示去重和 DOM 行数，用于定位真实直播间评论丢失断点。',
      '实时连接中断后的评论历史补拉扩大到最多 1000 条，减少高流量断线期间补拉窗口不足。',
      '本版不改变特别关注命中规则，也不改变下播自动保存和手动停止保存路径。',
    ],
  },
  {
    version: 'V26.5.29.1',
    date: '2026-05-29',
    items: [
      '修复 V26.5.29.0 评论区丢失消息：评论去重不再仅凭 sourceId 或正文吞掉不同用户的真实评论。',
      '清屏不再重建实时 SSE 连接，避免未刷新的评论队列被清理。',
      '实时连接中断后会补拉历史事件，后端已入库但前端漏收的评论可回填显示。',
    ],
  },
  {
    version: 'V26.5.29.0',
    date: '2026-05-29',
    items: [
      '主播下播自动停止时保存 Excel 到“文档\\糖三角\\自动导出”，手动停止采集时保存 Excel 到桌面。',
      '停止采集或主播下播后保留上一场会话，导出、统计、历史事件和特别关注命中历史继续指向已停止会话。',
      '开始新采集成功后立即切到新会话，并清空上一场可见消息和特别关注实时命中，避免跨场串显示。',
      '特别关注命中正文显示备注名 / 原昵称，备注名只加入已命中行的前端关键词搜索，命中规则和主页打开仍使用稳定 ID/link。',
    ],
  },
  {
    version: 'V26.5.28.1',
    date: '2026-05-28',
    items: [
      '修复 V26.5.28.0 礼物身份后到回填导致的神秘人/特别关注丢失回归。',
      '礼物身份回填改为保护已识别的神秘人身份，普通用户身份不再覆盖神秘人礼物行。',
      '神秘人刷新和同一礼物行替换同时读取 payload 身份，减少后到 payload 未刷新造成的漏显示。',
    ],
  },
  {
    version: 'V26.5.28.0',
    date: '2026-05-28',
    items: [
      '导出 Excel 改为默认走 Electron/Chromium 浏览器下载，不再通过新窗口或停止采集时静默写入桌面文件。',
      '礼物区同一礼物的高质量身份 payload 后到时，会回填已入库礼物行并重新推送，减少特别关注 tag 漏显示。',
      '前端收到同一礼物行的更完整身份时会替换旧行，保持特别关注仍只按稳定 ID/link 命中。',
    ],
  },
  {
    version: 'V26.5.27.1',
    date: '2026-05-27',
    items: [
      '收敛评论区和礼物区重复：评论继续按源消息 ID 去重，礼物去重改为身份补齐后判断，并增加礼物同源消息短窗口过滤。',
      '优化评论区和礼物区用户主页打开速度：已有直达主页链接或已解析缓存时直接打开，不再先走后端 Playwright 新开页面。',
      '安装器自定义安装选项页改为中文，并强制安装器语言使用简体中文。',
      '保持特别关注只按稳定 ID/link 命中，不使用昵称直接匹配。',
    ],
  },
  {
    version: 'V26.5.27.0',
    date: '2026-05-27',
    items: [
      '修复安装后启动时报 better_sqlite3.node NODE_MODULE_VERSION 不匹配的问题。',
      '打包流程改为安装包构建前必检并重编 better-sqlite3 Electron native 模块，避免把 Node ABI 模块打入正式包。',
      '保留 V26.5.26.2 的评论区源消息去重和礼物区特别关注稳定 ID/link 匹配修复。',
    ],
  },
  {
    version: 'V26.5.26.2',
    date: '2026-05-26',
    items: [
      '修复评论区旧消息被采集源重扫后可能重复显示的问题：评论事件增加源消息 ID 去重，不影响用户真实重复发言。',
      '增强礼物区特别关注命中：统一主页链接、query、payload 身份字段归一化，减少稳定 ID/link 口径不一致导致的漏标。',
      '礼物事件身份补齐后同步写回原始 payload，历史命中查询和前端展示使用一致身份字段。',
      '特别关注仍只按稳定 ID/link 命中，不使用昵称直接匹配。',
    ],
  },
  {
    version: 'V26.5.26.1',
    date: '2026-05-26',
    items: [
      '安装包改为传统安装向导，支持手动选择安装目录。',
      '新增默认不勾选的旧版本智能检测选项：仅按正式 appId 读取注册表，旧版本不在 C 盘时覆盖原路径，旧版本在 C 盘时优先安装到 D:\\糖三角。',
      '安装器会记住用户上次选择的安装目录，下次安装默认沿用。',
      '安装时检测到糖三角正在运行时只提示用户关闭，不再自动强制结束进程。',
    ],
  },
  {
    version: 'V26.5.26.0',
    date: '2026-05-26',
    items: [
      '新增 SQLite 用户身份缓存，评论、进场、互动等已识别身份可辅助礼物区补齐 userId / userLink。',
      '修复评论区去重过重导致同用户间隔发出相同内容被误过滤的问题。',
      '优化礼物区特别关注命中：礼物事件在入库和推送前先补齐身份，降低特别关注 tag 丢失概率。',
      '优化礼物区点击用户主页速度：补齐后的礼物事件优先使用直达主页链接。',
      '增加身份缓存写入去重，减少高流量直播间下 SQLite 重复写入压力。',
      '完成直播间 510200350291 真实采集验证：评论、进场、互动、礼物均可持续采集，评论/礼物身份字段未发现缺失。',
    ],
  },
  {
    version: 'V26.5.25.0',
    date: '2026-05-25',
    items: [
      '修复评论区同用户同一句隔一段时间重复展示的问题，避免旧评论再次出现在列表中。',
      '增强礼物区特别关注身份回填，评论区已识别的关注用户送礼时可继续按 ID 命中特别关注。',
      '保持特别关注按用户 ID / 用户主页链接匹配，不使用昵称兜底，降低同名误判风险。',
      '优化评论区、礼物区点击用户名打开主页速度：已有主页直链时前端直接打开，缺少直链时保留原解析兜底。',
    ],
  },
  {
    version: 'V26.5.15.0',
    date: '2026-05-15',
    items: [
      '修复进场、互动、礼物在页面重扫后重复展示的问题。',
      '修复礼物区特别关注重复命中和公共匿名昵称误回填身份的问题。',
      '礼物区遇到神秘人阶级名、匿名用户、贡献榜/在线观众 top 时，不再用历史昵称回填用户 ID。',
    ],
  },
  {
    version: 'V26.5.14.3',
    date: '2026-05-14',
    items: [
      '修复抖音直播间评论区 DOM 结构变化后评论不采集的问题。',
      '扩展评论行识别规则，兼容更多评论列表节点结构。',
      '修复快速扫描路径误判评论来源导致无冒号评论被过滤的问题。',
    ],
  },
  {
    version: 'V26.5.14.2',
    date: '2026-05-14',
    items: [
      '修复安装包版本启动后窗口打不开/秒退的问题。',
      '启动阶段不再依赖损坏的 Loading 页面，主窗口先显示，服务就绪后自动进入软件。',
      '补充桌面端关闭日志，后续可追踪启动异常原因。',
    ],
  },
  {
    version: 'V26.5.14.1',
    date: '2026-05-14',
    items: [
      '修复特别关注命中消息中备注名覆盖用户真实昵称的问题。',
      '恢复特别关注展示规则：标记区显示备注，消息正文显示真实昵称。',
    ],
  },
  {
    version: 'V26.5.14.0',
    date: '2026-05-14',
    items: [
      '修复评论区消息顺序错乱问题，采集事件按顺序串行写入。',
      '修复采集页批量推送重入导致的消息批次交叉风险。',
      '优化 SSE 实时推送批次，减少消息堆积和顺序抖动。',
      '修复前端同毫秒消息被 uniqueKey 排序打乱的问题。',
      '增加会话校验，避免旧会话延迟事件串入新会话。',
    ],
  },
  {
    version: 'V26.5.13.1',
    date: '2026-05-13',
    items: [
      '修复特别关注命中列表中神秘人礼物仍显示神秘人昵称的问题，弹窗内优先显示备注名。',
      '优化评论采集到展示的延迟，缩短采集端批量推送和前端刷新等待时间。',
    ],
  },
  {
    version: 'V26.5.13.0',
    date: '2026-05-13',
    items: [
      '修复特别关注命中礼物时备注丢失的问题，礼物命中按送礼渠道正确匹配备注。',
      '过滤特别关注命中列表中的在线观众TOP、贡献排名等噪音消息。',
      '修复评论区同一条评论被不同采集路径重复展示的问题。',
      '增强服务端评论去重指纹，兼容用户名从文本前缀解析的场景。',
      '增加前端评论展示兜底去重，降低 SSE 重连或历史合并导致的重复展示。',
      '扩大服务端近期评论去重缓存，降低万人直播间重复消息回流概率。',
    ],
  },
  {
    version: 'V26.5.11.1',
    date: '2026-05-11',
    items: [
      '修复连续送礼在特别关注中被误判重复导致漏抓的问题。',
      '优化直播聊天区无冒号评论采集，减少评论区漏抓。',
    ],
  },
  {
    version: 'V26.5.11.0',
    date: '2026-05-11',
    items: [
      '新增字号设置，可调整各模块消息文字大小，窗口尺寸保持不变。',
      '修复字号下拉选项白底撞色问题，适配深色主题。',
      '优化采集到展示链路，评论和礼物消息显示更快。',
      '优化 SSE 批量推送和前端批量渲染节奏，减少消息显示延迟。',
      '明确倒计时 / 连线噪音更早过滤，减少无效消息进入前端队列。',
      '修复神秘人列表 + 展开动态来源标签显示为问号的问题。',
      '神秘人动态来源改为显示进场、互动、评论/飘、礼。',
      '加强各模块展示去重，减少评论、送礼、进场、互动重复消息。',
      '特别关注命中消息同步使用统一去重逻辑，避免同一条消息重复展示。',
      '优化打包流程，新增快速打包与完整打包两种方式，减少重复 native rebuild 和 runtime 复制。',
    ],
  },
  {
    version: 'V26.5.9.1',
    date: '2026-05-09',
    items: [
      '修复神秘人列表 + 展开动态来源标签显示为问号的问题。',
      '神秘人动态来源改为显示进场、互动、评论/飘、礼。',
    ],
  },
  {
    version: 'V26.5.9.0',
    date: '2026-05-09',
    items: [
      '新增字号设置，可调整各模块消息文字大小，窗口尺寸保持不变。',
      '修复字号下拉选项白底撞色问题，适配深色主题。',
      '优化采集到展示链路，评论和礼物消息显示更快。',
      '优化 SSE 批量推送和前端批量渲染节奏，减少消息显示延迟。',
      '明确倒计时 / 连线噪音更早过滤，减少无效消息进入前端队列。',
    ],
  },
  {
    version: 'V26.5.8.5',
    date: '2026-05-08',
    items: [
      '特别关注命中列表改为最多 80 条，最新消息置顶。',
      '修复特别关注实时命中跨会话残留和重复评论风险。',
      '恢复神秘人列表 + 展开功能，可查看进场、互动、评论、送礼动态。',
      '神秘人每人最多保留最近 30 条动态，第 31 条自动顶掉最旧动态。',
      '特别关注和神秘人 + 动态统一按时间倒序展示。',
    ],
  },
  {
    version: 'V26.5.8.4',
    date: '2026-05-08',
    items: [
      '启动页去掉提示和进度。',
      '关闭 blockmap。',
      '修复版本日志乱码。',
    ],
  },
  {
    version: 'V26.5.8.2',
    date: '2026-05-08',
    items: [
      '增强礼物区 ID 提取。',
      '噪音数字改为 6-60。',
      'Excel 时间改为本地时间。',
      '打包只生成安装包。',
    ],
  },
  {
    version: 'V26.5.8.1',
    date: '2026-05-08',
    items: [
      '删除软件内 5 月 6 日版本日志，保留 5 月 7 日以后记录。',
      '生成完整改动总清单文档，覆盖功能、UI、性能、打包和技术栈取舍。',
      '优化关键词区域布局，移除无效空白占位。',
      '优化主窗口和模块滚动条样式，跟随当前主题色。',
      '稳定列表显示层，降低刷新闪烁并恢复轻量文字级 hover 主色反馈。',
      '修复黑粉主题拖动条 hover 无主题色反馈的问题。',
    ],
  },
  {
    version: 'V26.5.8.0',
    date: '2026-05-08',
    items: [
      '重做黑粉甜酷主题，统一深色层级，清理大面积白色背景。',
      '优化黑红、黑金主题，模块、输入框、数据行不再使用白色底。',
      '修复暗色主题下用户名 hover 高亮与文字撞色的问题。',
      '移除登录说明和未登录提示文案，压缩顶部工具区高度。',
    ],
  },
  {
    version: 'V26.5.7.10',
    date: '2026-05-07',
    items: [
      '修复长时间采集后的卡顿和内存增长问题，增加旧缓存释放保护。',
      '修复评论区 @ 神秘人导致普通用户误入神秘人列表的问题。',
      '优化神秘人列表逻辑，只展示真实神秘人相关数据。',
      'URL 输入框允许 Ctrl+A，全局仍禁用误触全选。',
      '优化可点击用户名 hover 对比度，避免主题色撞色。',
    ],
  },
  {
    version: 'V26.5.7.9',
    date: '2026-05-07',
    items: [
      '优化大数据量采集场景，减少高频消息导致的界面卡顿。',
      '优化特别关注命中弹窗，只展示命中消息并修复裁剪、截断和视觉不协调问题。',
      '优化顶部登录状态与直播链接布局，消息用户名去下划线，进场和互动改为左右分栏。',
      '修复登录状态误显示“关注”的问题。',
    ],
  },{
    version: 'V26.5.7.8',
    date: '2026-05-07',
    items: [
      '神秘人列表优先显示原始神秘人名，不再被特别关注备注名覆盖。',
    ],
  },
  {
    version: 'V26.5.7.7',
    date: '2026-05-07',
    items: [
      '特别关注改为仅按用户 ID 命中，不再通过用户名 / 通配符误命中。',
      '特别关注命中后不改写原始昵称；仅当用户是神秘人且有备注时，神秘人列表优先显示备注名。',
    ],
  },
  {
    version: 'V26.5.7.6',
    date: '2026-05-07',
    items: [
      '启动和空闲状态不再加载历史评论 / 进场 / 送礼列表，减少打开等待和旧数据回流。',
      '特别关注启动时只读取配置，不扫描历史命中记录；开始采集后再展示实时命中。',
    ],
  },
  {
    version: 'V26.5.7.5',
    date: '2026-05-07',
    items: [
      '恢复小体积单文件包，不再附带 Chromium 目录。',
      '保留去除启动 Loading 的优化，减少启动阶段窗口创建。',
    ],
  },
  {
    version: 'V26.5.7.4',
    date: '2026-05-07',
    items: [
      '去掉启动 Loading 窗口，减少启动阶段额外窗口创建。',
    ],
  },
  {
    version: 'V26.5.7.3',
    date: '2026-05-07',
    items: [
      '目录版改为轻量包，不再随包内置 Chromium。',
      '采集浏览器优先使用本机 Chrome / Edge，显著缩减发布体积。',
    ],
  },
  {
    version: 'V26.5.7.2',
    date: '2026-05-07',
    items: [
      '打包方式改为目录版，减少启动自解压等待。',
      '打包过程加入 native rebuild 缓存，未变更时跳过重建。',
    ],
  },
  {
    version: 'V26.5.7.1',
    date: '2026-05-07',
    items: [
      '优化特别关注和神秘人列表昵称展示优先级，优先显示备注或真实用户名。',
    ],
  },
  {
    version: 'V26.5.7.0',
    date: '2026-05-07',
    items: [
      '打包压缩改为 normal，优化单文件启动等待。',
      '加强评论区重复评论过滤，减少旧评论反复出现。',
    ],
  },
] as const;

const EMPTY_STATS: SessionStats = {
  comments: 0,
  entries: 0,
  interactions: 0,
  gifts: 0,
  giftUnits: 0,
  logs: 0,
  uniqueUsers: 0,
  topGifts: [],
  activeUsers: [],
};

const EMPTY_EVENTS: EventBuckets = {
  comment: [],
  entry: [],
  interaction: [],
  gift: [],
  log: [],
};

const EMPTY_FRONTEND_COMMENT_DIAGNOSTICS: FrontendCommentDiagnostics = {
  sseMessages: 0,
  sseCommentRows: 0,
  skippedClearedAt: 0,
  skippedNoise: 0,
  queueOverflow: 0,
  displayDuplicate: 0,
  displayUniqueKeyDuplicate: 0,
  displayNoise: 0,
  displayCategoryMismatch: 0,
  historyCommentBackfill: 0,
  lastCommentUniqueKey: '',
  lastCommentCreatedAt: '',
  lastSseCommentReceivedAt: '',
  lastCommentEnqueuedAt: '',
  lastCommentDisplayFlushAt: '',
  maxCommentQueueLength: 0,
  commentFlushCount: 0,
  commentRowsFlushed: 0,
};

const EMPTY_HIGHLIGHT_USERS: HighlightUsersSnapshot = {
  filePath: '',
  exists: false,
  users: [],
  matchedEvents: [],
  updatedAt: '',
};

const DEFAULT_COLLAPSE: CollapseState = {
  entryInteraction: true,
  gift: true,
  comment: true,
};

const DEFAULT_PANEL_SIZES: PanelSizeState = {
  entryInteraction: 236,
  gift: 238,
  comment: 292,
};
const DEFAULT_PANEL_SPLITS: PanelSplitState = {
  commentGift: 0.56,
};

const EVENT_LIMITS: Record<EventCategory, number> = {
  comment: 200,
  entry: 120,
  interaction: 120,
  gift: 120,
  log: 220,
};
const SESSION_EVENT_RETAIN_LIMIT = 50000;

const STREAM_BATCH_LIMITS: Record<EventCategory, number> = {
  comment: 260,
  entry: 140,
  interaction: 140,
  gift: 160,
  log: 20,
};
const STREAM_QUEUE_LIMITS: Record<EventCategory, number> = {
  comment: SESSION_EVENT_RETAIN_LIMIT,
  entry: EVENT_LIMITS.entry * 6,
  interaction: EVENT_LIMITS.interaction * 6,
  gift: EVENT_LIMITS.gift * 6,
  log: EVENT_LIMITS.log * 2,
};

const STREAM_ROW_INITIAL_DELAY_MS = 12;
const STREAM_ROW_DELAY_MS = 24;
const STREAM_ROW_CATCHUP_DELAY_MS = 10;
const VIRTUAL_ROW_HEIGHT_PX = 42;
const VIRTUAL_OVERSCAN_ROWS = 10;
const HIDDEN_CATEGORY_DRAIN_DELAY_MS = 1200;
const WINDOW_MOVE_FLUSH_DELAY_MS = 420;
const WINDOW_MOVE_DEFERRED_STREAM_LIMIT = SESSION_EVENT_RETAIN_LIMIT;
const WINDOW_MOVE_DEFERRED_MESSAGE_LIMIT = SESSION_EVENT_RETAIN_LIMIT;
const STATS_REFRESH_THROTTLE_MS = 2000;
const SESSION_EVENT_REFRESH_COOLDOWN_MS = 15000;
const RECENT_COMMENT_DUPLICATE_SCAN_LIMIT = 120;
const RECENT_DIAGNOSTIC_COMMENT_LIMIT = 30;
const RECENT_SKIPPED_COMMENT_LIMIT = 20;
const HIGHLIGHT_MATCHED_EVENT_LIMIT = 80;
const STREAM_CATEGORY_DELAYS: Record<
  EventCategory,
  {
    initial: number;
    normal: number;
    catchup: number;
    catchupThreshold: number;
  }
> = {
  comment: {
    initial: 0,
    normal: 12,
    catchup: 6,
    catchupThreshold: 36,
  },
  gift: {
    initial: 0,
    normal: 28,
    catchup: 12,
    catchupThreshold: 55,
  },
  entry: {
    initial: 0,
    normal: 120,
    catchup: 50,
    catchupThreshold: 140,
  },
  interaction: {
    initial: 0,
    normal: 120,
    catchup: 50,
    catchupThreshold: 140,
  },
  log: {
    initial: STREAM_ROW_INITIAL_DELAY_MS,
    normal: STREAM_ROW_DELAY_MS,
    catchup: STREAM_ROW_CATCHUP_DELAY_MS,
    catchupThreshold: 8,
  },
};



type CompiledHighlightUser = HighlightUserConfig & {
  normalizedUserId: string;
  matcher?: RegExp;
};

type PreparedEventRow = {
  item: LiveEvent;
  matched: boolean;
  mysteryActor: boolean;
  highlightUser?: HighlightUserConfig;
  rowClass: string;
};

type CommentDuplicateMeta = {
  item: LiveEvent;
  texts: Set<string>;
  identities: Set<string>;
  rawText: string;
  at: number;
};

type EventDuplicateMeta = CommentDuplicateMeta | {
  item: LiveEvent;
  key: string;
  at: number;
};


function clampSplitRatio(value: number): number {
  return Math.max(0.28, Math.min(0.72, value));
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = readLocalStorageItem(key);
    if (!raw) {
      return fallback;
    }
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function readLocalStorageItem(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in restricted renderer profiles; UI state should still render.
  }
}

function useStableEvent<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useMemo(
    () =>
      ((...args: Parameters<T>): ReturnType<T> => callbackRef.current(...args)) as T,
    [],
  );
}

function readTheme(): ThemeId {
  if (typeof window === 'undefined') {
    return 'slate';
  }

  const stored = readLocalStorageItem(STORAGE_KEYS.theme);
  const matched = THEME_OPTIONS.find((item) => item.id === stored);
  return matched?.id ?? 'slate';
}

function readMessageFontSize(): MessageFontSize {
  if (typeof window === 'undefined') {
    return 'normal';
  }

  const stored = readLocalStorageItem(STORAGE_KEYS.messageFontSize);
  const matched = FONT_SIZE_OPTIONS.find((item) => item.id === stored);
  return matched?.id ?? 'normal';
}

function formatTime(value?: string): string {
  if (!value) {
    return '--:--:--';
  }

  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
}

function splitKeywords(raw: string): string[] {
  return raw
    .split(/[\s,，、]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function buildSearchText(item: LiveEvent, highlightUser?: HighlightUserConfig): string {
  return [item.userName, item.message, item.giftName, highlightUser?.remark]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesKeywords(
  item: LiveEvent,
  keywords: string[],
  mode: MatchMode,
  highlightUser?: HighlightUserConfig,
): boolean {
  if (!keywords.length) {
    return false;
  }

  const searchText = buildSearchText(item, highlightUser);
  if (mode === 'all') {
    return keywords.every((keyword) => searchText.includes(keyword));
  }
  return keywords.some((keyword) => searchText.includes(keyword));
}

function buildStatusText(runtime: RuntimeSnapshot): string {
  const hostName = runtime.room?.hostName || '未识别主播';
  const title = runtime.room?.roomTitle || runtime.room?.roomId || '等待采集';
  return `当前直播间：${hostName} | ${title}`;
}

function compareEvents(a: LiveEvent, b: LiveEvent): number {
  const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const leftKey = String(a.uniqueKey);
  const rightKey = String(b.uniqueKey);
  if (leftKey === rightKey) {
    return 0;
  }

  const leftId = typeof a.id === 'number' ? a.id : 0;
  const rightId = typeof b.id === 'number' ? b.id : 0;
  if (leftId > 0 && rightId > 0 && leftId !== rightId) {
    return leftId - rightId;
  }

  const orderDiff = getEventOrderValue(a) - getEventOrderValue(b);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return leftKey.localeCompare(rightKey);
}

function getEventOrderValue(item: LiveEvent): number {
  if (typeof item.id === 'number' && item.id > 0) {
    return item.id;
  }

  const payload = readEventPayload(item);
  const ingestSeq = Number(payload.ingestSeq);
  return Number.isFinite(ingestSeq) && ingestSeq > 0 ? ingestSeq : 0;
}

function isLiveConnectCountdownNoise(item: LiveEvent): boolean {
  if (item.category !== 'comment') {
    return false;
  }

  const payload = readEventPayload(item);
  const message = String(item.message ?? '').trim();
  const rawText = String(payload.rawText ?? payload.text ?? message).trim();
  const compactRawText = rawText.replace(/\s+/gu, '');
  const isPlainNumericCountdown = /^(?:[6-9]|[1-5]\d|60)$/u.test(message);
  const isPureCountdown = /^(?:(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\(?\s*\d{1,4}\s*(?:s|S|秒|秒钟)\s*\)?)$/iu.test(message);
  const isHostNumericCountdown =
    String(item.userName ?? payload.userName ?? '').trim() === String(item.hostName ?? '').trim() &&
    isPlainNumericCountdown;
  const isProfileIdCountdownText = /^(?:.*?(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}.*?[：:])\(?\s*(?:(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\d{1,4}(?:s|S|秒|秒钟))\s*\)?$/iu.test(compactRawText);

  return isPureCountdown || isHostNumericCountdown || isProfileIdCountdownText;
}

function isHighlightDisplayNoise(item: LiveEvent): boolean {
  if (item.category !== 'comment') {
    return false;
  }

  const payload = readEventPayload(item);
  const text = normalizeDuplicateValue([item.message, payload.text, payload.rawText].filter(Boolean).join(' '));
  return /(?:恭喜.+成为在线观众\s*top\s*\d+|在线观众\s*top\s*\d+|贡献排名|直播间贡献排名)/iu.test(text);
}

function getEventTimeMs(item: LiveEvent): number {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeDuplicateValue(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/gu, ' ').normalize('NFKC').toLowerCase();
}

function extractCommentUserFromText(value: unknown): string {
  const text = normalizeDuplicateValue(value);
  const matched = text.match(/^([^:：]{1,24})[:：]\s*.+$/u);
  return matched?.[1]?.trim() ?? '';
}

function stripCommentSpeakerPrefix(text: string, identities: Set<string>): string {
  const matched = text.match(/^([^:：]{1,48})[:：]\s*(.+)$/u);
  if (!matched?.[2]) {
    return text;
  }

  const prefix = normalizeDuplicateValue(matched[1]);
  const body = normalizeDuplicateValue(matched[2]);
  if (!prefix || !body) {
    return text;
  }

  if (identities.has(prefix) || /^用户[a-z0-9_-]{3,}$/iu.test(prefix) || /^\d{5,}$/u.test(prefix)) {
    return body;
  }
  return text;
}

function getCommentDuplicateTextCandidates(item: LiveEvent, identities = getCommentDuplicateIdentitySet(item)): string[] {
  const payload = readEventPayload(item);
  const candidates = new Set<string>();

  for (const value of [item.message, payload.text, payload.rawText]) {
    const normalized = normalizeDuplicateValue(value);
    if (!normalized) {
      continue;
    }

    const stripped = stripCommentSpeakerPrefix(normalized, identities);
    if (stripped) {
      candidates.add(stripped);
    }
    candidates.add(normalized);
  }

  return Array.from(candidates);
}

function hasSetOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const item of left) {
    if (right.has(item)) {
      return true;
    }
  }
  return false;
}

function getCommentDuplicateIdentitySet(item: LiveEvent): Set<string> {
  const payload = readEventPayload(item);
  const identities = new Set<string>();
  for (const value of [
    item.userLink,
    item.userId,
    item.userName,
    payload.userLink,
    payload.userId,
    payload.userName,
    extractCommentUserFromText(payload.rawText),
    extractCommentUserFromText(item.message),
  ]) {
    const normalized = normalizeDuplicateValue(value);
    if (normalized) {
      identities.add(normalized);
    }
  }
  return identities;
}

function getCommentDuplicateMeta(item: LiveEvent): CommentDuplicateMeta {
  const payload = readEventPayload(item);
  const identities = getCommentDuplicateIdentitySet(item);
  return {
    item,
    texts: new Set(getCommentDuplicateTextCandidates(item, identities)),
    identities,
    rawText: normalizeDuplicateValue(payload.rawText),
    at: getEventTimeMs(item),
  };
}

function summarizeDiagnosticEvent(item: LiveEvent): DiagnosticEventSummary {
  const payload = readEventPayload(item);
  return {
    uniqueKey: item.uniqueKey,
    category: item.category,
    createdAt: item.createdAt,
    userName: item.userName || payload.userName || undefined,
    userId: item.userId || payload.userId || undefined,
    userLink: item.userLink || payload.userLink || undefined,
    message: item.message || undefined,
    rawText: payload.rawText || undefined,
    payloadText: payload.text || undefined,
    sourceId: payload.sourceId || undefined,
  };
}


function isDuplicateCommentMetaWithinWindow(existing: CommentDuplicateMeta, candidate: CommentDuplicateMeta): boolean {
  return false;
}

function getEventIdentityKey(item: LiveEvent): string {
  const payload = readEventPayload(item);
  return (
    normalizeDuplicateValue(item.userId) ||
    normalizeDuplicateValue(payload.userId) ||
    normalizeDuplicateValue(item.userLink) ||
    normalizeDuplicateValue(payload.userLink) ||
    normalizeDuplicateValue(item.userName) ||
    normalizeDuplicateValue(payload.userName)
  );
}

function getNonCommentDuplicateBody(item: LiveEvent): string {
  const payload = readEventPayload(item);
  if (item.category === 'gift') {
    return normalizeDuplicateValue(
      [
        item.giftName,
        payload.giftName,
        item.message,
        payload.text,
        payload.rawText,
        item.giftCount || payload.giftCount || 1,
      ]
        .filter(Boolean)
        .join('|'),
    );
  }
  return normalizeDuplicateValue(item.message || payload.text || payload.rawText);
}

function getEventDuplicateMeta(item: LiveEvent): EventDuplicateMeta {
  if (item.category === 'comment') {
    return getCommentDuplicateMeta(item);
  }

  return {
    item,
    key: [item.category, getEventIdentityKey(item), getNonCommentDuplicateBody(item)].join('|'),
    at: getEventTimeMs(item),
  };
}

function getGiftIdentityScore(item: LiveEvent): number {
  const payload = readEventPayload(item);
  return (
    (normalizeDuplicateValue(item.userId) ? 4 : 0) +
    (normalizeDuplicateValue(item.userLink) ? 4 : 0) +
    (normalizeDuplicateValue(payload.userId) ? 2 : 0) +
    (normalizeDuplicateValue(payload.userLink) ? 2 : 0)
  );
}

function getMysteryIdentityCompleteness(item: LiveEvent): number {
  const payload = readEventPayload(item);
  return [
    item.userName,
    item.userId,
    item.userLink,
    payload.userName,
    payload.userId,
    payload.userLink,
  ].filter((value) => isMysteryIdentityForStats(value, item.category)).length;
}

function hasMysteryIdentityForStats(item: LiveEvent): boolean {
  return getMysteryIdentityCompleteness(item) > 0;
}

function shouldReplaceDisplayItem(existing: LiveEvent, candidate: LiveEvent): boolean {
  if (existing.uniqueKey !== candidate.uniqueKey) {
    return false;
  }
  if (existing.category !== 'gift' || candidate.category !== 'gift') {
    return false;
  }
  const candidateIsMystery = hasMysteryIdentityForStats(candidate);
  const existingIsMystery = hasMysteryIdentityForStats(existing);
  if (candidateIsMystery && !existingIsMystery) {
    return true;
  }

  const candidateIdentityScore = getGiftIdentityScore(candidate);
  const existingIdentityScore = getGiftIdentityScore(existing);
  if (candidateIdentityScore > existingIdentityScore) {
    return true;
  }

  return (
    candidateIdentityScore === existingIdentityScore &&
    candidateIsMystery &&
    existingIsMystery &&
    getMysteryIdentityCompleteness(candidate) > getMysteryIdentityCompleteness(existing)
  );
}

function mergeDisplayReplacement(existing: LiveEvent, candidate: LiveEvent): LiveEvent {
  return {
    ...existing,
    ...candidate,
    id: existing.id ?? candidate.id,
    createdAt: existing.createdAt || candidate.createdAt,
    payloadJson: mergeDisplayPayload(existing.payloadJson, candidate.payloadJson),
  };
}

function mergeDisplayPayload(existingPayloadJson: string | undefined, candidatePayloadJson: string | undefined): string | undefined {
  if (!candidatePayloadJson) {
    return existingPayloadJson;
  }
  if (!existingPayloadJson) {
    return candidatePayloadJson;
  }

  try {
    const existingPayload = JSON.parse(existingPayloadJson);
    const candidatePayload = JSON.parse(candidatePayloadJson);
    const existingIngestSeq = Number(existingPayload?.ingestSeq);
    const candidateIngestSeq = Number(candidatePayload?.ingestSeq);
    const ingestSeq =
      Number.isFinite(existingIngestSeq) && existingIngestSeq > 0
        ? existingIngestSeq
        : Number.isFinite(candidateIngestSeq) && candidateIngestSeq > 0
          ? candidateIngestSeq
          : undefined;
    return JSON.stringify({
      ...existingPayload,
      ...candidatePayload,
      ...(ingestSeq ? { ingestSeq } : {}),
    });
  } catch {
    return candidatePayloadJson;
  }
}

function isDuplicateEventMetaWithinWindow(existing: EventDuplicateMeta, candidate: EventDuplicateMeta): boolean {
  if (existing.item.category !== candidate.item.category) {
    return false;
  }
  if (existing.item.category === 'comment') {
    return false;
  }
  if (existing.at && candidate.at && Math.abs(candidate.at - existing.at) > NON_COMMENT_DUPLICATE_WINDOW_MS) {
    return false;
  }
  return 'key' in existing && 'key' in candidate && Boolean(existing.key) && existing.key === candidate.key;
}

function normalizeDisplayItems(items: LiveEvent[], category: EventCategory): LiveEvent[] {
  const uniqueItems = new Map<string, LiveEvent>();
  const orderedItems = [...items].sort(compareEvents);
  const recentItems =
    orderedItems.length > EVENT_LIMITS[category] * 3
      ? orderedItems.slice(-EVENT_LIMITS[category] * 3)
      : orderedItems;
  const recentMetas: EventDuplicateMeta[] = [];
  for (const item of recentItems) {
    if (isLiveConnectCountdownNoise(item)) {
      continue;
    }
    const itemMeta = getEventDuplicateMeta(item);
    if (recentMetas.some((existing) => isDuplicateEventMetaWithinWindow(existing, itemMeta))) {
      continue;
    }
    uniqueItems.set(item.uniqueKey, item);
    recentMetas.push(itemMeta);
    if (recentMetas.length > EVENT_LIMITS[category]) {
      recentMetas.shift();
    }
  }

  return Array.from(uniqueItems.values())
    .sort(compareEvents)
    .slice(-EVENT_LIMITS[category]);
}

function appendDisplayItem(items: LiveEvent[], row: LiveEvent): LiveEvent[] {
  if (isLiveConnectCountdownNoise(row)) {
    return items;
  }

  const rowMeta = getEventDuplicateMeta(row);
  if (items.some((item) => item.uniqueKey === row.uniqueKey || isDuplicateEventMetaWithinWindow(getEventDuplicateMeta(item), rowMeta))) {
    return items;
  }

  const lastItem = items[items.length - 1];
  const nextItems =
    !lastItem || compareEvents(lastItem, row) <= 0 ? [...items, row] : [...items, row].sort(compareEvents);

  return nextItems.slice(-EVENT_LIMITS[row.category]);
}

function appendDisplayItems(items: LiveEvent[], rows: LiveEvent[], category: EventCategory): LiveEvent[] {
  return appendDisplayItemsWithDiagnostics(items, rows, category).items;
}

function appendDisplayItemsWithDiagnostics(
  items: LiveEvent[],
  rows: LiveEvent[],
  category: EventCategory,
): {
  items: LiveEvent[];
  diagnostics: {
    categoryMismatch: number;
    noise: number;
    uniqueKeyDuplicate: number;
    duplicate: number;
    skipped: DisplaySkipDiagnostic[];
  };
} {
  const diagnostics = {
    categoryMismatch: 0,
    noise: 0,
    uniqueKeyDuplicate: 0,
    duplicate: 0,
    skipped: [] as DisplaySkipDiagnostic[],
  };
  if (!rows.length) {
    return { items, diagnostics };
  }

  const uniqueItems = new Map(items.map((item) => [item.uniqueKey, item]));
  const recentMetas = items
    .slice(-Math.min(items.length, RECENT_COMMENT_DUPLICATE_SCAN_LIMIT))
    .map(getEventDuplicateMeta);
  let changed = false;
  for (const row of rows) {
    if (row.category !== category) {
      diagnostics.categoryMismatch += 1;
      diagnostics.skipped.push({
        reason: 'categoryMismatch',
        at: new Date().toISOString(),
        candidate: summarizeDiagnosticEvent(row),
      });
      continue;
    }
    if (isLiveConnectCountdownNoise(row)) {
      diagnostics.noise += 1;
      diagnostics.skipped.push({
        reason: 'noise',
        at: new Date().toISOString(),
        candidate: summarizeDiagnosticEvent(row),
      });
      continue;
    }
    if (uniqueItems.has(row.uniqueKey)) {
      diagnostics.uniqueKeyDuplicate += 1;
      const existing = uniqueItems.get(row.uniqueKey);
      diagnostics.skipped.push({
        reason: 'uniqueKeyDuplicate',
        at: new Date().toISOString(),
        candidate: summarizeDiagnosticEvent(row),
        matchedExisting: existing ? summarizeDiagnosticEvent(existing) : undefined,
      });
      if (existing && shouldReplaceDisplayItem(existing, row)) {
        uniqueItems.set(row.uniqueKey, mergeDisplayReplacement(existing, row));
        changed = true;
      }
      continue;
    }
    const rowMeta = getEventDuplicateMeta(row);
    const duplicateMeta = recentMetas.find((item) => isDuplicateEventMetaWithinWindow(item, rowMeta));
    if (duplicateMeta) {
      diagnostics.duplicate += 1;
      diagnostics.skipped.push({
        reason: 'duplicate',
        at: new Date().toISOString(),
        candidate: summarizeDiagnosticEvent(row),
        matchedExisting: summarizeDiagnosticEvent(duplicateMeta.item),
        duplicateWindowMs:
          row.category === 'comment' ? COMMENT_DUPLICATE_WINDOW_MS : NON_COMMENT_DUPLICATE_WINDOW_MS,
      });
      continue;
    }

    uniqueItems.set(row.uniqueKey, row);
    changed = true;

    recentMetas.push(rowMeta);
    if (recentMetas.length > RECENT_COMMENT_DUPLICATE_SCAN_LIMIT) {
      recentMetas.shift();
    }
  }

  if (!changed) {
    return { items, diagnostics };
  }

  return { items: Array.from(uniqueItems.values()).sort(compareEvents).slice(-EVENT_LIMITS[category]), diagnostics };
}

function compareEventsDesc(a: Pick<LiveEvent, 'createdAt'>, b: Pick<LiveEvent, 'createdAt'>): number {
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

function parseStreamMessage(raw: string): StreamMessage | undefined {
  try {
    const parsed = JSON.parse(raw) as StreamMessage;
    return parsed && typeof parsed === 'object' && 'type' in parsed ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHighlightMatchedEvents(items: LiveEvent[]): LiveEvent[] {
  const uniqueItems = new Map<string, LiveEvent>();
  const recentMetas: EventDuplicateMeta[] = [];

  for (const item of items) {
    if (isLiveConnectCountdownNoise(item) || isHighlightDisplayNoise(item)) {
      continue;
    }

    const itemMeta = getEventDuplicateMeta(item);
    if (recentMetas.some((existing) => isDuplicateEventMetaWithinWindow(existing, itemMeta))) {
      continue;
    }
    recentMetas.push(itemMeta);
    if (recentMetas.length > HIGHLIGHT_MATCHED_EVENT_LIMIT) {
      recentMetas.shift();
    }

    uniqueItems.set(item.uniqueKey, item);
  }

  return Array.from(uniqueItems.values())
    .sort(compareEventsDesc)
    .slice(0, HIGHLIGHT_MATCHED_EVENT_LIMIT);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}




function getGiftDisplayText(item: LiveEvent): string {
  const payload = readEventPayload(item);
  const giftName = String(item.giftName ?? '').trim();
  const payloadGiftName = String(payload.giftName ?? '').trim();
  const giftCount = item.giftCount || payload.giftCount || 1;
  if (giftName) {
    return sanitizeGiftDisplayText(`${giftName} x${giftCount}`);
  }
  if (payloadGiftName) {
    return sanitizeGiftDisplayText(`${payloadGiftName} x${giftCount}`);
  }

  const parsedGiftText = parseGiftEventDetails(item).giftText?.trim();
  if (parsedGiftText) {
    return parsedGiftText;
  }

  const rawMessage = String(item.message ?? '').trim();
  if (!rawMessage) {
    return '';
  }

  const arrowMatched = rawMessage.match(/->\s*(.+)$/u);
  if (arrowMatched?.[1]) {
    return sanitizeGiftDisplayText(arrowMatched[1].trim());
  }

  const userName = getEffectiveUserName(item);
  if (userName) {
    const stripped = rawMessage
      .replace(new RegExp(`^${escapeRegExp(userName)}(?:\\s*[:：]\\s*|\\s+)`, 'u'), '')
      .trim();
    if (stripped) {
      return sanitizeGiftDisplayText(stripped);
    }
  }

  return sanitizeGiftDisplayText(rawMessage);
}

function isFloatingComment(item: LiveEvent): boolean {
  if (item.category !== 'comment' || !item.payloadJson) {
    return false;
  }

  try {
    const payload = JSON.parse(item.payloadJson) as { rawText?: string; text?: string; userName?: string };
    const rawText = String(payload.rawText ?? '').trim();
    const userName = String(payload.userName ?? item.userName ?? '').trim();
    if (!rawText || !userName) {
      return false;
    }

    const normalizedRawText = rawText.replace(/\s+/gu, ' ');
    if (/[:：]/u.test(normalizedRawText)) {
      return false;
    }

    return normalizedRawText.startsWith(userName);
  } catch {
    return false;
  }
}

function readEventPayload(item: LiveEvent): {
  rawText?: string;
  text?: string;
  userName?: string;
  userId?: string;
  userLink?: string;
  giftName?: string;
  giftCount?: number;
  sourceId?: string;
  ingestSeq?: number;
} {
  if (!item.payloadJson) {
    return {};
  }

  try {
    const payload = JSON.parse(item.payloadJson) as {
      rawText?: string;
      text?: string;
      userName?: string;
      userId?: string;
      userLink?: string;
      giftName?: string;
      giftCount?: number;
      sourceId?: string;
      ingestSeq?: number;
    };
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

function buildUserProfilePayload(item: LiveEvent): {
  userName?: string;
  userId?: string;
  userLink?: string;
  rawText?: string;
  message?: string;
} {
  const payload = readEventPayload(item);

  return {
    userName: getEffectiveUserName(item) || String(payload.userName ?? '').trim() || undefined,
    userId: String(item.userId ?? payload.userId ?? '').trim() || undefined,
    userLink: String(item.userLink ?? payload.userLink ?? '').trim() || undefined,
    rawText: String(payload.rawText ?? payload.text ?? '').trim() || undefined,
    message: String(item.message ?? '').trim() || undefined,
  };
}

function normalizeGiftBodyText(value: string, giftCount: number): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  const stripped = normalized
    .replace(/[xX×*]\s*\d{1,5}\s*$/u, '')
    .replace(/\d{1,5}\s*连击$/u, '')
    .replace(/\d{1,5}\s*(?:个|份|张)$/u, '')
    .trim();

  return sanitizeGiftDisplayText(`${stripped} x${giftCount > 0 ? giftCount : 1}`);
}

function sanitizeGiftDisplayText(value: string): string {
  return value
    .trim()
    .replace(/^(?:送礼|赠送(?:了)?|送出了?|送给(?:主播)?|打赏|投喂)\s*/u, '')
    .replace(/^礼\s+/u, '')
    .trim();
}

function parseGiftEventDetails(item: LiveEvent): { userName?: string; giftText?: string } {
  if (item.category !== 'gift') {
    return {};
  }

  const payload = readEventPayload(item);
  const giftCount = item.giftCount || payload.giftCount || 1;
  const actionPattern = '(?:送出了?|赠送了?|送给(?:主播)?|打赏|投喂|送)';
  const sources = [
    String(payload.giftName ?? '').trim(),
    String(payload.rawText ?? '').trim(),
    String(payload.text ?? '').trim(),
    String(item.message ?? '').trim(),
  ].filter(Boolean);

  for (const source of sources) {
    const whitespaceMatched = source.match(new RegExp(`^(.{1,24})\\s+${actionPattern}\\s*(.+)$`, 'u'));
    if (whitespaceMatched?.[1] && whitespaceMatched?.[2]) {
      return {
        userName: whitespaceMatched[1].trim(),
        giftText: normalizeGiftBodyText(whitespaceMatched[2], giftCount),
      };
    }

    const colonActionMatched = source.match(
      new RegExp(`^(.{1,24})[：:]\\s*${actionPattern}\\s*(.+)$`, 'u'),
    );
    if (colonActionMatched?.[1] && colonActionMatched?.[2]) {
      return {
        userName: colonActionMatched[1].trim(),
        giftText: normalizeGiftBodyText(colonActionMatched[2], giftCount),
      };
    }

    const arrowMatched = source.match(/^(.{1,24})\s*->\s*(.+)$/u);
    if (arrowMatched?.[1] && arrowMatched?.[2]) {
      return {
        userName: arrowMatched[1].trim(),
        giftText: normalizeGiftBodyText(arrowMatched[2], giftCount),
      };
    }
  }

  return {};
}






function getEffectiveUserName(item: LiveEvent): string {
  const directUserName = String(item.userName ?? '').trim();
  const payloadUserName = String(readEventPayload(item).userName ?? '').trim();
  const parsedGiftUserName = parseGiftEventDetails(item).userName?.trim() ?? '';

  return parsedGiftUserName || directUserName || payloadUserName;
}

function normalizeMysteryComparable(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\//iu, '');
}

function isMysteryName(value: string | undefined): boolean {
  const normalized = normalizeMysteryComparable(value);
  return normalized.includes('神秘人') || normalized.includes('神秘王者');
}

function isMysteryIdentityForStats(value: string | undefined, category: EventCategory): boolean {
  const normalized = normalizeMysteryComparable(value);
  if (!normalized) {
    return false;
  }
  if (normalized.includes('神秘人') || normalized.includes('神秘王者')) {
    return true;
  }
  return false;
}

function isDefaultMysteryAlias(value: string | undefined): boolean {
  const normalized = String(value ?? '').trim();
  return normalized.includes('神秘人') || normalized.includes('神秘王者');
}

function getPreferredUserDisplayName(item: LiveEvent, highlightUser?: HighlightUserConfig): string {
  const payload = readEventPayload(item);
  const parsedGiftUserName = parseGiftEventDetails(item).userName?.trim() ?? '';
  const names = [item.userName, payload.userName, parsedGiftUserName]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  const realName = names.find((name) => !isDefaultMysteryAlias(name));
  const originalName = realName || names[0] || String(item.userId ?? payload.userId ?? '').trim() || '匿名用户';
  return originalName;
}

function isMysteryActorEvent(item: LiveEvent, category: EventCategory): boolean {
  if (category !== 'comment' && category !== 'gift') {
    return false;
  }

  return isMysteryName(getEffectiveUserName(item)) || hasMysteryIdentityForStats(item);
}

function normalizeHighlightComparable(value: string | undefined): string {
  return String(value ?? '').trim().normalize('NFKC').toLowerCase();
}

function normalizeHighlightIdentityToken(value: string | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  return normalizeHighlightComparable(extractProfileUserId(normalized) || normalized);
}

function escapeHighlightPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function compileHighlightUsers(users: HighlightUserConfig[]): CompiledHighlightUser[] {
  const compiled: CompiledHighlightUser[] = [];
  for (const user of users) {
    const normalizedUserId = normalizeHighlightIdentityToken(user.userId);
    if (!normalizedUserId) {
      continue;
    }
    const matcher = normalizedUserId.includes('*')
      ? new RegExp(`^${normalizedUserId.split('*').map(escapeHighlightPattern).join('.*')}$`, 'iu')
      : undefined;
    compiled.push({
      ...user,
      normalizedUserId,
      matcher,
    });
  }
  return compiled;
}

function highlightPatternMatches(candidate: string, user: CompiledHighlightUser): boolean {
  if (!candidate || !user.normalizedUserId) {
    return false;
  }
  return user.matcher ? user.matcher.test(candidate) : candidate === user.normalizedUserId;
}

function extractProfileUserId(value: string | undefined): string {
  const normalized = String(value ?? '').trim();
  const pathMatched = normalized.match(/douyin\.com\/(?:user|follow)\/([^/?#]+)/iu);
  if (pathMatched?.[1]) {
    return decodeURIComponent(pathMatched[1]);
  }
  const queryMatched = normalized.match(/[?&](?:sec_uid|secUid|modal_id|modalId|user_id|userId|user_unique_id|userUniqueId|open_id|openId|webcast_uid|webcastUid|from_user_id|fromUserId|to_user_id|toUserId|anchor_id|anchorId)=([^&#"'&\s]+)/iu);
  if (queryMatched?.[1]) {
    return decodeURIComponent(queryMatched[1]);
  }
  const attributeMatched = normalized.match(/(?:^|[\s"'=:{,])(?:sec_uid|secUid|modal_id|modalId|user_id|userId|user_unique_id|userUniqueId|open_id|openId|webcast_uid|webcastUid|from_user_id|fromUserId|to_user_id|toUserId|anchor_id|anchorId|data-user-id|data-userid|data-sec-user-id|data-sec-uid|data-user-unique-id|data-user-uniqueid|data-open-id|data-openid|data-webcast-uid|uid)["']?\s*[:=]\s*["']?([^"',\s}<>]+)/iu);
  return attributeMatched?.[1] ? decodeURIComponent(attributeMatched[1]) : '';
}
function getHighlightUserMatch(
  item: LiveEvent,
  category: EventCategory,
  users: CompiledHighlightUser[],
): HighlightUserConfig | undefined {
  return getHighlightMatchDetails(item, category, users)?.highlightUser;
}

function getHighlightMatchDetails(
  item: LiveEvent,
  category: EventCategory,
  users: CompiledHighlightUser[],
): {
  uniqueKey: string;
  category: 'comment' | 'gift';
  highlightUser: HighlightUserConfig;
  remark?: string;
  matchedBy: string;
  matchedValue: string;
  userId?: string;
  userLink?: string;
  message?: string;
} | undefined {
  if ((category !== 'comment' && category !== 'gift') || users.length === 0) {
    return undefined;
  }

  const payload = readEventPayload(item);
  const linkUserId = extractProfileUserId(item.userLink);
  const payloadLinkUserId = extractProfileUserId(payload.userLink);
  const candidates = [
    { matchedBy: 'event.userId', value: item.userId },
    { matchedBy: 'event.userLink', value: item.userLink },
    { matchedBy: 'event.userLink.sec_uid', value: linkUserId },
    { matchedBy: 'payload.userId', value: payload.userId },
    { matchedBy: 'payload.userLink', value: payload.userLink },
    { matchedBy: 'payload.userLink.sec_uid', value: payloadLinkUserId },
  ] as Array<{ matchedBy: string; value?: string }>;
  for (const user of users) {
    for (const candidate of candidates) {
      const normalized = normalizeHighlightIdentityToken(candidate.value);
      if (!normalized || !highlightPatternMatches(normalized, user)) {
        continue;
      }
      if (category === 'gift') {
        return {
          uniqueKey: item.uniqueKey,
          category: 'gift',
          highlightUser: user,
          remark: user.remark,
          matchedBy: candidate.matchedBy,
          matchedValue: normalized,
          userId: item.userId || payload.userId || undefined,
          userLink: item.userLink || payload.userLink || undefined,
          message: item.message || payload.text || payload.rawText || undefined,
        };
      }
      return {
        uniqueKey: item.uniqueKey,
        category: 'comment',
        highlightUser: user,
        remark: user.remark,
        matchedBy: candidate.matchedBy,
        matchedValue: normalized,
        userId: item.userId || payload.userId || undefined,
        userLink: item.userLink || payload.userLink || undefined,
        message: item.message || payload.text || payload.rawText || undefined,
      };
    }
  }
  return undefined;
}
const resolvedProfileUrlCache = new Map<string, string>();
const resolvingProfileUrlCache = new Map<string, Promise<string | undefined>>();
const PROFILE_URL_CACHE_LIMIT = 300;

function rememberResolvedProfileUrl(cacheKey: string, resolvedUrl: string): void {
  if (resolvedProfileUrlCache.has(cacheKey)) {
    resolvedProfileUrlCache.delete(cacheKey);
  }
  resolvedProfileUrlCache.set(cacheKey, resolvedUrl);
  while (resolvedProfileUrlCache.size > PROFILE_URL_CACHE_LIMIT) {
    const oldestKey = resolvedProfileUrlCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    resolvedProfileUrlCache.delete(oldestKey);
  }
}

function getUserProfileUrl(item: LiveEvent): string | undefined {
  const isDirectProfileUrl = (value: string): boolean =>
    /^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\/[^/?#]+/iu.test(value);
  const isDirectProfileId = (value: string): boolean =>
    /^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(value);
  const buildSearchQuery = (): string => {
    const userName = getEffectiveUserName(item);
    const numericNameMatched = userName.match(/^用户(\d{6,})$/u);
    if (numericNameMatched?.[1]) {
      return numericNameMatched[1];
    }
    const userId = String(item.userId ?? '').trim();
    if (userId && !isDirectProfileId(userId) && /^\d{6,}$/u.test(userId)) {
      return userId;
    }
    return userName;
  };
  const link = String(item.userLink ?? '').trim();
  if (link) {
    if (/^https?:\/\//iu.test(link) && isDirectProfileUrl(link)) {
      return link;
    }
    if (link.startsWith('//')) {
      const absoluteLink = `https:${link}`;
      if (isDirectProfileUrl(absoluteLink)) {
        return absoluteLink;
      }
    }
    if (link.startsWith('/')) {
      const absoluteLink = `https://www.douyin.com${link}`;
      if (isDirectProfileUrl(absoluteLink)) {
        return absoluteLink;
      }
    }
  }

  if (item.userId && isDirectProfileId(String(item.userId).trim())) {
    return `https://www.douyin.com/user/${encodeURIComponent(item.userId)}`;
  }

  const searchQuery = buildSearchQuery();
  if (searchQuery) {
    return `https://www.douyin.com/search/${encodeURIComponent(searchQuery)}?type=user`;
  }

  return undefined;
}

function getDirectUserProfileUrl(item: LiveEvent): string | undefined {
  const isDirectProfileUrl = (value: string): boolean =>
    /^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\/[^/?#]+/iu.test(value);
  const isDirectProfileId = (value: string): boolean =>
    /^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(value);
  const payload = readEventPayload(item);
  const links = [item.userLink, payload.userLink].map((value) => String(value ?? '').trim()).filter(Boolean);
  for (const link of links) {
    if (/^https?:\/\//iu.test(link) && isDirectProfileUrl(link)) {
      return link;
    }
    if (link.startsWith('//')) {
      const absoluteLink = `https:${link}`;
      if (isDirectProfileUrl(absoluteLink)) {
        return absoluteLink;
      }
    }
    if (link.startsWith('/')) {
      const absoluteLink = `https://www.douyin.com${link}`;
      if (isDirectProfileUrl(absoluteLink)) {
        return absoluteLink;
      }
    }
  }

  const userIds = [item.userId, payload.userId].map((value) => String(value ?? '').trim()).filter(Boolean);
  for (const userId of userIds) {
    if (isDirectProfileId(userId)) {
      return `https://www.douyin.com/user/${encodeURIComponent(userId)}`;
    }
  }

  return undefined;
}

function getUserSearchUrl(item: LiveEvent): string | undefined {
  const isDirectProfileId = (value: string): boolean =>
    /^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(value);
  const userName = getEffectiveUserName(item);
  const numericNameMatched = userName.match(/^用户(\d{6,})$/u);
  if (numericNameMatched?.[1]) {
    return `https://www.douyin.com/search/${encodeURIComponent(numericNameMatched[1])}?type=user`;
  }
  const userId = String(item.userId ?? '').trim();
  if (userId && !isDirectProfileId(userId) && /^\d{6,}$/u.test(userId)) {
    return `https://www.douyin.com/search/${encodeURIComponent(userId)}?type=user`;
  }
  if (userName) {
    return `https://www.douyin.com/search/${encodeURIComponent(userName)}?type=user`;
  }

  return undefined;
}

function buildUserResolveCacheKey(item: LiveEvent): string {
  const payload = readEventPayload(item);
  return [
    getEffectiveUserName(item),
    String(item.userId ?? '').trim(),
    String(item.userLink ?? '').trim(),
    String(payload.rawText ?? payload.text ?? '').trim(),
  ].join('|');
}

function getCachedResolvedProfileUrl(item: LiveEvent): string | undefined {
  const cacheKey = buildUserResolveCacheKey(item);
  if (!cacheKey.replace(/\|/gu, '')) {
    return undefined;
  }
  return resolvedProfileUrlCache.get(cacheKey);
}

async function resolveUserProfileUrl(item: LiveEvent): Promise<string | undefined> {
  const directUrl = getDirectUserProfileUrl(item);
  if (directUrl) {
    return directUrl;
  }

  const cacheKey = buildUserResolveCacheKey(item);
  if (!cacheKey.replace(/\|/gu, '')) {
    return undefined;
  }
  const cachedUrl = getCachedResolvedProfileUrl(item);
  if (cachedUrl) {
    return cachedUrl;
  }

  const inflight = resolvingProfileUrlCache.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const task = api
    .resolveUserProfile(buildUserProfilePayload(item))
    .then((result) => {
      const resolvedUrl = String(result.url ?? '').trim();
      if (resolvedUrl) {
        rememberResolvedProfileUrl(cacheKey, resolvedUrl);
        return resolvedUrl;
      }
      return undefined;
    })
    .catch(() => undefined)
    .finally(() => {
      resolvingProfileUrlCache.delete(cacheKey);
    });

  resolvingProfileUrlCache.set(cacheKey, task);
  return task;
}

function openUserProfileWindow(url: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (popup) {
    popup.opener = null;
  }
}


function getMysteryUserProfileUrl(item: SessionStats['activeUsers'][number]): string | undefined {
  const lookupItem: LiveEvent = {
    uniqueKey: `${item.name}|${String(item.userId ?? '').trim()}|${String(item.userLink ?? '').trim()}`,
    sessionId: '',
    category: 'comment',
    createdAt: '',
    userName: item.name,
    userId: String(item.userId ?? '').trim() || undefined,
    userLink: String(item.userLink ?? '').trim() || undefined,
    message: item.name,
  };
  return getUserProfileUrl(lookupItem);
}

async function openMysteryUserProfile(item: SessionStats['activeUsers'][number]): Promise<void> {
  const payload = {
    userName: item.name,
    userId: String(item.userId ?? '').trim() || undefined,
    userLink: String(item.userLink ?? '').trim() || undefined,
    message: item.name,
  };
  const resolvedUrl = await api
    .resolveUserProfile(payload)
    .then((result) => result.url)
    .catch(() => undefined);
  if (resolvedUrl) {
    const opened = await api.openUserProfile({ ...payload, userLink: resolvedUrl }).catch(() => ({ ok: false as const }));
    if (!opened.ok) {
      openUserProfileWindow(resolvedUrl);
    }
    return;
  }

  const fallbackUrl = getMysteryUserProfileUrl(item);
  if (fallbackUrl) {
    openUserProfileWindow(fallbackUrl);
  }
}

function getMysteryUserDisplayName(item: SessionStats['activeUsers'][number]): string {
  const lookupItem: LiveEvent = {
    uniqueKey: `${item.name}|${String(item.userId ?? '').trim()}|${String(item.userLink ?? '').trim()}`,
    sessionId: '',
    category: 'comment',
    createdAt: item.lastActiveAt || '',
    userName: item.name,
    userId: String(item.userId ?? '').trim() || undefined,
    userLink: String(item.userLink ?? '').trim() || undefined,
    message: item.name,
  };
  return getPreferredUserDisplayName(lookupItem);
}

function getMysteryUserSourceText(item: SessionStats['activeUsers'][number]): string {
  const parts = [
    item.entryCount > 0 ? `进场 ${item.entryCount}` : '',
    item.commentCount > 0 ? `评论 ${item.commentCount}` : '',
    item.giftCount > 0 ? `送礼 ${item.giftCount}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : '已出现';
}






function renderUserLabel(item: LiveEvent, suffix = '', highlightUser?: HighlightUserConfig) {
  const user = getPreferredUserDisplayName(item, highlightUser);
  const label = `[${user}]${suffix}`;
  const profileUrl = getUserProfileUrl(item);

  if (!profileUrl) {
    return <span className="event-user">{label}</span>;
  }

  return (
    <a
      className="event-user event-user-link"
      href={profileUrl}
      target="_blank"
      rel="noreferrer"
      title="打开用户主页"
      onClick={async (event) => {
        event.preventDefault();
        const directUrl = getDirectUserProfileUrl(item);
        if (directUrl) {
          rememberResolvedProfileUrl(buildUserResolveCacheKey(item), directUrl);
          openUserProfileWindow(directUrl);
          return;
        }

        const cachedUrl = getCachedResolvedProfileUrl(item);
        if (cachedUrl) {
          openUserProfileWindow(cachedUrl);
          return;
        }

        const profilePayload = buildUserProfilePayload(item);
        const opened = await api
          .openUserProfile(profilePayload)
          .catch(() => ({ ok: false as const }));
        if (opened.ok) {
          return;
        }
        const resolvedUrl = ('url' in opened ? opened.url : undefined) || (await resolveUserProfileUrl(item));
        if (resolvedUrl) {
          openUserProfileWindow(resolvedUrl);
          return;
        }
        const fallbackUrl = getUserSearchUrl(item) || profileUrl;
        if (fallbackUrl) {
          openUserProfileWindow(fallbackUrl);
        }
      }}
    >
      {label}
    </a>
  );
}



function renderEventLine(item: LiveEvent, category: EventCategory, highlightUser?: HighlightUserConfig) {
  const time = formatTime(item.createdAt);

  if (category === 'entry') {
    return (
      <>
        <span className="event-time">[{time}]</span>
        <span className="event-tag event-tag-entry">进场</span>
        {renderUserLabel(item, '', highlightUser)}
        <span className="event-body">{item.message || '进入直播间'}</span>
      </>
    );
  }

  if (category === 'interaction') {
    return (
      <>
        <span className="event-time">[{time}]</span>
        <span className="event-tag event-tag-interaction">互动</span>
        {renderUserLabel(item, '', highlightUser)}
        <span className="event-body">{item.message || '触发互动行为'}</span>
      </>
    );
  }

  if (category === 'gift') {
    const parsedGift = parseGiftEventDetails(item);
    const giftText = parsedGift.giftText || getGiftDisplayText(item);
    return (
      <>
        <span className="event-time">[{time}]</span>
        {renderUserLabel(item, '', highlightUser)}
        <span className="event-tag event-tag-gift">礼</span>
        <span className="event-body">{giftText}</span>
      </>
    );
  }

  if (category === 'comment') {
    const isFloating = isFloatingComment(item);
    return (
      <>
        <span className="event-time">[{time}]</span>
        {isFloating ? <span className="event-tag event-tag-comment">弹</span> : null}
        {renderUserLabel(item, '：', highlightUser)}
        <span className="event-body">{item.message}</span>
      </>
    );
  }

  return (
    <>
      <span className="event-time">[{time}]</span>
      <span className="event-body">{item.message}</span>
    </>
  );
}








function ResizeHandle({
  size,
  min = 120,
  max = 760,
  onPreview,
  onCommit,
}: {
  size: number;
  min?: number;
  max?: number;
  onPreview: (nextSize: number) => void;
  onCommit: (nextSize: number) => void;
}) {
  const frameRef = useRef<number | null>(null);
  const lastSizeRef = useRef(size);

  useEffect(() => {
    lastSizeRef.current = size;
  }, [size]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startY = event.clientY;
    const startSize = lastSizeRef.current;
    document.body.classList.add('is-resizing');

    const move = (pointerEvent: PointerEvent) => {
      const nextSize = Math.max(min, Math.min(max, startSize + (pointerEvent.clientY - startY)));
      lastSizeRef.current = nextSize;

      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        onPreview(nextSize);
      });
    };

    const finish = () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      onCommit(lastSizeRef.current);
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', finish, { passive: true });
    window.addEventListener('pointercancel', finish, { passive: true });
  };

  return <div className="resize-handle" onPointerDown={handlePointerDown} title="拖动调整高度" />;
}

function HorizontalResizeHandle({
  ratio,
  onPreview,
  onCommit,
}: {
  ratio: number;
  onPreview: (nextRatio: number) => void;
  onCommit: (nextRatio: number) => void;
}) {
  const frameRef = useRef<number | null>(null);
  const ratioRef = useRef(ratio);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    document.body.classList.add('is-resizing-x');

    const move = (pointerEvent: PointerEvent) => {
      const nextRatio = clampSplitRatio((pointerEvent.clientX - bounds.left) / bounds.width);
      ratioRef.current = nextRatio;

      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        onPreview(nextRatio);
      });
    };

    const finish = () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      document.body.classList.remove('is-resizing-x');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      onCommit(ratioRef.current);
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', finish, { passive: true });
    window.addEventListener('pointercancel', finish, { passive: true });
  };

  return <div className="split-handle-x" onPointerDown={handlePointerDown} title="拖拽调整宽度" />;
}





const EventList = memo(function EventList({
  sessionId,
  title,
  category,
  items,
  keywords,
  matchMode,
  focusMode,
  height,
  highlightUsers,
  messageFontSize,
}: {
  sessionId?: string;
  title: string;
  category: EventCategory;
  items: LiveEvent[];
  keywords: string[];
  matchMode: MatchMode;
  focusMode: boolean;
  height: number;
  highlightUsers: CompiledHighlightUser[];
  messageFontSize: MessageFontSize;
}) {
  const displayItems = items;
  const preparedRows = useMemo<PreparedEventRow[]>(
    () =>
      displayItems.map((item) => {
        const mysteryActor = isMysteryActorEvent(item, category);
        const highlightUser = getHighlightUserMatch(item, category, highlightUsers);
        const matched = matchesKeywords(item, keywords, matchMode, highlightUser);
        const rowClass = [
          'event-row',
          matched ? 'event-row-match' : '',
          mysteryActor ? 'event-row-mystery' : '',
          highlightUser ? 'event-row-highlight-user' : '',
          focusMode && keywords.length && !matched && !mysteryActor && !highlightUser ? 'event-row-muted' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return { item, matched, mysteryActor, highlightUser, rowClass };
      }),
    [category, displayItems, focusMode, highlightUsers, keywords, matchMode],
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const latestKeyRef = useRef<string | undefined>(undefined);
  const previousLengthRef = useRef(0);
  const stickToLatestRef = useRef(true);
  const hasRealtimeAppendRef = useRef(false);
  const followPausedRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [followPaused, setFollowPaused] = useState(false);
  const [showLatestButton, setShowLatestButton] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const latestAtBottom = true;
  const latestEdgeKey =
    displayItems.length > 0
      ? displayItems[latestAtBottom ? displayItems.length - 1 : 0]?.uniqueKey
      : undefined;
  const getScrollBottomTop = () => {
    const element = listRef.current;
    if (!element) {
      return 0;
    }
    return Math.max(0, element.scrollHeight - element.clientHeight);
  };

  const clearProgrammaticScrollFlag = () => {
    if (programmaticScrollTimerRef.current) {
      window.clearTimeout(programmaticScrollTimerRef.current);
      programmaticScrollTimerRef.current = null;
    }
    programmaticScrollRef.current = false;
  };

  const scrollToLatest = (behavior: ScrollBehavior = 'auto', resumeFollow = true) => {
    const element = listRef.current;
    if (!element) {
      return;
    }

    clearProgrammaticScrollFlag();
    programmaticScrollRef.current = true;
    const bottomTop = getScrollBottomTop();
    element.scrollTo({ top: bottomTop, behavior });
    setScrollTop(bottomTop);

    if (resumeFollow) {
      followPausedRef.current = false;
      setFollowPaused(false);
    }
    stickToLatestRef.current = true;
    setPendingCount(0);
    setShowLatestButton(false);
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      programmaticScrollTimerRef.current = null;
    }, 120);
  };

  const pauseFollow = () => {
    stickToLatestRef.current = false;
    followPausedRef.current = true;
    setFollowPaused(true);
    setShowLatestButton(true);
  };

  const keepLatestOnResize = useStableEvent(() => {
    const element = listRef.current;
    if (!element || displayItems.length === 0 || followPausedRef.current) {
      return;
    }

    stickToLatestRef.current = true;
    setPendingCount(0);
    setShowLatestButton(false);
    requestAnimationFrame(() => {
      scrollToLatest('auto', false);
    });
  });

  useEffect(() => {
    latestKeyRef.current = undefined;
    previousLengthRef.current = 0;
    stickToLatestRef.current = true;
    hasRealtimeAppendRef.current = false;
    followPausedRef.current = false;
    setFollowPaused(false);
    setPendingCount(0);
    setShowLatestButton(false);
    setScrollTop(0);
    requestAnimationFrame(() => {
      scrollToLatest('auto');
    });
  }, [sessionId, category]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }

    let frameId = 0;
    const scheduleKeepLatest = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        keepLatestOnResize();
      });
    };

    scheduleKeepLatest();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleKeepLatest) : null;
    observer?.observe(element);
    window.addEventListener('resize', scheduleKeepLatest, { passive: true });

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      clearProgrammaticScrollFlag();
      observer?.disconnect();
      window.removeEventListener('resize', scheduleKeepLatest);
    };
  }, [height, keepLatestOnResize]);

  useEffect(() => {
    if (!displayItems.length || followPausedRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToLatest('auto', false);
    });
  }, [messageFontSize]);

  useEffect(() => {
    if (!displayItems.length) {
      latestKeyRef.current = undefined;
      previousLengthRef.current = 0;
      stickToLatestRef.current = true;
      hasRealtimeAppendRef.current = false;
      followPausedRef.current = false;
      setFollowPaused(false);
      setPendingCount(0);
      setShowLatestButton(false);
      setScrollTop(0);
      return;
    }

    const previousLatestKey = latestKeyRef.current;
    const previousLength = previousLengthRef.current;

    latestKeyRef.current = latestEdgeKey;
    previousLengthRef.current = displayItems.length;

    if (displayItems.length < previousLength || !previousLatestKey) {
      stickToLatestRef.current = true;
      hasRealtimeAppendRef.current = false;
      followPausedRef.current = false;
      setFollowPaused(false);
      setPendingCount(0);
      setShowLatestButton(false);
      setScrollTop(0);
      requestAnimationFrame(() => {
        const element = listRef.current;
        element?.scrollTo({ top: 0, behavior: 'auto' });
      });
      return;
    }

    if (previousLatestKey === latestEdgeKey && displayItems.length >= previousLength) {
      return;
    }

    if (!followPausedRef.current) {
      stickToLatestRef.current = true;
      hasRealtimeAppendRef.current = true;
      setPendingCount(0);
      setShowLatestButton(false);
      requestAnimationFrame(() => {
        scrollToLatest('auto', false);
      });
      return;
    }

    setPendingCount((current) => current + 1);
    setShowLatestButton(true);
  }, [displayItems, latestEdgeKey]);

  return (
    <div className={`event-panel event-panel-${category}`}>
      <div className="event-panel-head">
        <div className="event-panel-title">{title}</div>
        <div className="event-panel-actions">
          <button
            className={`event-follow-btn${followPaused ? ' is-paused' : ''}`}
            onClick={() => {
              if (followPaused) {
                scrollToLatest('auto');
                return;
              }
              pauseFollow();
            }}
            type="button"
          >
            {followPaused ? `显示最新消息${pendingCount > 0 ? ` (${pendingCount})` : ''}` : '暂停跟随'}
          </button>
        </div>
      </div>
      <div
        className="event-list"
        ref={listRef}
        style={{ height }}
        onScroll={(event) => {
          if (programmaticScrollRef.current) {
            return;
          }
          if (!followPausedRef.current) {
            stickToLatestRef.current = true;
            setPendingCount(0);
            setShowLatestButton(false);
          }
        }}
      >
        {displayItems.length === 0 ? <div className="event-empty">暂无数据</div> : null}
        {displayItems.length > 0
          ? preparedRows.map(({ item, highlightUser, rowClass }) => (
              <div className={rowClass} key={item.uniqueKey}>
                {highlightUser ? (
                  <div className="event-highlight-marker">
                    特别关注 {highlightUser.remark || highlightUser.userId}
                  </div>
                ) : null}
                <div className="event-line">{renderEventLine(item, category, highlightUser)}</div>
              </div>
            ))
          : null}
      </div>
    </div>
  );
});

const DualEventBlock = memo(function DualEventBlock({
  sessionId,
  collapsed,
  savedHeight,
  savedSplitRatio,
  heightMin = 120,
  heightMax = 760,
  onToggle,
  onHeightCommit,
  onSplitCommit,
  blockTitle,
  leftCategory,
  leftTitle,
  leftItems,
  rightCategory,
  rightTitle,
  rightItems,
  keywords,
  matchMode,
  focusMode,
  highlightUsers,
  messageFontSize,
}: {
  sessionId?: string;
  collapsed: boolean;
  savedHeight: number;
  savedSplitRatio?: number;
  heightMin?: number;
  heightMax?: number;
  onToggle: () => void;
  onHeightCommit: (nextSize: number) => void;
  onSplitCommit?: (nextRatio: number) => void;
  blockTitle: string;
  leftCategory: EventCategory;
  leftTitle: string;
  leftItems: LiveEvent[];
  rightCategory: EventCategory;
  rightTitle: string;
  rightItems: LiveEvent[];
  keywords: string[];
  matchMode: MatchMode;
  focusMode: boolean;
  highlightUsers: CompiledHighlightUser[];
  messageFontSize: MessageFontSize;
}) {
  const [height, setHeight] = useState(savedHeight);
  const [splitRatio, setSplitRatio] = useState(savedSplitRatio ?? 0.5);

  useEffect(() => {
    setHeight(savedHeight);
  }, [savedHeight]);

  useEffect(() => {
    setSplitRatio(savedSplitRatio ?? 0.5);
  }, [savedSplitRatio]);

  return (
    <section className="block">
      <button className="block-title block-toggle" onClick={onToggle}>
        [{collapsed ? '-' : '+'}] {blockTitle}
      </button>
      {collapsed ? (
        <>
          <div
            className={`dual-grid ${onSplitCommit ? 'dual-grid-splittable' : ''}`.trim()}
            style={
              onSplitCommit
                ? {
                    gridTemplateColumns: `calc((100% - 10px) * ${splitRatio}) 10px calc((100% - 10px) * ${1 - splitRatio})`,
                  }
                : undefined
            }
          >
            <EventList
              sessionId={sessionId}
              title={leftTitle}
              category={leftCategory}
              items={leftItems}
              keywords={keywords}
              matchMode={matchMode}
              focusMode={focusMode}
              height={height}
              highlightUsers={highlightUsers}
              messageFontSize={messageFontSize}
            />
            {onSplitCommit ? (
              <HorizontalResizeHandle
                ratio={splitRatio}
                onPreview={setSplitRatio}
                onCommit={onSplitCommit}
              />
            ) : null}
            <EventList
              sessionId={sessionId}
              title={rightTitle}
              category={rightCategory}
              items={rightItems}
              keywords={keywords}
              matchMode={matchMode}
              focusMode={focusMode}
              height={height}
              highlightUsers={highlightUsers}
              messageFontSize={messageFontSize}
            />
          </div>
          <ResizeHandle
            size={height}
            min={heightMin}
            max={heightMax}
            onPreview={setHeight}
            onCommit={onHeightCommit}
          />
        </>
      ) : null}
    </section>
  );
});






function HighlightUsersBlock({
  snapshot,
  matchedEvents,
  highlightUsers,
  compact = false,
}: {
  snapshot: HighlightUsersSnapshot;
  matchedEvents: LiveEvent[];
  highlightUsers: CompiledHighlightUser[];
  compact?: boolean;
}) {
  const users = highlightUsers;
  const displayMatchedEvents = matchedEvents.slice(0, HIGHLIGHT_MATCHED_EVENT_LIMIT);

  return (
    <section className={`block highlight-block ${compact ? 'highlight-block-popover' : ''}`.trim()}>
      <div className="block-title highlight-title">
        <span>特别关注命中消息</span>
        <strong>{displayMatchedEvents.length} 条</strong>
      </div>
      {snapshot.error ? <div className="highlight-error">{snapshot.error}</div> : null}
      <div className="highlight-hit-list">
        {displayMatchedEvents.length ? (
          displayMatchedEvents.map((item) => {
            const matchCategory = item.category === 'gift' ? 'gift' : 'comment';
            const user = getHighlightUserMatch(item, matchCategory, users);
            return (
              <div className="highlight-hit-row" key={item.uniqueKey}>
                <div className="event-highlight-marker">特别关注 {user?.remark || user?.userId || item.userId}</div>
                <div className="event-line">{renderEventLine(item, item.category, user)}</div>
              </div>
            );
          })
        ) : (
          <div className="highlight-empty">暂无命中消息</div>
        )}
      </div>
    </section>
  );
}
function getMysteryActivityLabel(category: EventCategory): string {
  if (category === 'entry') return '进场';
  if (category === 'interaction') return '互动';
  if (category === 'comment') return '评论/飘';
  if (category === 'gift') return '礼';
  return '未知';
}

function formatMysteryActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 19) || value;
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function getMysteryActivityMessage(activity: SessionStats['activeUsers'][number]['activities'][number]): string {
  if (activity.category === 'gift') {
    const giftName = String(activity.giftName || activity.message || '').trim();
    const giftCount = activity.giftCount || 1;
    return giftName ? `${giftName} x${giftCount}` : activity.message;
  }
  return activity.message;
}

function MysteryWindow({
  runtime,
  stats,
  error,
}: {
  runtime: RuntimeSnapshot;
  stats: SessionStats;
  error?: string;
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <main className="mystery-shell">
      <section className="mystery-card">
        <div className="mystery-head">
          <h1>神秘人</h1>
          <div className="mystery-status">{buildStatusText(runtime)}</div>
        </div>

        <div className="mystery-grid mystery-grid-single">
          <div className="mystery-box">
            <div className="mystery-box-title">活跃用户</div>
            <div className="mystery-list">
              {stats.activeUsers.length === 0 ? <div className="event-empty">暂无可展示用户</div> : null}
              {stats.activeUsers.map((item, index) => {
                const rowKey = `${item.name}|${item.userId ?? ''}|${item.userLink ?? ''}`;
                const expanded = expandedKeys.has(rowKey);
                const activities = [...(item.activities || [])].sort(compareEventsDesc);
                return (
                  <div className="mystery-row-wrap" key={rowKey}>
                    <div className="mystery-row">
                      <span className="mystery-index">{index + 1}</span>
                      <a
                        className="mystery-name event-user-link"
                        href={getMysteryUserProfileUrl(item) || '#'}
                        target="_blank"
                        rel="noreferrer"
                        title="打开用户主页"
                        onClick={async (event) => {
                          event.preventDefault();
                          await openMysteryUserProfile(item);
                        }}
                      >
                        {getMysteryUserDisplayName(item)}
                      </a>
                      <span className="mystery-total">{getMysteryUserSourceText(item)}</span>
                      <button
                        className="mystery-expand-button"
                        type="button"
                        title={expanded ? '收起动态' : '查看动态'}
                        onClick={() => toggleExpanded(rowKey)}
                      >
                        {expanded ? '-' : '+'}
                      </button>
                    </div>
                    {expanded ? (
                      <div className="mystery-activity-list">
                        {activities.length ? (
                          activities.map((activity) => (
                            <div className="mystery-activity-row" key={`${activity.createdAt}|${activity.category}|${activity.message}`}>
                              <span className="mystery-activity-time">{formatMysteryActivityTime(activity.createdAt)}</span>
                              <span className="mystery-activity-tag">{getMysteryActivityLabel(activity.category)}</span>
                              <span className="mystery-activity-message">{getMysteryActivityMessage(activity)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="mystery-activity-empty">暂无已获取动态</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}



function MysteryPopupApp() {
  const [runtime, setRuntime] = useState<RuntimeSnapshot>({ activeSession: null, room: null });
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [error, setError] = useState('');

  const refreshMystery = useStableEvent(async () => {
    const runtimeSnapshot = await api.getRuntimeSnapshot();
    const sessionId = runtimeSnapshot.activeSession?.id;
    const statsSnapshot = sessionId ? await api.getStats(sessionId) : EMPTY_STATS;
    startTransition(() => {
      setRuntime(runtimeSnapshot);
      setStats(statsSnapshot);
      setError('');
    });
  });

  useEffect(() => {
    void refreshMystery().catch((reason) => {
      setError(reason instanceof Error ? reason.message : '刷新神秘人数据失败');
    });

    const timer = window.setInterval(() => {
      void refreshMystery().catch((reason) => {
        setError(reason instanceof Error ? reason.message : '刷新神秘人数据失败');
      });
    }, 2000);

    const stream = new EventSource('/api/events/stream');
    let refreshTimer: number | null = null;
    const queueRefresh = () => {
      if (refreshTimer) {
        return;
      }
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshMystery().catch(() => undefined);
      }, 300);
    };
    stream.onmessage = (event) => {
      try {
        const data = parseStreamMessage(event.data);
        if (!data) {
          return;
        }
        if (data.type === 'session') {
          queueRefresh();
          return;
        }
        if (data.type !== 'events') {
          return;
        }
        const rows = Array.isArray(data.payload) ? (data.payload as LiveEvent[]) : [];
        if (rows.some((row) => row.category !== 'log' && hasMysteryIdentityForStats(row))) {
          queueRefresh();
        }
      } catch {
        queueRefresh();
      }
    };
    stream.onerror = () => undefined;

    return () => {
      window.clearInterval(timer);
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      stream.close();
    };
  }, []);

  return <MysteryWindow runtime={runtime} stats={stats} error={error} />;
}

export default function App() {
  const popupMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('popup') === 'mystery';
  if (popupMode) {
    return <MysteryPopupApp />;
  }
  const desktopWindowApi = typeof window !== 'undefined' ? window.desktopShell?.window : undefined;

  const [runtime, setRuntime] = useState<RuntimeSnapshot>({ activeSession: null, room: null });
  const [browserState, setBrowserState] = useState<BrowserState>({
    loginWindowOpen: false,
    loggedIn: false,
    chromiumInstall: {
      status: 'idle',
    },
  });
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [events, setEvents] = useState<EventBuckets>(EMPTY_EVENTS);
  const [highlightSnapshot, setHighlightSnapshot] = useState<HighlightUsersSnapshot>(EMPTY_HIGHLIGHT_USERS);
  const [inputUrl, setInputUrl] = useState(DEFAULT_URL);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [filterText, setFilterText] = useState(
    () => readStorage(STORAGE_KEYS.filters, { filterText: '' }).filterText,
  );
  const [matchMode, setMatchMode] = useState<MatchMode>(
    () => readStorage(STORAGE_KEYS.filters, { matchMode: 'any' }).matchMode as MatchMode,
  );
  const [focusMode, setFocusMode] = useState(
    () => readStorage(STORAGE_KEYS.filters, { focusMode: true }).focusMode,
  );
  const [clearedAt, setClearedAt] = useState<number>(0);
  const [collapsed, setCollapsed] = useState<CollapseState>(
    () => readStorage(STORAGE_KEYS.collapse, DEFAULT_COLLAPSE),
  );
  const [panelSizes, setPanelSizes] = useState<PanelSizeState>(
    () => readStorage(STORAGE_KEYS.panelSizes, DEFAULT_PANEL_SIZES),
  );
  const [panelSplits, setPanelSplits] = useState<PanelSplitState>(
    () => readStorage(STORAGE_KEYS.panelSplits, DEFAULT_PANEL_SPLITS),
  );
  const [windowWidth, setWindowWidth] = useState('');
  const [windowHeight, setWindowHeight] = useState('');
  const [windowSizeBusy, setWindowSizeBusy] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [alwaysOnTopBusy, setAlwaysOnTopBusy] = useState(false);
  const [versionLogOpen, setVersionLogOpen] = useState(false);
  const [highlightPanelOpen, setHighlightPanelOpen] = useState(false);
  const [highlightHitEvents, setHighlightHitEvents] = useState<LiveEvent[]>([]);
  const [lastSessionId, setLastSessionId] = useState<string | undefined>(undefined);
  const [themeId, setThemeId] = useState<ThemeId>(() => readTheme());
  const [messageFontSize, setMessageFontSize] = useState<MessageFontSize>(() => readMessageFontSize());
  const refreshTimerRef = useRef<number | null>(null);
  const statsRefreshTimerRef = useRef<number | null>(null);
  const lastStatsRefreshAtRef = useRef(0);
  const lastEventRefreshSessionIdRef = useRef<string | undefined>(undefined);
  const lastEventRefreshAtRef = useRef(0);
  const mysteryWindowRef = useRef<Window | null>(null);
  const incomingQueuesRef = useRef<EventBuckets>({
    comment: [],
    entry: [],
    interaction: [],
    gift: [],
    log: [],
  });
  const incomingTimersRef = useRef<Record<EventCategory, number | null>>({
    comment: null,
    entry: null,
    interaction: null,
    gift: null,
    log: null,
  });
  const uiFlushTimerRef = useRef<number | null>(null);
  const windowMovingRef = useRef(false);
  const windowMoveFlushTimerRef = useRef<number | null>(null);
  const deferredStreamRowsRef = useRef<LiveEvent[]>([]);
  const deferredStreamMessagesRef = useRef<string[]>([]);
  const deferredMysteryRefreshRef = useRef(false);
  const currentSessionIdRef = useRef<string | undefined>(undefined);
  const recentSkippedCommentsRef = useRef<DisplaySkipDiagnostic[]>([]);
  const frontendDiagnosticsRef = useRef<FrontendCommentDiagnostics>({
    ...EMPTY_FRONTEND_COMMENT_DIAGNOSTICS,
  });

  const activeSessionId = runtime.activeSession?.id;
  const sessionId = activeSessionId ?? lastSessionId ?? stats.sessionId;
  const keywords = useMemo(() => splitKeywords(filterText), [filterText]);
  const compiledHighlightUsers = useMemo(
    () => compileHighlightUsers(highlightSnapshot.users),
    [highlightSnapshot.users],
  );
  const highlightMatchedEvents = useMemo(() => {
    if (!compiledHighlightUsers.length) {
      return [];
    }
    const matchedRows = [...highlightSnapshot.matchedEvents, ...highlightHitEvents].filter((item) =>
      !isHighlightDisplayNoise(item) &&
      getHighlightUserMatch(item, item.category === 'gift' ? 'gift' : 'comment', compiledHighlightUsers),
    );
    return normalizeHighlightMatchedEvents(matchedRows);
  }, [compiledHighlightUsers, highlightHitEvents, highlightSnapshot.matchedEvents]);
  const statusText = useMemo(() => buildStatusText(runtime), [runtime]);

  useEffect(() => {
    if (activeSessionId) {
      setLastSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  const clearIncomingQueue = useStableEvent(() => {
    for (const category of Object.keys(incomingQueuesRef.current) as EventCategory[]) {
      incomingQueuesRef.current[category] = [];
    }
    for (const category of Object.keys(incomingTimersRef.current) as EventCategory[]) {
      const timerId = incomingTimersRef.current[category];
      if (timerId) {
        window.clearTimeout(timerId);
        incomingTimersRef.current[category] = null;
      }
    }
    if (uiFlushTimerRef.current) {
      window.clearTimeout(uiFlushTimerRef.current);
      uiFlushTimerRef.current = null;
    }
    if (windowMoveFlushTimerRef.current) {
      window.clearTimeout(windowMoveFlushTimerRef.current);
      windowMoveFlushTimerRef.current = null;
    }
    deferredStreamRowsRef.current = [];
    deferredStreamMessagesRef.current = [];
    deferredMysteryRefreshRef.current = false;
  });

  const resetCommentDiagnostics = useStableEvent(() => {
    frontendDiagnosticsRef.current = { ...EMPTY_FRONTEND_COMMENT_DIAGNOSTICS };
    recentSkippedCommentsRef.current = [];
  });

  const updateCommentDiagnosticsFromDisplay = useStableEvent((diagnostics: {
    categoryMismatch: number;
    noise: number;
    uniqueKeyDuplicate: number;
    duplicate: number;
    skipped?: DisplaySkipDiagnostic[];
  }) => {
    frontendDiagnosticsRef.current.displayCategoryMismatch += diagnostics.categoryMismatch;
    frontendDiagnosticsRef.current.displayNoise += diagnostics.noise;
    frontendDiagnosticsRef.current.displayUniqueKeyDuplicate += diagnostics.uniqueKeyDuplicate;
    frontendDiagnosticsRef.current.displayDuplicate += diagnostics.duplicate;
    if (diagnostics.skipped?.length) {
      recentSkippedCommentsRef.current = [...recentSkippedCommentsRef.current, ...diagnostics.skipped]
        .filter((item) => item.candidate.category === 'comment')
        .slice(-RECENT_SKIPPED_COMMENT_LIMIT);
    }
  });

  const isCategoryVisible = (category: EventCategory) => {
    if (category === 'entry' || category === 'interaction') {
      return collapsed.entryInteraction;
    }
    if (category === 'comment' || category === 'gift') {
      return collapsed.comment;
    }
    return true;
  };

  const flushIncomingQueues = useStableEvent(() => {
    uiFlushTimerRef.current = null;
    if (windowMovingRef.current) {
      if (windowMoveFlushTimerRef.current) {
        window.clearTimeout(windowMoveFlushTimerRef.current);
      }
      windowMoveFlushTimerRef.current = window.setTimeout(() => {
        windowMoveFlushTimerRef.current = null;
        scheduleIncomingFlush(true);
      }, WINDOW_MOVE_FLUSH_DELAY_MS);
      return;
    }
    const nextRows: Partial<Record<EventCategory, LiveEvent[]>> = {};
    for (const category of Object.keys(incomingQueuesRef.current) as EventCategory[]) {
      const rows = incomingQueuesRef.current[category]
        .splice(0, STREAM_BATCH_LIMITS[category])
        .filter((row) => !isLiveConnectCountdownNoise(row));
      if (rows.length) {
        nextRows[category] = rows;
        if (category === 'comment') {
          frontendDiagnosticsRef.current.commentFlushCount += 1;
          frontendDiagnosticsRef.current.commentRowsFlushed += rows.length;
          frontendDiagnosticsRef.current.lastCommentDisplayFlushAt = new Date().toISOString();
        }
      }
    }

    if (compiledHighlightUsers.length) {
      const hitRows = Object.values(nextRows)
        .flat()
        .filter(
          (item) =>
            !isHighlightDisplayNoise(item) &&
            getHighlightUserMatch(item, item.category === 'gift' ? 'gift' : 'comment', compiledHighlightUsers),
        );
      if (hitRows.length) {
        setHighlightHitEvents((current) => normalizeHighlightMatchedEvents([...current, ...hitRows]));
      }
    }

    if (Object.keys(nextRows).length) {
      startTransition(() => {
        setEvents((current) => {
          const next = { ...current };
          for (const [category, rows] of Object.entries(nextRows) as Array<[EventCategory, LiveEvent[]]>) {
            const result = appendDisplayItemsWithDiagnostics(current[category], rows, category);
            next[category] = result.items;
            if (category === 'comment') {
              updateCommentDiagnosticsFromDisplay(result.diagnostics);
            }
          }
          return next;
        });
      });
    }

    const hasBacklog = (Object.keys(incomingQueuesRef.current) as EventCategory[]).some(
      (category) => incomingQueuesRef.current[category].length > 0,
    );
    if (hasBacklog) {
      scheduleIncomingFlush(true);
    }
  });

  const scheduleIncomingFlush = useStableEvent((catchup = false) => {
    if (uiFlushTimerRef.current) {
      return;
    }
    const categories = Object.keys(incomingQueuesRef.current) as EventCategory[];
    const anyVisible = categories.some((category) => incomingQueuesRef.current[category].length && isCategoryVisible(category));
    const maxBacklog = Math.max(0, ...categories.map((category) => incomingQueuesRef.current[category].length));
    const delay = !anyVisible
      ? HIDDEN_CATEGORY_DRAIN_DELAY_MS
      : catchup || maxBacklog > 36
        ? 8
        : 16;
    uiFlushTimerRef.current = window.setTimeout(
      () => flushIncomingQueues(),
      delay,
    );
  });

  const enqueueStreamRows = useStableEvent((rows: LiveEvent[], queueStatsRefresh: () => void) => {
    let shouldRefreshMystery = false;
    for (const row of rows) {
      if (row.category === 'log') {
        continue;
      }
      if (clearedAt && new Date(row.createdAt).getTime() < clearedAt) {
        if (row.category === 'comment') {
          frontendDiagnosticsRef.current.skippedClearedAt += 1;
        }
        continue;
      }
      if (isLiveConnectCountdownNoise(row)) {
        frontendDiagnosticsRef.current.skippedNoise += 1;
        continue;
      }
      const queue = incomingQueuesRef.current[row.category];
      queue.push(row);
      if (row.category === 'comment') {
        frontendDiagnosticsRef.current.lastCommentEnqueuedAt = new Date().toISOString();
        frontendDiagnosticsRef.current.maxCommentQueueLength = Math.max(
          frontendDiagnosticsRef.current.maxCommentQueueLength,
          queue.length,
        );
      }
      const overflow = queue.length - STREAM_QUEUE_LIMITS[row.category];
      if (overflow > 0) {
        queue.splice(0, overflow);
        if (row.category === 'comment') {
          frontendDiagnosticsRef.current.queueOverflow += overflow;
        }
      }
      if (row.category === 'comment') {
        frontendDiagnosticsRef.current.lastCommentUniqueKey = row.uniqueKey;
        frontendDiagnosticsRef.current.lastCommentCreatedAt = row.createdAt;
      }
      if (
        !shouldRefreshMystery &&
        hasMysteryIdentityForStats(row)
      ) {
        shouldRefreshMystery = true;
      }
    }
    scheduleIncomingFlush(false);
    if (shouldRefreshMystery) {
      queueStatsRefresh();
    }
  });

  const flushDeferredStreamRows = useStableEvent((queueStatsRefresh: () => void) => {
    const messages = deferredStreamMessagesRef.current.splice(0);
    if (messages.length) {
      const rows: LiveEvent[] = [];
      for (const raw of messages) {
        const data = parseStreamMessage(raw);
        if (!data) {
          continue;
        }
        if (data.type === 'session') {
          const runtimePayload = data.payload as RuntimeSnapshot;
          const nextActiveSessionId = runtimePayload.activeSession?.id;
          const previousSessionId = currentSessionIdRef.current;
          if (nextActiveSessionId && nextActiveSessionId !== previousSessionId) {
            clearIncomingQueue();
            currentSessionIdRef.current = nextActiveSessionId;
            setClearedAt(0);
            setEvents(EMPTY_EVENTS);
            setHighlightHitEvents([]);
            setLastSessionId(nextActiveSessionId);
          }
          startTransition(() => {
            setRuntime(runtimePayload);
          });
          continue;
        }
        rows.push(...(data.type === 'events' ? (data.payload as LiveEvent[]) : [data.payload as LiveEvent]));
      }
      deferredStreamRowsRef.current.push(...rows);
    }
    const rows = deferredStreamRowsRef.current.splice(0);
    const shouldRefreshMystery = deferredMysteryRefreshRef.current;
    deferredMysteryRefreshRef.current = false;
    if (rows.length) {
      enqueueStreamRows(rows, queueStatsRefresh);
    } else {
      scheduleIncomingFlush(true);
    }
    if (shouldRefreshMystery) {
      queueStatsRefresh();
    }
  });

  const queueStatsRefreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribe = desktopWindowApi?.onMoveStateChange?.(({ moving }) => {
      windowMovingRef.current = moving;
      if (!moving) {
        if (queueStatsRefreshRef.current) {
          flushDeferredStreamRows(queueStatsRefreshRef.current);
        } else {
          scheduleIncomingFlush(true);
        }
      }
    });
    return () => {
      unsubscribe?.();
      if (windowMoveFlushTimerRef.current) {
        window.clearTimeout(windowMoveFlushTimerRef.current);
        windowMoveFlushTimerRef.current = null;
      }
    };
  }, [desktopWindowApi]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    document.body.dataset.theme = themeId;
    writeLocalStorageItem(STORAGE_KEYS.theme, themeId);
  }, [themeId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    document.body.dataset.messageFontSize = messageFontSize;
    writeLocalStorageItem(STORAGE_KEYS.messageFontSize, messageFontSize);
  }, [messageFontSize]);

  useEffect(() => {
    let cancelled = false;
    const loadHighlightUsers = async () => {
      try {
        const nextSnapshot = await api.getHighlightUsers(sessionId, {
          includeMatched: Boolean(sessionId),
        });
        if (!cancelled) {
          setHighlightSnapshot(nextSnapshot);
        }
      } catch (highlightError) {
        if (!cancelled) {
          setHighlightSnapshot((current) => ({
            ...current,
            updatedAt: new Date().toISOString(),
            error: highlightError instanceof Error ? highlightError.message : '读取特别关注失败',
          }));
        }
      }
    };

    void loadHighlightUsers();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    writeLocalStorageItem(
      STORAGE_KEYS.filters,
      JSON.stringify({ filterText, matchMode, focusMode }),
    );
  }, [filterText, matchMode, focusMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    writeLocalStorageItem(STORAGE_KEYS.collapse, JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    writeLocalStorageItem(STORAGE_KEYS.panelSizes, JSON.stringify(panelSizes));
  }, [panelSizes]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    writeLocalStorageItem(STORAGE_KEYS.panelSplits, JSON.stringify(panelSplits));
  }, [panelSplits]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditable = tagName === 'input' || tagName === 'textarea' || Boolean(target?.isContentEditable);
      if (!isEditable) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    if (!desktopWindowApi) {
      return;
    }

    void Promise.all([desktopWindowApi.getSize(), desktopWindowApi.getAlwaysOnTop()]).then(
      ([size, topmost]) => {
        if (size) {
          setWindowWidth(String(size.width));
          setWindowHeight(String(size.height));
        }
        setAlwaysOnTop(Boolean(topmost));
      },
    );
  }, [desktopWindowApi]);

  const loadDashboard = useStableEvent(async (options?: { includeEvents?: boolean }) => {
    const [runtimeSnapshot, browserSnapshot] = await Promise.all([
      api.getRuntimeSnapshot(),
      api.getBrowserState(),
    ]);
    const preferredSessionId = runtimeSnapshot.activeSession?.id;
    const retainedSessionId = preferredSessionId ?? lastSessionId ?? stats.sessionId;
    const shouldIncludeEvents = options?.includeEvents ?? true;

    const statsRes = retainedSessionId ? await api.getStats(retainedSessionId) : EMPTY_STATS;
    const targetSessionId = retainedSessionId;
    if (!targetSessionId) {
      lastEventRefreshSessionIdRef.current = undefined;
      lastEventRefreshAtRef.current = 0;
      clearIncomingQueue();
      startTransition(() => {
        setRuntime(runtimeSnapshot);
        setBrowserState(browserSnapshot);
        setStats(statsRes);
      });
      return;
    }

    const now = Date.now();
    const isNewEventRefreshSession = lastEventRefreshSessionIdRef.current !== targetSessionId;
    const shouldFetchEvents =
      shouldIncludeEvents &&
      Boolean(targetSessionId) &&
      (isNewEventRefreshSession || now - lastEventRefreshAtRef.current >= SESSION_EVENT_REFRESH_COOLDOWN_MS);
    if (!shouldFetchEvents) {
      startTransition(() => {
        setRuntime(runtimeSnapshot);
        setBrowserState(browserSnapshot);
        setStats(statsRes);
        if (preferredSessionId) {
          setLastSessionId(preferredSessionId);
        }
      });
      return;
    }
    lastEventRefreshSessionIdRef.current = targetSessionId;
    lastEventRefreshAtRef.current = now;

    const [comments, entries, interactions, gifts] = await Promise.all([
      api.getEvents('comment', targetSessionId, 1000),
      api.getEvents('entry', targetSessionId),
      api.getEvents('interaction', targetSessionId),
      api.getEvents('gift', targetSessionId),
    ]);
    frontendDiagnosticsRef.current.historyCommentBackfill += comments.items.length;

    const keepAfterClear = (items: LiveEvent[]) => {
      if (!clearedAt) {
        return items;
      }
      return items.filter((item) => new Date(item.createdAt).getTime() >= clearedAt);
    };

    const nextEvents: EventBuckets = {
      comment: normalizeDisplayItems(keepAfterClear(comments.items), 'comment'),
      entry: normalizeDisplayItems(keepAfterClear(entries.items), 'entry'),
      interaction: normalizeDisplayItems(keepAfterClear(interactions.items), 'interaction'),
      gift: normalizeDisplayItems(keepAfterClear(gifts.items), 'gift'),
      log: [],
    };
    const isSameSession = sessionId === targetSessionId;

    startTransition(() => {
      setRuntime(runtimeSnapshot);
      setBrowserState(browserSnapshot);
      setStats(statsRes);
      if (preferredSessionId) {
        setLastSessionId(preferredSessionId);
      }
      setEvents((current) =>
        isSameSession
          ? {
              comment: normalizeDisplayItems([...current.comment, ...nextEvents.comment], 'comment'),
              entry: normalizeDisplayItems([...current.entry, ...nextEvents.entry], 'entry'),
              interaction: normalizeDisplayItems([...current.interaction, ...nextEvents.interaction], 'interaction'),
              gift: normalizeDisplayItems([...current.gift, ...nextEvents.gift], 'gift'),
              log: [],
            }
          : nextEvents,
      );
    });
  });

  useEffect(() => {
    void loadDashboard({ includeEvents: false }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : '初始化失败');
    });

    const refreshInterval = browserState.chromiumInstall?.status === 'installing' ? 700 : 5000;
    const timer = window.setInterval(() => {
      void loadDashboard({ includeEvents: false }).catch(() => undefined);
    }, refreshInterval);

    return () => {
      window.clearInterval(timer);
    };
  }, [browserState.chromiumInstall?.status, activeSessionId]);

  useEffect(() => {
    const stream = new EventSource('/api/events/stream');
    const queueRefresh = (includeEvents = false) => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void loadDashboard({ includeEvents }).catch(() => undefined);
      }, 180);
    };
    const queueStatsRefresh = () => {
      const now = Date.now();
      const elapsed = now - lastStatsRefreshAtRef.current;
      const delay = Math.max(0, STATS_REFRESH_THROTTLE_MS - elapsed);
      if (statsRefreshTimerRef.current) {
        return;
      }

      statsRefreshTimerRef.current = window.setTimeout(() => {
        statsRefreshTimerRef.current = null;
        lastStatsRefreshAtRef.current = Date.now();
        void loadDashboard({ includeEvents: false }).catch(() => undefined);
      }, delay);
    };
    queueStatsRefreshRef.current = queueStatsRefresh;

    stream.onmessage = (event) => {
      frontendDiagnosticsRef.current.sseMessages += 1;
      if (windowMovingRef.current) {
        deferredStreamMessagesRef.current.push(event.data);
        if (deferredStreamMessagesRef.current.length > WINDOW_MOVE_DEFERRED_MESSAGE_LIMIT) {
          deferredStreamMessagesRef.current.splice(
            0,
            deferredStreamMessagesRef.current.length - WINDOW_MOVE_DEFERRED_MESSAGE_LIMIT,
          );
        }
        return;
      }
      const data = parseStreamMessage(event.data);
      if (!data) {
        return;
      }
      if (data.type === 'session') {
        const runtimePayload = data.payload as RuntimeSnapshot;
        const nextActiveSessionId = runtimePayload.activeSession?.id;
        const previousSessionId = currentSessionIdRef.current;
        if (nextActiveSessionId && nextActiveSessionId !== previousSessionId) {
          clearIncomingQueue();
          resetCommentDiagnostics();
          lastEventRefreshSessionIdRef.current = undefined;
          lastEventRefreshAtRef.current = 0;
          currentSessionIdRef.current = nextActiveSessionId;
          setClearedAt(0);
          setEvents(EMPTY_EVENTS);
          setHighlightHitEvents([]);
          setLastSessionId(nextActiveSessionId);
        }
        startTransition(() => {
          setRuntime(runtimePayload);
        });
        queueRefresh(nextActiveSessionId ? nextActiveSessionId !== previousSessionId : false);
        return;
      }

      const rows = data.type === 'events' ? (data.payload as LiveEvent[]) : [data.payload as LiveEvent];
      const sseCommentRows = rows.filter((row) => row.category === 'comment').length;
      frontendDiagnosticsRef.current.sseCommentRows += sseCommentRows;
      if (sseCommentRows > 0) {
        frontendDiagnosticsRef.current.lastSseCommentReceivedAt = new Date().toISOString();
      }
      if (windowMovingRef.current) {
        deferredStreamRowsRef.current.push(...rows);
        if (deferredStreamRowsRef.current.length > WINDOW_MOVE_DEFERRED_STREAM_LIMIT) {
          deferredStreamRowsRef.current.splice(0, deferredStreamRowsRef.current.length - WINDOW_MOVE_DEFERRED_STREAM_LIMIT);
        }
        return;
      }
      enqueueStreamRows(rows, queueStatsRefresh);
    };

    stream.onerror = () => {
      setError((current) => current || '实时连接中断，系统会继续轮询刷新。');
      void loadDashboard({ includeEvents: true }).catch(() => undefined);
    };

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (statsRefreshTimerRef.current) {
        window.clearTimeout(statsRefreshTimerRef.current);
        statsRefreshTimerRef.current = null;
      }
      queueStatsRefreshRef.current = null;
      clearIncomingQueue();
      stream.close();
    };
  }, []);

  const handleStart = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await api.startSession(inputUrl);
      clearIncomingQueue();
      resetCommentDiagnostics();
      lastEventRefreshSessionIdRef.current = undefined;
      lastEventRefreshAtRef.current = 0;
      setClearedAt(0);
      setEvents(EMPTY_EVENTS);
      setHighlightHitEvents([]);
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '启动失败');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await api.stopSession();
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '停止失败');
    } finally {
      setBusy(false);
    }
  };

  const handleLoginWindow = async (): Promise<void> => {
    setLoginBusy(true);
    setError('');
    try {
      if (browserState.loginWindowOpen) {
        await api.closeLoginWindow();
      } else {
        await api.openLoginWindow(inputUrl || DEFAULT_URL);
      }
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录窗口操作失败');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleClear = (): void => {
    const now = Date.now();
    clearIncomingQueue();
    resetCommentDiagnostics();
    setClearedAt(now);
    setEvents(EMPTY_EVENTS);
    setError('');
  };

  const handleCopyDiagnostics = async (): Promise<void> => {
    const commentRows = Array.from(document.querySelectorAll('.event-panel-comment .event-row'));
    const currentSessionForDiagnostics = sessionId;
    const [serverCommentFlow, captureIntegrity, persistedComments, persistedGifts] = await Promise.all([
      api.getCommentDiagnostics().catch((reason) => ({
        error: reason instanceof Error ? reason.message : '读取评论链路诊断失败',
      })),
      api.getCaptureIntegrityDiagnostics().catch((reason) => ({
        error: reason instanceof Error ? reason.message : '读取采集完整性诊断失败',
      })),
      currentSessionForDiagnostics
        ? api.getEventDiagnostics(currentSessionForDiagnostics, 'comment', 1000).catch((reason) => ({
            error: reason instanceof Error ? reason.message : '读取服务端评论事件失败',
            items: [] as LiveEvent[],
          }))
        : Promise.resolve({ items: [] as LiveEvent[] }),
      currentSessionForDiagnostics
        ? api.getEventDiagnostics(currentSessionForDiagnostics, 'gift', 1000).catch((reason) => ({
            error: reason instanceof Error ? reason.message : '读取服务端礼物事件失败',
            items: [] as LiveEvent[],
          }))
        : Promise.resolve({ items: [] as LiveEvent[] }),
    ]);
    const incomingQueueLengths = Object.fromEntries(
      (Object.keys(incomingQueuesRef.current) as EventCategory[]).map((category) => [
        category,
        incomingQueuesRef.current[category].length,
      ]),
    );
    const visibleHighlightMatches = [...events.comment, ...events.gift]
      .map((item) =>
        getHighlightMatchDetails(
          item,
          item.category === 'gift' ? 'gift' : 'comment',
          compiledHighlightUsers,
        ),
      )
      .filter(Boolean);
    const persistedHighlightMatches = [...persistedComments.items, ...persistedGifts.items]
      .map((item) =>
        getHighlightMatchDetails(
          item,
          item.category === 'gift' ? 'gift' : 'comment',
          compiledHighlightUsers,
        ),
      )
      .filter(Boolean);
    const diagnostics = {
      runtime,
      stats,
      frontend: frontendDiagnosticsRef.current,
      commentItems: {
        count: events.comment.length,
        first: events.comment[0] ?? null,
        last: events.comment[events.comment.length - 1] ?? null,
        recentComments: events.comment.slice(-RECENT_DIAGNOSTIC_COMMENT_LIMIT).map(summarizeDiagnosticEvent),
        recentSkippedComments: recentSkippedCommentsRef.current,
      },
      giftItems: {
        count: events.gift.length,
        first: events.gift[0] ?? null,
        last: events.gift[events.gift.length - 1] ?? null,
        recentGifts: events.gift.slice(-RECENT_DIAGNOSTIC_COMMENT_LIMIT).map(summarizeDiagnosticEvent),
      },
      highlightMatches: {
        visible: visibleHighlightMatches,
        persisted: persistedHighlightMatches,
        gift: persistedHighlightMatches.filter((item) => item?.category === 'gift'),
      },
      server: {
        commentFlow: serverCommentFlow,
        captureIntegrity,
        persistedComments: {
          count: persistedComments.items.length,
          first: persistedComments.items[persistedComments.items.length - 1] ?? null,
          last: persistedComments.items[0] ?? null,
          recent: persistedComments.items.slice(0, RECENT_DIAGNOSTIC_COMMENT_LIMIT).map(summarizeDiagnosticEvent),
          error: 'error' in persistedComments ? persistedComments.error : undefined,
        },
        persistedGifts: {
          count: persistedGifts.items.length,
          first: persistedGifts.items[persistedGifts.items.length - 1] ?? null,
          last: persistedGifts.items[0] ?? null,
          recent: persistedGifts.items.slice(0, RECENT_DIAGNOSTIC_COMMENT_LIMIT).map(summarizeDiagnosticEvent),
          error: 'error' in persistedGifts ? persistedGifts.error : undefined,
        },
      },
      duplicateRules: {
        duplicateWindowMs: COMMENT_DUPLICATE_WINDOW_MS,
        nonCommentDuplicateWindowMs: NON_COMMENT_DUPLICATE_WINDOW_MS,
        recentCommentDuplicateScanLimit: RECENT_COMMENT_DUPLICATE_SCAN_LIMIT,
        recentSkippedCommentLimit: RECENT_SKIPPED_COMMENT_LIMIT,
      },
      displayLimits: EVENT_LIMITS,
      displayWindow: {
        commentStatsMinusDisplay: Math.max(0, stats.comments - events.comment.length),
        commentSseMinusDisplay: Math.max(0, frontendDiagnosticsRef.current.sseCommentRows - events.comment.length),
        commentDisplayLimitReached: events.comment.length >= EVENT_LIMITS.comment,
      },
      ui: {
        commentCollapsed: !collapsed.comment,
        focusMode,
        filterText,
        matchMode,
        incomingQueueLengths,
      },
      dom: {
        rows: commentRows.length,
        lastText: commentRows[commentRows.length - 1]?.textContent ?? '',
      },
      generatedAt: new Date().toISOString(),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '复制诊断失败');
    }
  };

  const toggleCollapse = (key: keyof CollapseState) => {
    setCollapsed((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const setPanelSize = (key: keyof PanelSizeState, nextSize: number) => {
    setPanelSizes((current) => ({
      ...current,
      [key]: nextSize,
    }));
  };

  const setPanelSplit = (key: keyof PanelSplitState, nextRatio: number) => {
    setPanelSplits((current) => ({
      ...current,
      [key]: clampSplitRatio(nextRatio),
    }));
  };

  const openMysteryWindow = () => {
    const existingWindow = mysteryWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
      return;
    }
    const popupUrl = `${window.location.origin}/?popup=mystery`;
    mysteryWindowRef.current = window.open(
      popupUrl,
      'douyin-mystery-window',
      'width=760,height=920,resizable=yes,scrollbars=yes',
    );
  };

  const handleToggleAlwaysOnTop = async (): Promise<void> => {
    if (!desktopWindowApi) {
      return;
    }

    setAlwaysOnTopBusy(true);
    setError('');
    try {
      const nextValue = await desktopWindowApi.setAlwaysOnTop(!alwaysOnTop);
      setAlwaysOnTop(Boolean(nextValue));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '设置窗口置顶失败');
    } finally {
      setAlwaysOnTopBusy(false);
    }
  };


  const chromiumInstall = browserState.chromiumInstall;
  const isInstallingChromium = chromiumInstall?.status === 'installing';
  const chromiumProgress = Math.max(0, Math.min(100, chromiumInstall?.progressPercent ?? 0));
  const chromiumInstallText =
    chromiumInstall?.message ||
    (isInstallingChromium ? '首次启动，正在安装 Chromium' : chromiumInstall?.error || '');

  return (
    <main className={`tool-shell ${runtime.activeSession ? 'is-capturing' : ''}`.trim()}>
      <section className="toolbar">
        <div className="toolbar-heading-row">
          <div className="toolbar-heading">
            <span>糖三角</span>
            <strong className="toolbar-version">{VERSION_LOGS[0].version}</strong>
          </div>
          <div className="toolbar-heading-actions">
            <label className="font-size-picker">
              <span>字号</span>
              <select value={messageFontSize} onChange={(event) => setMessageFontSize(event.target.value as MessageFontSize)}>
                {FONT_SIZE_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="theme-picker">
              <span>主题</span>
              <select value={themeId} onChange={(event) => setThemeId(event.target.value as ThemeId)}>
                {THEME_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="highlight-popover-wrap">
              <button
                className={`version-log-toggle highlight-toggle ${highlightPanelOpen ? 'is-open' : ''}`.trim()}
                type="button"
                onClick={() => setHighlightPanelOpen((current) => !current)}
              >
                特别关注 {highlightSnapshot.users.length}
              </button>
              {highlightPanelOpen ? <HighlightUsersBlock snapshot={highlightSnapshot} matchedEvents={highlightMatchedEvents} highlightUsers={compiledHighlightUsers} compact /> : null}
            </div>
            <button className="version-log-toggle" type="button" onClick={() => setVersionLogOpen((current) => !current)}>
              {versionLogOpen ? '收起版本日志' : '展开版本日志'}
            </button>
          </div>
        </div>

        {versionLogOpen ? (
          <div className="version-log-panel">
            {VERSION_LOGS.map((log) => (
              <div className="version-log-entry" key={log.version}>
                <div className="version-log-title">
                  <strong>{log.version}</strong>
                  <span>{log.date}</span>
                </div>
                <ul>
                  {log.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        <div className="toolbar-input-row toolbar-login-url-row">
          <span
            className={`login-chip ${
              browserState.loggedIn ? 'is-open' : browserState.loginWindowOpen ? 'is-open' : 'is-idle'
            }`}
          >
            {browserState.loggedIn
              ? `已登录：${browserState.profileDisplayName || '当前抖音账号'}`
              : browserState.loginWindowOpen
                ? '登录窗口已打开'
                : '未登录'}
          </span>
          <input
            className="link-input"
            value={inputUrl}
            onChange={(event) => setInputUrl(event.target.value)}
            placeholder="请输入抖音直播间链接"
          />
        </div>

        <div className="toolbar-status">{statusText}</div>

        {chromiumInstall?.status === 'installing' ? (
          <div className="toolbar-install">
            <div className="toolbar-install-header">
              <span className="toolbar-install-title">首次安装 Chromium</span>
              <span className="toolbar-install-percent">{chromiumProgress}%</span>
            </div>
            <div className="toolbar-install-track">
              <div className="toolbar-install-fill" style={{ width: `${chromiumProgress}%` }} />
            </div>
            <div className="toolbar-install-text">
              {chromiumInstallText}
              {chromiumInstall?.totalLabel ? ` · ${chromiumInstall.totalLabel}` : ''}
            </div>
          </div>
        ) : null}

        <div className="toolbar-button-row">
          <button
            className="toolbar-btn toolbar-btn-primary"
            onClick={handleStart}
            disabled={busy || Boolean(runtime.activeSession) || !browserState.loggedIn}
          >
            {busy && !runtime.activeSession ? '正在启动...' : '开始采集'}
          </button>
          <button className="toolbar-btn" onClick={handleStop} disabled={busy || !runtime.activeSession}>
            停止采集
          </button>
          <button
            className={`toolbar-btn ${browserState.loginWindowOpen ? 'toolbar-btn-active' : ''}`}
            onClick={handleLoginWindow}
            disabled={loginBusy || busy || Boolean(runtime.activeSession)}
          >
            {loginBusy ? '处理中...' : browserState.loginWindowOpen ? '关闭登录窗口' : '登录抖音'}
          </button>
          <button className="toolbar-btn" onClick={handleClear}>
            清空记录
          </button>
          <a
            className={`toolbar-btn ${sessionId ? '' : 'toolbar-btn-disabled'}`.trim()}
            href={api.getExportUrl(sessionId)}
            download
            aria-disabled={!sessionId}
            onClick={(event) => {
              if (!sessionId) {
                event.preventDefault();
              }
            }}
          >
            导出 Excel
          </a>
          <button className="toolbar-btn" onClick={openMysteryWindow}>
            神秘人
          </button>
          <button className="toolbar-btn" onClick={() => void handleCopyDiagnostics()}>
            复制诊断
          </button>
          {desktopWindowApi ? (
            <button
              className={`toolbar-btn ${alwaysOnTop ? 'toolbar-btn-active' : ''}`.trim()}
              onClick={() => void handleToggleAlwaysOnTop()}
              disabled={alwaysOnTopBusy}
            >
              {alwaysOnTopBusy ? '处理中...' : alwaysOnTop ? '取消置顶' : '窗口置顶'}
            </button>
          ) : null}
        </div>

        <div className="toolbar-filter-row">
          <input
            className="filter-input"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="输入关键词（空格 / 逗号分隔）"
          />
          <button
            className={`toolbar-btn toolbar-btn-toggle ${matchMode === 'any' ? 'is-active' : ''}`}
            onClick={() => setMatchMode((current) => (current === 'any' ? 'all' : 'any'))}
          >
            {matchMode === 'any' ? '任意命中' : '全部命中'}
          </button>
          <button
            className={`toolbar-btn toolbar-btn-toggle ${focusMode ? 'is-active' : ''}`}
            onClick={() => setFocusMode((current) => !current)}
          >
            高亮聚焦
          </button>
        </div>
{error ? <div className="toolbar-error">{error}</div> : null}
      </section>

      <DualEventBlock
        sessionId={sessionId}
        collapsed={collapsed.entryInteraction}
        savedHeight={panelSizes.entryInteraction}
        heightMin={140}
        heightMax={560}
        onToggle={() => toggleCollapse('entryInteraction')}
        onHeightCommit={(nextSize) => setPanelSize('entryInteraction', nextSize)}
        blockTitle="用户进场 / 用户互动"
        leftCategory="entry"
        leftTitle="用户进场"
        leftItems={events.entry}
        rightCategory="interaction"
        rightTitle="用户互动"
        rightItems={events.interaction}
        keywords={keywords}
        matchMode={matchMode}
        focusMode={focusMode}
        highlightUsers={compiledHighlightUsers}
        messageFontSize={messageFontSize}
      />

      <DualEventBlock
        sessionId={sessionId}
        collapsed={collapsed.comment}
        savedHeight={Math.max(panelSizes.comment, panelSizes.gift)}
        savedSplitRatio={panelSplits.commentGift}
        heightMin={160}
        heightMax={920}
        onToggle={() => toggleCollapse('comment')}
        onHeightCommit={(nextSize) => {
          setPanelSize('comment', nextSize);
          setPanelSize('gift', nextSize);
        }}
        onSplitCommit={(nextRatio) => setPanelSplit('commentGift', nextRatio)}
        blockTitle="直播间评论 / 用户送礼"
        leftCategory="comment"
        leftTitle="直播间评论"
        leftItems={events.comment}
        rightCategory="gift"
        rightTitle="用户送礼"
        rightItems={events.gift}
        keywords={keywords}
        matchMode={matchMode}
        focusMode={focusMode}
        highlightUsers={compiledHighlightUsers}
        messageFontSize={messageFontSize}
      />

    </main>
  );
}
