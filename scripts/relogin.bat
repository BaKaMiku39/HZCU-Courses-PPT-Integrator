@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo 即将打开登录窗口，登录成功后直接关闭窗口即可。
node bin\zhiyun-ppt.mjs --login
timeout /t 5 >nul
