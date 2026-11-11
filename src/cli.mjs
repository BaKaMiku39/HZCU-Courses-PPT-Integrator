#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { Browser, findChrome, launchDetached, sleep } from './browser.mjs';
import { fetchSessions, isLoggedOut, AuthLostError } from './hzcu.mjs';
import { Store } from './store.mjs';
import { Logger } from './logger.mjs';
import { notify } from './notify.mjs';
import { syncSession, dayStamp } from './collector.mjs';
import { buildIndex } from './indexer.mjs';

const USAGE = `
智云课堂 PPT 自动抓取

  node bin/zhiyun-ppt.mjs                 常驻轮询（到 endHour 退出）
  node bin/zhiyun-ppt.mjs --once          只跑一轮（正在上的课 + 近期回补）
  node bin/zhiyun-ppt.mjs --login         打开窗口登录（会话过期时用）
  node bin/zhiyun-ppt.mjs --doctor        体检：登录态 / 课程数 / 今天的课
  node bin/zhiyun-ppt.mjs --backfill 7    回补最近 7 天的全部场次
  node bin/zhiyun-ppt.mjs --index         生成可打印的索引页（浏览器可另存 PDF）
  node bin/zhiyun-ppt.mjs --help
`;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f, dflt) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const cfg = loadConfig();
const log = new Logger(cfg.logDir);
const store = new Store(cfg.statePath);

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function withBrowser(fn) {
  const chromePath = findChrome(cfg.chromePath);
  const port = await freePort();
  const browser = await Browser.launch({
    chromePath,
    profileDir: cfg.profileDir,
    hosts: cfg.hosts,
    headless: cfg.headless,
    port,
  });
  try {
    await browser.open(cfg.homeUrl);
    if (await isLoggedOut(browser)) throw new AuthLostError('未登录或登录已过期');
    return await fn(browser);
  } finally {
    browser.close();
    await sleep(300);
  }
}

function sessionRange({ backDays = 8, forwardDays = 14 } = {}) {
  const now = new Date();
  const from = new Date(now.getTime() - backDays * 86400000);
  const to = new Date(now.getTime() + forwardDays * 86400000);
  return { startAt: ymd(from), endAt: ymd(to) };
}

async function loadSessions(browser, range = sessionRange()) {
  const sessions = await fetchSessions(browser, { tenantId: cfg.tenantId, ...range });
  sessions.sort((a, b) => a.start - b.start);
  return sessions;
}

/** 日程接口按天扫描，范围越大越慢；分块拉取避免长时间等待 */
async function loadSessionsChunked(browser, fromDaysAgo, toDaysAgo = 0) {
  const out = new Map();
  for (let start = fromDaysAgo; start > toDaysAgo; start -= 7) {
    const end = Math.max(toDaysAgo, start - 7);
    const from = new Date(Date.now() - start * 86400000);
    const to = new Date(Date.now() - end * 86400000);
    const list = await fetchSessions(browser, { tenantId: cfg.tenantId, startAt: ymd(from), endAt: ymd(to) });
    for (const s of list) out.set(s.sub, s);
    log.info(`  已取 ${start}~${end} 天前：${list.length} 场`);
  }
  return [...out.values()].sort((a, b) => a.start - b.start);
}

function activeSessions(sessions, now = Date.now()) {
  const before = 10 * 60 * 1000;
  const after = 45 * 60 * 1000;
  return sessions.filter((s) => now >= s.start * 1000 - before && now <= s.end * 1000 + after);
}

function catchUpCandidates(sessions, days) {
  const now = Date.now();
  const since = now - days * 86400000;
  return sessions.filter((s) => s.end * 1000 < now && s.end * 1000 > since && !store.session(s.sub)?.sweptAt);
}

function onAuthLost() {
  fs.writeFileSync(path.join(path.dirname(cfg.statePath), 'NEED_LOGIN'), new Date().toISOString());
  log.error('登录已失效：请运行 --login 重新登录');
  if (cfg.notify) notify('智云课堂 PPT', '登录已过期，请重新登录');
}

async function syncOne(browser, session) {
  const r = await syncSession({ browser, store, cfg, log, session });
  if (r.added) {
    log.info(`+${r.added} 张  ${session.title} ${dayStamp(session.start * 1000)}（共 ${r.total}）`);
    if (cfg.notify) notify('智云课堂 PPT', `${session.title} 新增 ${r.added} 张`);
  }
  return r;
}

async function cmdDoctor() {
  return withBrowser(async (browser) => {
    const sessions = await loadSessions(browser);
    const courses = new Map();
    for (const s of sessions) courses.set(s.course, s.title);
    const today = ymd(new Date());
    const todays = sessions.filter((s) => dayStamp(s.start * 1000) === today);
    const active = activeSessions(sessions);
    log.info(`登录正常，共 ${courses.size} 门课 / ${sessions.length} 个场次`);
    for (const [id, title] of courses) log.info(`  ${id}  ${title}`);
    log.info(`今天 ${todays.length} 场：`);
    for (const s of todays) log.info(`  ${new Date(s.start * 1000).toLocaleTimeString('zh-CN', { hour12: false })} ${s.title} sub=${s.sub}`);

    const rows = [];
    for (const s of sessions) {
      if (!store.session(s.sub)?.count) continue;
      rows.push(`${s.title} ${dayStamp(s.start * 1000)} → ${store.session(s.sub).count} 张`);
    }
    log.info(`本地已有 ${store.totalSeen} 张（${rows.length} 个场次）`);
    if (active.length) log.info(`当前正在上的课：${active.map((s) => s.title).join('、')}`);
    return 0;
  });
}

