@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 坚祥数字助理（新版）启动器

rem ============================================
rem  坚祥数字助理 新版启动器
rem  - DSH_HOME 指向安装目录内 dsh-home\（数据不进 C 盘）
rem  - 先运行 工具\jx-boot.mjs 准备插件环境
rem  - 通过 --patch 挂载 插件\.jx-mods.patch.yml（模组层，高于原生）
rem  - 官方 0.1.6 起网页带一次性登录令牌；带令牌的网址由 工具\jx-server.mjs
rem    写进 dsh-home\.web-url，本脚本用它打开可用地址（不带令牌会被 401 拒绝）
rem  - 与 启动DSH官方版.bat 数据完全隔离
rem ============================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "apps\cli\lib\bin.js" (
    echo [错误] 找不到 apps\cli\lib\bin.js，还没编译过。
    echo        请先双击 编译-官方版.bat 完成编译。
    pause
    exit /b 1
)

echo [1/4] 准备坚祥插件环境 ...
node "工具\jx-boot.mjs"
if errorlevel 1 (
    echo [失败] jx-boot.mjs 出错。
    pause
    exit /b 1
)

echo [2/4] 检查端口 3080 ...

netstat -ano | findstr /c:":3080" | findstr /c:"LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [OK] 服务已经在运行，不重复启动。
    call :openurl
    echo.
    echo      要停止服务：关闭标题为「坚祥数字助理 Server」的那个最小化窗口，
    echo      或在任务管理器里结束命令行含 apps\cli\lib\bin.js 的 node.exe。
    ping -n 9 127.0.0.1 >nul 2>&1
    exit /b 0
)

echo [3/4] 启动坚祥版服务 ...
start "坚祥数字助理 Server" /min cmd /k "node 工具\jx-server.mjs"

echo [..] 等待服务就绪（最多 60 秒）...
set /a cnt=0
:wait
curl -s -o nul --connect-timeout 2 http://127.0.0.1:3080 >nul 2>&1
if not errorlevel 1 goto ready
set /a cnt+=1
if !cnt! geq 60 (
    echo [失败] 服务未及时启动。请查看「坚祥数字助理 Server」窗口里的报错信息。
    pause
    exit /b 1
)
ping -n 2 127.0.0.1 >nul 2>&1
goto wait

:ready
echo [OK] 服务已就绪（浏览器应已自动打开）。
call :showurl
echo.
echo      插件管理：设置 → 插件 → 坚祥模组 标签页。
echo      关闭标题为「坚祥数字助理 Server」的最小化窗口即可停止服务。
ping -n 9 127.0.0.1 >nul 2>&1
exit /b 0

rem ---- 打印服务窗口写下的带令牌网址 ----
:showurl
set "URLFILE=%ROOT%dsh-home\.web-url"
if not exist "!URLFILE!" goto :urlnone
set "JXURL="
set /p JXURL=<"!URLFILE!"
if "!JXURL!"=="" goto :urlnone
echo       网址：!JXURL!
exit /b 0

:urlnone
echo       [提示] 还没抓到带令牌的网址：请在「坚祥数字助理 Server」窗口里
echo              复制 dsh web: 后面那一整行网址，粘贴到浏览器打开。
exit /b 0

rem ---- 打开带令牌网址（服务已在运行时用）----
:openurl
set "URLFILE=%ROOT%dsh-home\.web-url"
if not exist "!URLFILE!" goto :urlnone
set "JXURL="
set /p JXURL=<"!URLFILE!"
if "!JXURL!"=="" goto :urlnone
echo       打开：!JXURL!
start "" "!JXURL!"
exit /b 0
