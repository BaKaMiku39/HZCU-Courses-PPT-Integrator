import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChrome(configured) {
  if (configured) {
    if (fs.existsSync(configured)) return configured;
    throw new Error(`chromePath 不存在: ${configured}`);
  }
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('找不到 Chrome/Edge，请在 config.json 里设置 chromePath');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    };
    ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP 连接已断开'));
      this.pending.clear();
    };
  }

  send(method, params = {}, timeoutMs = 25000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, timeoutMs);
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export class Browser {
  constructor({ proc, port, cdp }) {
    this.proc = proc;
    this.port = port;
    this.cdp = cdp;
  }

  static async launch({ chromePath, profileDir, hosts, headless = true, port }) {
    const args = [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=Translate',
      '--window-size=1280,900',
    ];
    const maps = Object.entries(hosts || {}).map(([host, ip]) => `MAP ${host} ${ip}`);
    if (maps.length) args.push(`--host-resolver-rules=${maps.join(', ')}`);
    if (headless) args.push('--headless=new', '--disable-gpu', '--mute-audio');
    args.push('about:blank');

    const proc = spawn(chromePath, args, { stdio: 'ignore' });

    let up = false;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) {
          up = true;
          break;
        }
      } catch {}
      await sleep(200);
    }
    if (!up) {
      try {
        proc.kill();
      } catch {}
      throw new Error(`浏览器启动失败（端口 ${port}，配置目录可能正被占用）`);
    }

    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('没有可用的页面目标');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'));
    });

    const cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    return new Browser({ proc, port, cdp });
  }

  async evaluate(expression, { timeoutMs = 25000 } = {}) {
    const res = await this.cdp.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      timeoutMs,
    );
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async navigate(url, { timeoutMs = 25000 } = {}) {
    await this.cdp.send('Page.navigate', { url });
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const state = await this.evaluate('document.readyState');
        if (state === 'complete') return;
      } catch {}
      await sleep(250);
    }
    throw new Error(`页面加载超时: ${url}`);
  }

  async open(url) {
    await this.navigate(url);
    await sleep(1500);
  }

  close() {
    try {
      this.cdp.ws.close();
    } catch {}
    try {
      this.proc.kill();
    } catch {}
    if (process.platform === 'win32' && this.proc.pid) {
      try {
        spawn('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {}
    }
  }
}

export { sleep };

/** 打开一个可见窗口（登录用），进程脱离本次运行，关窗即结束 */
export function launchDetached({ chromePath, profileDir, hosts, url }) {
  const args = [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
  ];
  const maps = Object.entries(hosts || {}).map(([host, ip]) => `MAP ${host} ${ip}`);
  if (maps.length) args.push(`--host-resolver-rules=${maps.join(', ')}`);
  args.push(url);
  const proc = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
  proc.unref();
  return proc;
}
