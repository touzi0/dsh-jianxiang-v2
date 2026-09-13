@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title DSH 官方版启动器

rem ============================================
rem  DeepSeek Harness 官方版一键启动器
rem  - 端口 3080 已被占用时直接打开浏览器
rem  - 否则启动服务（新版官方会自动打开浏览器）
rem  - 运行的是编译产物 apps\cli\lib\bin.js
rem ============================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "apps\cli\lib\bin.js" (
    echo [错误] 找不到 apps\cli\lib\bin.js，还没编译过。
    echo        请先双击 编译-官方版.bat 完成编译。
    pause
    exit /b 1
)

echo [1/3] 检查端口 3080 ...

netstat -ano | findstr /c:":3080" | findstr /c:"LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [OK] 服务已在运行，直接打开浏览器。
    start "" "http://127.0.0.1:3080"
    timeout /t 2 /nobreak >nul
    exit /b 0
)

echo [2/3] 启动官方版服务 ...
start "DSH 官方版 Server" /min cmd /k "node apps\cli\lib\bin.js web"

echo [..] 等待服务就绪（最多 30 秒）...
set /a cnt=0
:wait
curl -s -o nul --connect-timeout 2 http://127.0.0.1:3080 >nul 2>&1
if not errorlevel 1 goto ready
set /a cnt+=1
if !cnt! geq 30 (
    echo [失败] 服务未及时启动。请查看最小化的服务器窗口里的报错信息。
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait

:ready
echo [OK] 服务已就绪。官方新版启动后会自动打开浏览器；
echo      如果没有自动打开，请手动访问 http://127.0.0.1:3080
echo.
echo 关闭最小化的服务器窗口即可停止服务。
timeout /t 5 /nobreak >nul
exit /b 0
