import assert from 'node:assert/strict';
import path from 'node:path';
import {
  AUTO_EXPORT_DOCUMENTS_SUBDIR,
  buildAutoExportFileName,
  resolveAutoExportOutputPath,
  sanitizeAutoExportFileNamePart,
} from '../src/capture-service.ts';

const illegalFileNameChars = /[<>:"/\\|?*\u0000-\u001F]/u;
const pad = (part) => String(part).padStart(2, '0');
const localStamp = (value) => {
  const date = new Date(value);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
};

const session = {
  id: 'session:bad/name*id?',
  url: 'https://live.douyin.com/123456',
  status: 'stopped',
  roomId: 'room:bad/name*id?',
  roomTitle: '  糖三角 <直播>  ',
  hostName: '主播: A/B* C?',
  startedAt: '2026-05-29T12:34:56.789Z',
};

assert.equal(sanitizeAutoExportFileNamePart(' A<>:"/\\|?*\u0001 B '), 'A B');
assert.equal(sanitizeAutoExportFileNamePart('   '), '未命名');
assert.equal(AUTO_EXPORT_DOCUMENTS_SUBDIR, path.join('糖三角', '自动导出'));

const fileName = buildAutoExportFileName(session);
assert.match(fileName, new RegExp(`^糖三角-${localStamp(session.startedAt)}-`, 'u'));
assert.equal(path.extname(fileName), '.xlsx');
assert.equal(illegalFileNameChars.test(fileName), false, fileName);

const roots = {
  documentsDir: path.resolve('C:/Users/example/Documents'),
  desktopDir: path.resolve('C:/Users/example/Desktop'),
};
const manualPath = resolveAutoExportOutputPath(session, 'manual', roots);
const offlinePath = resolveAutoExportOutputPath(session, 'offline', roots);

assert.equal(path.dirname(manualPath), roots.desktopDir);
assert.equal(path.basename(manualPath), fileName);
assert.equal(path.dirname(offlinePath), path.join(roots.documentsDir, AUTO_EXPORT_DOCUMENTS_SUBDIR));
assert.equal(path.basename(offlinePath), fileName);

console.log('regression-auto-save-session ok');
