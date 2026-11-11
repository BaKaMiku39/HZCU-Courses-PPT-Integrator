import fs from 'node:fs';
import path from 'node:path';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PAGE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 15px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f6f8; color: #1f2328; }
  header { max-width: 1100px; margin: 0 auto 20px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .meta { color: #667085; font-size: 13px; }
  .grid { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; }
  figure { margin: 0; background: #fff; border: 1px solid #e4e7ec; border-radius: 10px; overflow: hidden; }
  figure img { display: block; width: 100%; height: auto; }
  figcaption { padding: 6px 10px; font-size: 12px; color: #667085; border-top: 1px solid #eef0f3; display: flex; justify-content: space-between; }
  a { color: #0b5fff; text-decoration: none; }
  .list { max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid #e4e7ec; border-radius: 10px; overflow: hidden; }
  .row { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #eef0f3; }
  .row:last-child { border-bottom: 0; }
  @media print {
    body { background: #fff; padding: 0; }
    header { margin-bottom: 8px; }
    .grid { display: block; }
    figure { border: 0; border-radius: 0; page-break-after: always; }
    figcaption { border: 0; }
  }
`;

/**
 * 为已有图片目录生成可打印的索引页（浏览器里 Ctrl+P 即可存成 PDF）
 * @returns {Promise<{sessions:number, slides:number}>}
 */
export function buildIndex(outDir, log) {
  if (!fs.existsSync(outDir)) throw new Error(`输出目录不存在: ${outDir}`);

  const courses = fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();

  let sessionCount = 0;
  let slideCount = 0;
  const rows = [];

  for (const course of courses) {
    const courseDir = path.join(outDir, course);
    const sessions = fs
      .readdirSync(courseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const session of sessions) {
      const dir = path.join(courseDir, session);
      const files = fs
        .readdirSync(dir)
        .filter((f) => /\.(jpe?g|png)$/i.test(f))
        .sort();
      if (!files.length) continue;

      sessionCount += 1;
      slideCount += files.length;

      const dateMatch = session.match(/^(\d{4}-\d{2}-\d{2})_(\d+)$/);
      const date = dateMatch ? dateMatch[1] : session;
      const subId = dateMatch ? dateMatch[2] : '';

      const figures = files
        .map((f, i) => {
          const time = f.replace(/^\d+_/, '').replace(/\.\w+$/, '').replace(/^(\d{2})(\d{2})(\d{2})$/, '$1:$2:$3');
          return `    <figure>\n      <img loading="lazy" src="${encodeURIComponent(f)}" alt="${esc(f)}">\n      <figcaption><span>第 ${i + 1} 页</span><span>${esc(time)}</span></figcaption>\n    </figure>`;
        })
        .join('\n');

      const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(course)} ${esc(date)} · 课堂 PPT</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header>
  <h1>${esc(course)} · ${esc(date)}</h1>
  <p class="meta">共 ${files.length} 页${subId ? ` · 场次 ${esc(subId)}` : ''} · <a href="../../index.html">返回总目录</a></p>
</header>
<main class="grid">
${figures}
</main>
</body>
</html>
`;
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      rows.push(
        `<div class="row"><a href="${encodeURI(course)}/${encodeURI(session)}/index.html">${esc(course)} · ${esc(date)}</a><span class="meta">${files.length} 页</span></div>`,
      );
    }
  }

  const top = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>课堂 PPT 目录</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header>
  <h1>课堂 PPT 目录</h1>
  <p class="meta">${courses.length} 门课 · ${sessionCount} 个场次 · ${slideCount} 页</p>
</header>
<main class="list">
${rows.join('\n') || '<div class="row">还没有抓取到任何幻灯片</div>'}
</main>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, 'index.html'), top);
  log?.info(`索引已生成：${path.join(outDir, 'index.html')}（${sessionCount} 场 / ${slideCount} 页）`);
  return { sessions: sessionCount, slides: slideCount };
}
