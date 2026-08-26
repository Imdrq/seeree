@echo off
chcp 65001 >nul
title SiriAI Windows

cd /d "%~dp0"

echo ========================================
echo   SiriAI Windows - 启动中...
echo ========================================
echo.

:: 先停掉旧进程，避免端口冲突
taskkill /f /im electron.exe >nul 2>&1

:: 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [1/2] 检测到依赖未安装，正在安装...
    call npm install
    if %errorlevel% neq 0 (
        echo 依赖安装失败，请检查网络或手动运行 npm install
        pause
        exit /b 1
    )
    echo 依赖安装完成！
) else (
    echo [1/2] 依赖已就绪，跳过安装
)

echo.
echo [2/2] 启动开发服务器...
echo ========================================
echo.

npm run dev

pause
