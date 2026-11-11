import fs from 'node:fs';
import path from 'node:path';
import { fetchSlides } from './hzcu.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Windows 文件名不能含这些字符 */
export function safeName(name, fallback = 'course') {
  const s = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return s || fallback;
}

export function dayStamp(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function timeStamp(ms) {
  const d = new Date(ms || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function download(url, dest) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { Referer: 'https://classroom.hzcu.edu.cn/' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 512) throw new Error('图片过小');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return true;
    } catch (e) {
      if (attempt === 1) throw e;
      await sleep(800);
    }
  }
  return false;
}

/**
 * 把一场课里还没下载的幻灯片补齐
 * @returns {Promise<{total:number, added:number}>}
 */
export async function syncSession({ browser, store, cfg, log, session }) {
  const { slides, total } = await fetchSlides(browser, {
    courseId: session.course,
    subId: session.sub,
    perPage: cfg.perPage,
  });

  const courseDir = safeName(session.title);
  const sessionDir = `${dayStamp((session.start || 0) * 1000)}_${session.sub}`;
  const baseDir = path.join(cfg.outDir, courseDir, sessionDir);

  let added = 0;
  let index = store.session(session.sub)?.count || 0;

  for (const slide of slides) {
    if (store.has(slide.url)) continue;
    index += 1;
    const file = path.join(baseDir, `${String(index).padStart(4, '0')}_${timeStamp(slide.created)}.jpg`);
    try {
      if (await download(slide.url, file)) {
        store.mark(slide.url, path.relative(cfg.outDir, file));
        added += 1;
      }
    } catch (e) {
      index -= 1;
      log?.warn(`下载失败 ${slide.url}: ${e.message}`);
    }
  }

  store.setSession(session.sub, {
    title: session.title,
    course: session.course,
    date: dayStamp((session.start || 0) * 1000),
    count: index,
    sweptAt: Date.now(),
  });
  if (added) store.save();

  return { total: total || slides.length, added };
}
