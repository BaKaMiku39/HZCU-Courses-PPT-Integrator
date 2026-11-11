const COOKIE_JS = `(() => {
  const o = {};
  for (const kv of document.cookie.split('; ')) {
    const i = kv.indexOf('=');
    if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  return o;
})()`;

/** 从 cookie 里取 JWT（缓存中是 PHP 序列化串） */
function tokenFromCookie(ck) {
  const m = String(ck._token || '').match(/s:859:"([^"]+)"/);
  return m ? m[1] : '';
}

/** 判断当前页面是否被踢回统一身份认证 */
export async function isLoggedOut(browser) {
  const href = await browser.evaluate('location.href');
  if (/cas\/login|cas\/logout|yjlogin/.test(String(href))) return true;
  const ck = await browser.evaluate(COOKIE_JS);
  return !tokenFromCookie(ck) || !ck.login_cmc_id;
}

export class AuthLostError extends Error {}

/**
 * 拉取一段时间内的全部课表（智云课堂的日程接口，返回按天分组的上课记录）
 * @returns {Promise<Array<{sub:string,course:string,title:string,start:number,end:number,label:string}>>}
 */
export async function fetchSessions(browser, { tenantId, startAt, endAt }) {
  const js = `(async () => {
    const ck = ${COOKIE_JS};
    let user = {};
    try { user = JSON.parse(ck.JWTUser || '{}'); } catch {}
    const tok = (String(ck._token || '').match(/s:859:"([^"]+)"/) || [])[1] || '';
    if (!tok || !user.id) return { error: 'NO_SESSION', href: location.href };
    const q = new URLSearchParams({
      user_id: user.id, tenant_id: ${Number(tenantId)},
      start_at: ${JSON.stringify(startAt)}, end_at: ${JSON.stringify(endAt)}, token: tok,
    });
    const r = await fetch('https://yjapi.hzcu.edu.cn/courseapi/v2/schedule/get-week-schedules?' + q, {
      headers: { Accept: 'application/json' }, credentials: 'include',
    });
    if (!r.ok) return { status: r.status, error: 'HTTP_' + r.status, href: location.href };
    const b = await r.json();
    const days = (b && b.result && b.result.list) || [];
    const out = [];
    for (const d of days) {
      for (const s of (d.course || [])) {
        out.push({
          sub: String(s.id), course: String(s.course_id), title: String(s.course_title || ''),
          start: Number(s.start_at), end: Number(s.end_at), label: String(s.status_label || ''),
        });
      }
    }
    return { status: 200, sessions: out, href: location.href };
  })()`;

  const res = await browser.evaluate(js, { timeoutMs: 60000 });
  if (!res || res.error === 'NO_SESSION') throw new AuthLostError('登录态缺失');
  if (res.error) throw new Error(`课表接口失败: ${res.error}`);
  return res.sessions || [];
}

/**
 * 某场课已推送过的幻灯片列表（直播中会实时增加）
 * @returns {Promise<{total:number, slides:Array<{url:string,created:number,id:any}>}>}
 */
export async function fetchSlides(browser, { courseId, subId, perPage = 300 }) {
  const js = `(async () => {
    const q = new URLSearchParams({ course_id: ${JSON.stringify(String(courseId))}, sub_id: ${JSON.stringify(String(subId))}, page: 1, per_page: ${Number(perPage)} });
    let r;
    try {
      r = await fetch('/pptnote/v1/schedule/search-ppt?' + q, { headers: { Accept: 'application/json' } });
    } catch (e) { return { error: String(e) }; }
    if (r.status !== 200) return { status: r.status, error: 'HTTP_' + r.status, href: location.href };
    let b = null;
    try { b = await r.json(); } catch { return { status: 200, error: 'BAD_JSON' }; }
    const list = (b && b.list) || [];
    const slides = [];
    for (const it of list) {
      let c = it.content;
      if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = {}; } }
      if (!c || !c.pptimgurl) continue;
      slides.push({ url: c.pptimgurl, created: Number(c.created || it.created) || 0, id: it.id });
    }
    slides.sort((a, b2) => a.created - b2.created);
    return { status: 200, total: Number(b.total) || slides.length, slides };
  })()`;

  const res = await browser.evaluate(js);
  if (!res) throw new Error('幻灯片接口无响应');
  if (res.status === 403 || /cas\/login|yjlogin/.test(String(res.href || ''))) {
    throw new AuthLostError('接口返回 403，登录态可能已失效');
  }
  if (res.error) throw new Error(`幻灯片接口失败: ${res.error}`);
  return { total: res.total, slides: res.slides || [] };
}

export { tokenFromCookie };