async function cmdOnce() {
  return withBrowser(async (browser) => {
    const sessions = await loadSessions(browser);
    const targets = [...activeSessions(sessions), ...catchUpCandidates(sessions, cfg.catchUpDays)];
    const uniq = [...new Map(targets.map((s) => [s.sub, s])).values()];
    if (!uniq.length) {
      log.info('没有正在上课或需要回补的场次');
      return 0;
    }
    for (const s of uniq) {
      log.info(`处理 ${s.title} ${dayStamp(s.start * 1000)} sub=${s.sub}`);
      await syncOne(browser, s);
    }
    buildIndex(cfg.outDir, log);
    return 0;
  });
}

async function cmdBackfill(days) {
  return withBrowser(async (browser) => {
    const sessions = await loadSessionsChunked(browser, days);
    const since = Date.now() - days * 86400000;
    const targets = sessions.filter((s) => s.end * 1000 > since && s.end * 1000 < Date.now());
    log.info(`回补 ${days} 天内 ${targets.length} 个场次`);
    for (const s of targets) {
      const done = store.session(s.sub)?.sweptAt;
      log.info(`处理 ${s.title} ${dayStamp(s.start * 1000)} sub=${s.sub}${done ? '（已扫过，查漏）' : ''}`);
      try {
        await syncOne(browser, s);
      } catch (e) {
        log.warn(`跳过 ${s.sub}: ${e.message}`);
      }
    }
    return 0;
  });
}

async function cmdDaemon() {
  const endAt = new Date();
  endAt.setHours(cfg.endHour, 0, 0, 0);
  if (Date.now() >= endAt.getTime()) {
    log.info('已过运行时段，退出');
    return 0;
  }
  log.info(`开始监听，运行到 ${cfg.endHour}:00，轮询间隔 ${cfg.intervalSec}s`);

  let failures = 0;
  while (Date.now() < endAt.getTime()) {
    try {
      await withBrowser(async (browser) => {
        let sessions = await loadSessions(browser);
        let lastSweep = Date.now();
        let lastIndexAt = 0;
        const seenActive = new Set();

        while (Date.now() < endAt.getTime()) {
          const now = Date.now();
          if (now - lastSweep > (cfg.sweepEverySec ?? 900) * 1000) {
            try {
              sessions = await loadSessions(browser);
              lastSweep = now;
              log.info(`课表已刷新（${sessions.length} 个场次）`);
            } catch (e) {
              log.warn(`刷新课表失败: ${e.message}`);
            }
          }

          let addedThisCycle = 0;
          for (const s of activeSessions(sessions, now)) {
            if (!seenActive.has(s.sub)) {
              seenActive.add(s.sub);
              log.info(`开始跟踪 ${s.title} sub=${s.sub}`);
            }
            try {
              addedThisCycle += (await syncOne(browser, s)).added || 0;
            } catch (e) {
              if (e instanceof AuthLostError) throw e;
              log.warn(`${s.title} 抓取失败: ${e.message}`);
            }
          }

          for (const s of catchUpCandidates(sessions, cfg.catchUpDays).slice(0, 2)) {
            log.info(`回补 ${s.title} ${dayStamp(s.start * 1000)}`);
            try {
              addedThisCycle += (await syncOne(browser, s)).added || 0;
            } catch (e) {
              if (e instanceof AuthLostError) throw e;
              log.warn(`回补 ${s.sub} 失败: ${e.message}`);
            }
          }

          if (addedThisCycle && Date.now() - lastIndexAt > 5 * 60 * 1000) {
            try {
              buildIndex(cfg.outDir, log);
              lastIndexAt = Date.now();
            } catch (e) {
              log.warn(`生成索引失败: ${e.message}`);
            }
          }

          await sleep(cfg.intervalSec * 1000);
        }
      });
      break;
    } catch (e) {
      if (e instanceof AuthLostError) {
        onAuthLost();
        return 3;
      }
      failures += 1;
      log.error(`第 ${failures} 次失败: ${e.message}`);
      if (failures >= 3) return 1;
      await sleep(30 * 1000);
    }
  }
  log.info('到达退出时间');
  return 0;
}

async function main() {
  if (has('--help') || has('-h')) {
    console.log(USAGE);
    return 0;
  }
  if (!fs.existsSync(cfg.configFile)) {
    log.warn(`未找到 config.json，使用默认配置（输出到 ${cfg.outDir}）`);
  }
  log.info(`配置: ${cfg.configFile}`);
  log.info(`输出: ${cfg.outDir}`);

  if (has('--login')) {
    const chromePath = findChrome(cfg.chromePath);
    launchDetached({ chromePath, profileDir: cfg.profileDir, hosts: cfg.hosts, url: cfg.casUrl });
    log.info('已打开登录窗口，登录成功后关闭窗口即可');
    return 0;
  }
  if (has('--doctor')) return cmdDoctor();
  if (has('--index')) {
    buildIndex(cfg.outDir, log);
    return 0;
  }
  if (has('--backfill')) return cmdBackfill(Number(valueOf('--backfill', 30)) || 30);
  if (has('--once')) return cmdOnce();
  return cmdDaemon();
}

main()
  .then((code) => process.exit(code || 0))
  .catch((e) => {
    if (e instanceof AuthLostError) {
      onAuthLost();
      process.exit(3);
    }
    log.error(e.stack || e.message);
    process.exit(1);
  });
