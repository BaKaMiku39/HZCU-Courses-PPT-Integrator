# 智云课堂 PPT 自动抓取

上课时老师翻的每一页 PPT，自动存成本地图片。

> **用途**：给自己复习、整理课堂笔记。抓的是你本人账号能看到的课件画面，存在本机；请勿二次传播或商用（见文末「版权与免责」）。

> 适用：浙大城市学院「智云课堂」(`classroom.hzcu.edu.cn`)。其他学校的智云课堂部署也能用，见文末「换学校」。

**工作方式**：程序用一个专用浏览器配置保留你自己的登录状态，定时读取你课表里的场次，把平台已经截好并推送的幻灯片图片下载到本地。**不保存账号密码，不上传任何数据，所有文件都在你本机。**

- 自动识别你全部的课，不用一门门填课程 ID
- 上课期间每分钟检查一次，有新页就下载
- 关机/休眠导致漏抓的，下次启动会自动补齐（平台返回整场完整列表）
- 本地去重，重复运行不会重复下载
- 自带可打印的索引页，一键另存成 PDF 方便做笔记

---

## 一、准备

| 需要 | 说明 |
| --- | --- |
| Windows 10/11 | Linux / macOS 也能跑，只是「每天自动运行」那一步给的是 Windows 脚本 |
| Node.js 20+ | 去 <https://nodejs.org> 下 LTS 版，一路下一步即可 |
| Chrome 或 Edge | 装了就行，程序会自动找 |
| 校园账号 | 能登录智云课堂即可 |

检查环境：按 `Win + R`，输入 `cmd` 回车，然后输入：

```bat
node -v
```

能显示 `v20.x` 或更高就行。

## 二、拿到代码

```bat
git clone https://github.com/BaKaMiku39/HZCU-Courses-PPT-Integrator.git
cd HZCU-Courses-PPT-Integrator
```

没有 git 也可以：在 GitHub 页面点 **Code → Download ZIP**，解压后进入目录。

## 三、改配置

把 `config.example.json` 复制一份，改名 `config.json`，然后用记事本打开，**只改 `outDir` 这一行**（图片存哪）：

```json
{
  "outDir": "D:\\我的课件\\PPT"
}
```

> Windows 路径里的反斜杠要写两个：`D:\\我的课件\\PPT`。
> 其余项保持默认即可，含义见文末「配置说明」。

## 四、登录一次

```bat
npm run login
```

会弹出一个浏览器窗口，停在学校的统一身份认证页。输入你的学号和密码，登录成功后会跳回智云课堂首页——**然后直接把这个窗口关掉**。

登录状态就保存在仓库的 `profile/` 目录里，之后每次抓取都用它。密码不会以任何形式被记录。

## 五、体检

```bat
npm run doctor
```

正常会输出类似：

```
登录正常，共 6 门课 / 32 个场次
  52101  高等数学
  52876  大学物理
  ...
今天 2 场：
  07:59:41 高等数学 sub=1234567
  13:30:00 大学物理 sub=1234589
本地已有 0 张（0 个场次）
```

看到自己的课程就说明通了。

## 六、先手动跑一轮

```bat
npm run once
```

它会处理「正在上的课」和「最近 3 天结束的课」，输出：

```
处理 高等数学 2026-09-08 sub=1234567
+141 张  高等数学 2026-09-08（共 141）
```

图片在 `outDir` 下，结构：

```
PPT自动抓取/
├── 高等数学/
│   └── 2026-09-08_1234567/
│       ├── 0001_080007.jpg
│       ├── 0002_080019.jpg
│       └── ...
└── 大学物理/
    └── 2026-09-09_1234589/
```

`0001_080007.jpg` = 这场课的第 1 页，推送时刻 08:00:07。按文件名排序就是讲课顺序。

## 七、整理笔记：索引页与 PDF

```bat
npm run index
```

会在 `outDir` 里生成 `index.html`（总目录：每门课、每场课各多少页）和每场课的 `index.html`（缩略图长图）。

- 双击 `outDir\index.html` 用浏览器打开，点进去就能按顺序翻页；
- 在打开的页面按 `Ctrl + P` → 目标选「另存为 PDF」，就是一份按页分好的 PDF，方便导入笔记软件或打印；
- 索引在每次抓到新图后会**自动重建**（最多 5 分钟一次），也可以随时手动跑一次。

