import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;

export class Logger {
  constructor(dir, { echo = true } = {}) {
    this.dir = dir;
    this.echo = echo;
    this.file = path.join(dir, 'runner.log');
    fs.mkdirSync(dir, { recursive: true });
    this.rotate();
  }

  rotate() {
    try {
      const st = fs.statSync(this.file);
      if (st.size > MAX_BYTES) fs.renameSync(this.file, `${this.file}.1`);
    } catch {}
  }

  line(level, args) {
    const msg = args
      .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a)))
      .join(' ');
    const line = `[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${level ? level + ' ' : ''}${msg}`;
    if (this.echo) console.log(line);
    try {
      fs.appendFileSync(this.file, line + '\n');
    } catch {}
  }

  info(...args) {
    this.line('', args);
  }

  warn(...args) {
    this.line('WARN', args);
  }

  error(...args) {
    this.line('ERROR', args);
  }
}
