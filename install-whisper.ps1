# Seeree Whisper auto-install script
# Run: powershell -ExecutionPolicy Bypass -File install-whisper.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Seeree Whisper - Auto Install" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$whisperDir = Join-Path $base "whisper.cpp"

if (!(Test-Path $whisperDir)) {
    New-Item -ItemType Directory -Path $whisperDir | Out-Null
}

# ── 1. Download whisper.cpp ──
$exePath = Join-Path $whisperDir "main.exe"
if (Test-Path $exePath) {
    Write-Host "[1/2] whisper.cpp already exists, skip" -ForegroundColor Green
} else {
    Write-Host "[1/2] Downloading whisper.cpp..." -ForegroundColor Yellow
    $zipUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip"
    $zipPath = Join-Path $whisperDir "whisper-bin.zip"
    $tempDir = Join-Path $whisperDir "temp"

    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
        Write-Host "    Extracting..." -ForegroundColor Gray
        Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

        Get-ChildItem $tempDir -Recurse | ForEach-Object {
            if ($_.Extension -in @('.exe', '.dll')) {
                Copy-Item $_.FullName $whisperDir -Force
            }
        }

        Remove-Item $tempDir -Recurse -Force
        Remove-Item $zipPath -Force

        if (Test-Path $exePath) {
            Write-Host "    OK whisper.cpp installed" -ForegroundColor Green
        } else {
            Write-Host "    FAIL main.exe not found" -ForegroundColor Red
        }
    } catch {
        Write-Host "    FAIL $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "    Download manually: $zipUrl" -ForegroundColor Yellow
        Write-Host "    Extract main.exe to whisper.cpp\" -ForegroundColor Yellow
    }
}

# ── 2. Download model ──
$modelPath = Join-Path $whisperDir "ggml-base.bin"
if (Test-Path $modelPath) {
    Write-Host "[2/2] Model already exists, skip" -ForegroundColor Green
} else {
    Write-Host "[2/2] Downloading Whisper base model (74MB)..." -ForegroundColor Yellow
    # Use HuggingFace mirror (China-friendly) with fallback to official
    $modelUrls = @(
        "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
    )

    try {
        $ProgressPreference = 'SilentlyContinue'
        $downloaded = $false
        foreach ($url in $modelUrls) {
            try {
                Write-Host "    Trying: $url" -ForegroundColor Gray
                Invoke-WebRequest -Uri $url -OutFile $modelPath -UseBasicParsing -TimeoutSec 120
                if ((Test-Path $modelPath) -and (Get-Item $modelPath).Length -gt 1MB) {
                    $downloaded = $true
                    break
                }
            } catch {
                Write-Host "    Failed, trying next mirror..." -ForegroundColor Gray
            }
        }
        $ProgressPreference = 'Continue'

        if ($downloaded) {
            $size = [math]::Round((Get-Item $modelPath).Length / 1MB, 1)
            Write-Host "    OK model downloaded ($size MB)" -ForegroundColor Green
        } else {
            Write-Host "    FAIL all mirrors failed" -ForegroundColor Red
            Write-Host "    Download manually from any URL above" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    FAIL $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ── Result ──
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ((Test-Path $exePath) -and (Test-Path $modelPath)) {
    Write-Host "  OK Install complete! Run 'npm run dev'" -ForegroundColor Green
} else {
    Write-Host "  Some files missing, check errors above" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