## 八、让它每天自己跑

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1
```

会注册一个计划任务（默认每天 07:40 启动，`endHour` 时间自动退出），并问你要不要立刻启动一次。

- 自定义启动时间：`-StartTime 08:00`
- 卸载：`powershell -ExecutionPolicy Bypass -File scripts\uninstall-task.ps1`
- 看任务状态：`schtasks /Query /TN "智云课堂PPT抓取" /V /FO LIST`

> 计划任务只在**开机且已登录**时执行；已设为「电池供电也运行」「错过就补跑」「失败自动重试 3 次」，`endHour` 到点自动退出。电脑睡眠期间不会抓，但醒来后（或下次 `npm run once`）会把整场补回来。

## 九、命令一览

| 命令 | 作用 |
| --- | --- |
| `npm start` | 常驻监听，到 `endHour` 退出 |
| `npm run once` | 只跑一轮：正在上的课 + 最近 `catchUpDays` 天 |
| `npm run login` | 重新登录（会话过期时） |
| `npm run doctor` | 体检：登录态、课程、今天的课 |
| `npm run index` | 重新生成索引页（可另存 PDF） |
| `node bin/zhiyun-ppt.mjs --backfill 30` | 回补最近 30 天的全部场次 |
| `node bin/zhiyun-ppt.mjs --help` | 参数说明 |

## 十、出问题了？

| 现象 | 处理 |
| --- | --- |
| 收到「登录已过期」通知，目录里出现 `NEED_LOGIN` | 先停掉正在跑的程序，再双击 `scripts\relogin.bat` 重登一次 |
| `浏览器启动失败（配置目录可能正被占用）` | 你开着 `--login` 的窗口或另一个抓取进程，全关掉重试；必要时删掉 `profile\Singleton*` |
| `--doctor` 很慢或超时 | 日程接口按天扫描，范围越大越慢；把 `catchUpDays` 改小，或检查代理有没有拦 `yjapi.hzcu.edu.cn` |
| 登录页打不开 / 空白 | 该站的 CAS **只开 80 端口**（https 拒绝连接），程序已按 `http://` 访问；若仍打不开，多半是校园网策略 |
| 浏览器能上网，但程序里页面白屏 | 你的网络下浏览器自带 DNS 解析不了校园域名，`config.json` 的 `hosts` 已内置 IP 兜底；学校换 IP 时改这里 |
| 只想抓某一门课 | 临时办法：把其余场次抓完删除；后续版本会加 `onlyCourses` 白名单 |

## 十一、原理（想了解再看）

1. `--login` 打开一个使用仓库内 `profile/` 目录的 Chrome，你手动登录，cookie 由浏览器自己维护。
2. 程序在页面里（同源、带 cookie）调用日程接口，拿到「某天有哪些课、对应 `sub_id`」：
   `https://yjapi.hzcu.edu.cn/courseapi/v2/schedule/get-week-schedules?user_id=&tenant_id=&start_at=&end_at=&token=`
3. 再调场次接口拿幻灯片列表（也就是播放器右侧那一栏的数据源）：
   `GET /pptnote/v1/schedule/search-ppt?course_id=&sub_id=`
4. 列表里的 `pptimgurl` 指向 `video.hzcu.edu.cn/ai3/ppt/...` 的公开图片，Node 直接下载。

依赖为零：只用 Node 内置的 `fetch` 和 `WebSocket` 通过 CDP 控制浏览器。

### 换学校

改 `config.json` 的 `hosts`、`tenantId`，以及 `src/config.mjs` 里的 `homeUrl` / `casUrl`。接口路径一般通用；若平台改版，重点看 `src/hzcu.mjs` 里的两个函数。

### 配置说明

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `hosts` | 见示例 | 域名 → IP。浏览器 DNS 解析不了时兜底，能解析就设成 `{}` |
| `tenantId` | `21` | 对应网址里的 `tenant_code` |
| `outDir` | `~/Documents/PPT自动抓取` | 保存根目录 |
| `intervalSec` | `60` | 轮询间隔（秒） |
| `perPage` | `300` | 单场最多取多少张 |
| `catchUpDays` | `3` | 自动回补最近几天 |
| `sweepEverySec` | `900` | 多久刷新一次课表 |
| `endHour` | `22` | 守护进程几点退出 |
| `notify` | `true` | 有新图时弹 Windows 通知 |
| `chromePath` | `""` | 留空自动探测 |

## 用途与免责

本项目的定位是**个人学习工具**：把你在自己账号下已经能看到的课堂课件留存下来，用于课后复习、整理笔记、做知识卡片，避免反复拖进度条找某一页。

- 抓取的是老师授课时展示的课件画面，**版权归老师和学校**。请仅作个人学习使用，不要二次分发、上传到公开网盘或商用。
- 请遵守学校平台的使用条款；默认 60 秒一次轮询，对服务器负载很小，请不要调成高频。
- 本项目仅操作你自己账号可见的内容，不绕过任何权限控制。

## License

MIT
