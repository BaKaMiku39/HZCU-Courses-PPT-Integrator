import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根目录（src/ 的上一级） */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULTS = {
  // 这些域名在部分网络下系统 DNS 能解析、浏览器自带解析器却失败，因此显式指定 IP。
  // 学校换 IP 时改这里，或删掉 hosts 让浏览器自己解析。
  hosts: {
    'classroom.hzcu.edu.cn': '202.107.195.247',
    'yjapi.hzcu.edu.cn': '202.107.195.247',
    'video.hzcu.edu.cn': '202.107.195.247',
    'ca.hzcu.edu.cn': '202.107.195.222',
  },
  tenantId: 21,
  homeUrl: 'https://classroom.hzcu.edu.cn/',
  // CAS 只开了 80 端口，登录必须走 http
  casUrl:
    'http://ca.hzcu.edu.cn/cas/login?service=https%3A%2F%2Fyjapi.hzcu.edu.cn%2Fcasapi%2Findex.php%3Fforward%3Dhttps%253A%252F%252Fclassroom.hzcu.edu.cn%252F%26r%3Dauth%2Flogin%26tenant_code%3D21',

  outDir: path.join(os.homedir(), 'Documents', 'PPT自动抓取'),
  profileDir: 'profile',
  statePath: 'state.json',
  logDir: 'logs',

  intervalSec: 60, // 轮询间隔
  perPage: 300, // 每个场次最多取多少张
  catchUpDays: 3, // 启动时回补最近几天的课
  endHour: 22, // 守护进程几点退出
  notify: true, // Windows 通知
  headless: true,
  chromePath: '', // 留空自动探测
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function loadConfig() {
  const file = path.join(ROOT, 'config.json');
  const user = readJson(file) || {};
  const cfg = { ...DEFAULTS, ...user, hosts: { ...DEFAULTS.hosts, ...(user.hosts || {}) } };

  for (const key of ['profileDir', 'statePath', 'logDir']) {
    if (!path.isAbsolute(cfg[key])) cfg[key] = path.join(ROOT, cfg[key]);
  }
  cfg.configFile = file;
  cfg.hasConfig = fs.existsSync(file);
  return cfg;
}

export function saveDefaultConfig() {
  const file = path.join(ROOT, 'config.json');
  if (fs.existsSync(file)) return file;
  const example = readJson(path.join(ROOT, 'config.example.json'));
  fs.writeFileSync(file, JSON.stringify(example || DEFAULTS, null, 2));
  return file;
}
