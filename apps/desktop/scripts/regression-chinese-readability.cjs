const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const checks = [
  {
    file: 'apps/desktop/package.json',
    required: ['糖三角'],
  },
  {
    file: 'apps/desktop/scripts/finalize-installer.cjs',
    required: ['安装包'],
  },
  {
    file: 'apps/server/src/exporter.ts',
    required: ['全量统计汇总', '当前保留明细说明', '评论', '礼物', '主页链接'],
  },
  {
    file: 'apps/web/src/App.tsx',
    required: ['统计口径改为尽量代表全量直播历史', 'Excel 导出增加全量统计汇总'],
  },
  {
    file: 'docs/testing-sop-enhanced-2026-06-08.md',
    required: ['版本号按打包日期约定', '全量直播历史'],
  },
];

for (const check of checks) {
  const filePath = path.join(workspaceRoot, check.file);
  const source = fs.readFileSync(filePath, 'utf8');
  assert.doesNotMatch(source, /\uFFFD/u, `${check.file} must not contain replacement characters`);
  assert.doesNotMatch(source, /绯栦笁瑙|瀹夎|鏃ュ織|鐢ㄦ埛|鍘嬪姏/u, `${check.file} contains known mojibake text`);
  for (const text of check.required) {
    assert.ok(source.includes(text), `${check.file} must contain readable Chinese text: ${text}`);
  }
}

console.log('Chinese readability regression checks passed');
