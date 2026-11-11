import fs from 'node:fs';
import path from 'node:path';

/**
 * 去重与进度记录。结构：
 * {
 *   version: 1,
 *   seen: { "<图片URL>": "<相对路径>" },
 *   sessions: { "<subId>": { title, course, date, count, sweptAt } }
 * }
 */
export class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 1, seen: {}, sessions: {} };
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object') {
        this.data = { version: 1, seen: raw.seen || {}, sessions: raw.sessions || {} };
      }
    } catch {
      // 首次运行或文件损坏，从空状态开始
    }
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  has(url) {
    return Object.prototype.hasOwnProperty.call(this.data.seen, url);
  }

  mark(url, relPath) {
    this.data.seen[url] = relPath;
  }

  session(subId) {
    return this.data.sessions[subId] || null;
  }

  setSession(subId, patch) {
    this.data.sessions[subId] = { ...(this.data.sessions[subId] || {}), ...patch };
  }

  get totalSeen() {
    return Object.keys(this.data.seen).length;
  }
}
