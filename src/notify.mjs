import { spawn } from 'node:child_process';

/** Windows 右下角通知；其他平台静默跳过 */
export function notify(title, message) {
  if (process.platform !== 'win32') return;
  const ps = [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;',
    '$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);',
    `$t.GetElementsByTagName('text').Item(0).AppendChild($t.CreateTextNode(${JSON.stringify(title)})) > $null;`,
    `$t.GetElementsByTagName('text').Item(1).AppendChild($t.CreateTextNode(${JSON.stringify(message)})) > $null;`,
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('智云课堂PPT').Show([Windows.UI.Notifications.ToastNotification]::new($t))",
  ].join(' ');
  try {
    spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { detached: true, stdio: 'ignore' }).unref();
  } catch {}
}
