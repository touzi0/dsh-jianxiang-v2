@echo off
chcp 65001 >nul
setlocal
title 坚祥桌面版打包（未签名测试包）

rem ============================================
rem  坚祥数字助理 桌面版一键打包（未签名）
rem  - 配置读 apps\desktop\.env.windows（appId/更新源已指向 jxaizz.com）
rem  - 产物: apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\
rem  - 提示: 打包前建议先关闭正在运行的服务，避免文件占用
rem ============================================

cd /d "%~dp0"

if not exist "apps\desktop\.env.windows" (
    echo [错误] 缺少 apps\desktop\.env.windows 打包配置。
    pause
    exit /b 1
)

echo [1/1] 开始打包（首次需下载 Electron 与运行时，约 20-60 分钟），请耐心等待...
call pnpm.cmd run package:desktop:win:x64:unsigned

if errorlevel 1 (
    echo.
    echo [失败] 打包出错，请把上方日志复制发给 AI 排查。
    echo        打包记录: apps\desktop\.desktop-build\packaging-runs\
    pause
    exit /b 1
)

echo.
echo [成功] 未签名安装包输出目录：
echo        apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\
start "" explorer "apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts"
pause
