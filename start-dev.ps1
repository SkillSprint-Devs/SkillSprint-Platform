<#
.SYNOPSIS
One-Click Development Starter for SkillSprint.
Ensures Docker, ports, pulls images, starts execution service, waits health, then backend.
Handles graceful shutdown and cleanup.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Logging
$logFile = Join-Path -Path $PSScriptRoot -ChildPath "dev_startup.log"
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "$timestamp [$Level] $Message"
    Write-Host $entry
    Add-Content -Path $logFile -Value $entry
}

# Cleanup function
function Cleanup {
    Write-Log "Cleaning up Docker containers..."
    docker compose down --remove-orphans | Out-Null
}
# Register Ctrl+C handling
$cancelEvent = Register-EngineEvent PowerShell.Exiting -Action { Cleanup }

try {
    Write-Log "=== SkillSprint Development Startup ==="

    # Verify Docker Desktop is running
    Write-Log "Checking Docker daemon..."
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Docker Desktop is not running. Please start Docker Desktop and retry." "ERROR"
        exit 1
    }

    # Verify required ports are free (5000 for execution service)
    function Ensure-PortFree {
        param([int]$Port)
        $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conn) {
            Write-Log "Port $Port is in use. Attempting to stop owning process..."
            $pids = $conn | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
            foreach ($pid in $pids) {
                try {
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    Write-Log "Stopped process $pid using port $Port."
                } catch {
                    Write-Log "Failed to stop process $pid. Continuing." "WARN"
                }
            }
        } else {
            Write-Log "Port $Port is free."
        }
    }
    Ensure-PortFree -Port 5000

    # Pull / build required images
    Write-Log "Pulling latest Docker images..."
    docker compose pull | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Failed to pull Docker images." "ERROR"
        exit 1
    }

    # Start execution-service container
    Write-Log "Starting execution-service container..."
    docker compose up -d execution-service
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Failed to start execution-service." "ERROR"
        exit 1
    }

    # Wait for health endpoint
    $healthUrl = "http://localhost:5000/health"
    $maxAttempts = 12   # 12 * 5s = 60s
    $attempt = 0
    while ($attempt -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Log "Execution service is healthy."
                break
            }
        } catch {
            Write-Log "Waiting for execution service health... (attempt $($attempt+1))"
        }
        Start-Sleep -Seconds 5
        $attempt++
    }
    if ($attempt -eq $maxAttempts) {
        Write-Log "Execution service did not become healthy in time." "ERROR"
        exit 1
    }

    # Backend validation
    $backendPath = Join-Path -Path $PSScriptRoot -ChildPath "backend"
    if (-Not (Test-Path $backendPath -PathType Container)) {
        Write-Log "Backend folder not found at $backendPath." "ERROR"
        exit 1
    }
    $serverFile = Join-Path -Path $backendPath -ChildPath "server.js"
    if (-Not (Test-Path $serverFile -PathType Leaf)) {
        Write-Log "Server entry point not found: $serverFile." "ERROR"
        exit 1
    }

    # Start backend server
    Write-Log "Starting backend server..."
    Set-Location $backendPath
    node .\server.js
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Backend server exited with error." "ERROR"
        exit 1
    }

} finally {
    # Cleanup Docker containers when script ends (unless you want them to stay)
    Cleanup
    Write-Log "Startup script completed."
}
