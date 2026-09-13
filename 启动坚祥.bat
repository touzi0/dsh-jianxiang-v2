@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 坚祥数字助理（新版）启动器

rem ============================================
rem  坚祥数字助理 新版启动器
rem  - DSH_HOME 指向安装目录内 dsh-home\（数据不进 C 盘）
rem  - 先运行 工具\jx-boot.mjs 准备插件环境
rem  - 通过 --patch 挂载 插件\.jx-mods.patch.yml（模组层，高于原生）
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
    echo [OK] 服务已在运行，直接打开浏览器。
    start "" "http://127.0.0.1:3080"
    timeout /t 2 /nobreak >nul
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
    echo [失败] 服务未及时启动。请查看最小化的服务器窗口里的报错信息。
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:ready
echo [OK] 服务已就绪：http://127.0.0.1:3080
echo.
echo      插件管理：设置 → Plugins → 坚祥模组 标签页。
echo      关闭最小化的服务器窗口即可停止服务。
timeout /t 5 /nobreak >nul
exit /b 0
