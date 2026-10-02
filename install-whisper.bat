@echo off
chcp 65001 >nul
title Seeree - Whisper 安装脚本
cd /d "%~dp0"

echo ========================================
echo   Seeree Whisper 语音识别 - 自动安装
echo ========================================
echo.

:: 创建目录
if not exist "whisper.cpp" mkdir "whisper.cpp"

:: ── 1. 下载 whisper.cpp Windows 预编译包 ──
if exist "whisper.cpp\main.exe" (
    echo [1/2] whisper.cpp 已存在，跳过下载
) else (
    echo [1/2] 正在下载 whisper.cpp...
    powershell -Command "& {
        $url = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.5/whisper-bin-x64.zip'
        $zip = 'whisper.cpp\whisper-bin.zip'
        Write-Host '    下载中（约 30MB）...'
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        Write-Host '    解压中...'
        Expand-Archive -Path $zip -DestinationPath 'whisper.cpp\temp' -Force
        Copy-Item 'whisper.cpp\temp\main.exe' 'whisper.cpp\main.exe' -Force
        Copy-Item 'whisper.cpp\temp\*.dll' 'whisper.cpp\' -Force -ErrorAction SilentlyContinue
        Remove-Item 'whisper.cpp\temp' -Recurse -Force
        Remove-Item $zip -Force
    }"
    if exist "whisper.cpp\main.exe" (
        echo    ✓ whisper.cpp 下载完成
    ) else (
        echo    ✗ 下载失败，请手动下载：
        echo      https://github.com/ggml-org/whisper.cpp/releases
        echo      解压 main.exe 到 whisper.cpp\ 目录
    )
)

:: ── 2. 下载 Whisper 模型 ──
if exist "whisper.cpp\ggml-base.bin" (
    echo [2/2] 模型已存在，跳过下载
) else (
    echo [2/2] 正在下载 Whisper base 模型（74MB）...
    powershell -Command "& {
        $url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
        $out = 'whisper.cpp\ggml-base.bin'
        Write-Host '    下载中...'
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
    }"
    if exist "whisper.cpp\ggml-base.bin" (
        echo    ✓ 模型下载完成
    ) else (
        echo    ✗ 下载失败，请手动下载：
        echo      https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
        echo      保存到 whisper.cpp\ggml-base.bin
    )
)

echo.
echo ========================================
if exist "whisper.cpp\main.exe" if exist "whisper.cpp\ggml-base.bin" (
    echo   ✓ 安装完成！可以启动 Seeree 了
) else (
    echo   部分文件缺失，请检查上面的错误信息
)
echo ========================================
pause
