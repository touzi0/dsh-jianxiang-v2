@echo off
chcp 65001 >nul
setlocal
title DSH 官方版编译

rem 定位到脚本所在目录
cd /d "%~dp0"

echo ================================================
echo    DeepSeek Harness 官方版 编译脚本
echo    当前分支: master (官方 0.1.1-rc.2)
echo    pnpm run build = 编译后端 lib + 前端 web
echo ================================================
echo.
echo 提示：如果服务正在运行，建议先关掉再编译，避免文件被占用。
echo.

if not exist "node_modules" (
    echo [依赖] 未检测到 node_modules，先安装依赖（首次约几分钟）...
    call pnpm.cmd install
    if errorlevel 1 (
        echo.
        echo [失败] 依赖安装失败，请检查网络或 pnpm 环境。
        pause
        exit /b 1
    )
)

echo [1/1] 正在编译，请耐心等待（首次较慢，之后增量会快很多）...
call pnpm.cmd run build

if errorlevel 1 (
    echo.
    echo [失败] 编译出错，请把上方日志截图/复制发给 AI 排查。
    echo.
    pause
    exit /b 1
)

echo.
echo [成功] 编译完成！现在可以双击 启动DSH官方版.bat 启动了。
echo.
pause
