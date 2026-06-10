import ExcelJS from 'exceljs';
import type { LiveEvent, SessionRecord, SessionStats } from './types.js';

function formatLocalTimestamp(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
function autoSizeColumns(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((column) => {
    if (!column) {
      return;
    }
    let maxLength = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const length = String(cell.value ?? '').length;
      maxLength = Math.max(maxLength, Math.min(length + 2, 48));
    });
    column.width = maxLength;
  });
}

function addEventSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  rows: LiveEvent[],
  mapper: (event: LiveEvent) => Array<string | number>,
  headers: string[],
): void {
  const sheet = workbook.addWorksheet(title);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const event of rows) {
    sheet.addRow(mapper(event));
  }
  autoSizeColumns(sheet);
}

function addSummarySheet(workbook: ExcelJS.Workbook, session: SessionRecord, stats: SessionStats, retainedEventCount: number): void {
  const summary = workbook.addWorksheet('全量统计汇总');
  summary.addRows([
    ['统计口径', '尽量代表全量直播历史'],
    ['说明', '本页统计来自会话级累计汇总；即使旧明细因保留策略被裁剪，统计仍保留新版本接收后的累计值。'],
    ['会话 ID', session.id],
    ['直播地址', session.url],
    ['房间号', session.roomId ?? ''],
    ['直播标题', session.roomTitle ?? ''],
    ['主播', session.hostName ?? ''],
    ['状态', session.status],
    ['开始时间', formatLocalTimestamp(session.startedAt)],
    ['结束时间', formatLocalTimestamp(session.endedAt)],
    ['最后心跳', formatLocalTimestamp(session.lastHeartbeatAt)],
    ['评论数', stats.comments],
    ['进场数', stats.entries],
    ['互动数', stats.interactions],
    ['礼物事件', stats.gifts],
    ['礼物件数', stats.giftUnits],
    ['唯一用户', stats.uniqueUsers],
    ['日志数', stats.logs],
    ['当前导出明细行数', retainedEventCount],
  ]);
  summary.getRow(1).font = { bold: true };
  autoSizeColumns(summary);

  const gifts = workbook.addWorksheet('全量礼物排行');
  gifts.addRow(['礼物', '累计数量']);
  gifts.getRow(1).font = { bold: true };
  for (const gift of stats.topGifts) {
    gifts.addRow([gift.name, gift.total]);
  }
  autoSizeColumns(gifts);
}

function addRetainedDetailNoteSheet(workbook: ExcelJS.Workbook, retainedEventCount: number): void {
  const note = workbook.addWorksheet('当前保留明细说明');
  note.addRows([
    ['导出说明'],
    [`明细 sheet 只包含当前保留的原始事件，共 ${retainedEventCount} 行；全量历史请以“全量统计汇总”sheet 为准。`],
    ['原因', '为了控制长时间大直播间的本地数据库和导出内存，原始事件明细仍会按保留策略裁剪。'],
  ]);
  note.getRow(1).font = { bold: true };
  autoSizeColumns(note);
}

export async function buildWorkbookBuffer(
  session: SessionRecord,
  stats: SessionStats,
  events: LiveEvent[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '糖三角';
  workbook.created = new Date();

  addSummarySheet(workbook, session, stats, events.length);
  addRetainedDetailNoteSheet(workbook, events.length);

  const eventsByCategory = {
    comment: events.filter((event) => event.category === 'comment'),
    entry: events.filter((event) => event.category === 'entry'),
    interaction: events.filter((event) => event.category === 'interaction'),
    gift: events.filter((event) => event.category === 'gift'),
    log: events.filter((event) => event.category === 'log'),
  };

  addEventSheet(
    workbook,
    '评论',
    eventsByCategory.comment,
    (event) => [formatLocalTimestamp(event.createdAt), event.userName ?? '', event.message, event.userId ?? '', event.userLink ?? ''],
    ['时间', '用户', '内容', '用户ID', '主页链接'],
  );

  addEventSheet(
    workbook,
    '进场',
    eventsByCategory.entry,
    (event) => [formatLocalTimestamp(event.createdAt), event.userName ?? '', event.message, event.userId ?? '', event.userLink ?? ''],
    ['时间', '用户', '内容', '用户ID', '主页链接'],
  );

  addEventSheet(
    workbook,
    '互动',
    eventsByCategory.interaction,
    (event) => [formatLocalTimestamp(event.createdAt), event.userName ?? '', event.message, event.userId ?? '', event.userLink ?? ''],
    ['时间', '用户', '内容', '用户ID', '主页链接'],
  );

  addEventSheet(
    workbook,
    '礼物',
    eventsByCategory.gift,
    (event) => [
      formatLocalTimestamp(event.createdAt),
      event.userName ?? '',
      event.giftName ?? '',
      event.giftCount ?? 1,
      event.message,
      event.userId ?? '',
      event.userLink ?? '',
    ],
    ['时间', '用户', '礼物', '数量', '原始内容', '用户ID', '主页链接'],
  );

  addEventSheet(
    workbook,
    '日志',
    eventsByCategory.log,
    (event) => [formatLocalTimestamp(event.createdAt), event.message],
    ['时间', '日志'],
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
