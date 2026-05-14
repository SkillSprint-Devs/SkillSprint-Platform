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

# Cleanup function — must never throw; uses 'Continue' to prevent Docker stderr warnings
# from becoming terminating errors under $ErrorActionPreference = 'Stop'
function Cleanup {
    Write-Log "Cleaning up Docker containers..."
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker compose down --remove-orphans 2>&1 | Out-Null
    $ErrorActionPreference = $saved
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

        # Ensure no leftover containers from previous runs
    Cleanup

    # Verify required ports are free (5000 for execution service)
    function Ensure-PortFree {
        param([int]$Port)
        $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conn) {
            Write-Log "Port $Port is in use. Checking for Docker containers owned by this project."
            # Find Docker container publishing this port
            $dockerContainer = docker ps --filter "publish=$Port" --format "{{.ID}}" 2>$null
            if ($dockerContainer) {
                Write-Log "Stopping Docker container $dockerContainer using port $Port."
                docker stop $dockerContainer | Out-Null
                Write-Log "Container $dockerContainer stopped."
            } else {
                Write-Log "Port $Port is occupied by a non-Docker process. Please free the port manually." "WARN"
            }
        } else {
            Write-Log "Port $Port is free."
        }
    }
    Ensure-PortFree -Port 4000
    Ensure-PortFree -Port 5000

    # Pull / build required images
    Write-Log "Pulling latest Docker images..."
    $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    docker compose pull
    $pullExit = $LASTEXITCODE
    $ErrorActionPreference = $saved
    if ($pullExit -ne 0) {
        Write-Log "Failed to pull Docker images." "ERROR"
        exit 1
    }

    # Start execution-service container
    Write-Log "Starting execution-service container..."
    $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    docker compose up -d execution-service
    $upExit = $LASTEXITCODE
    $ErrorActionPreference = $saved
    if ($upExit -ne 0) {
        Write-Log "Failed to start execution-service." "ERROR"
        exit 1
    }

    # Confirm container reached 'running' state
    # docker compose ps -q is reliable regardless of the auto-generated container name (e.g. skillsprint-execution-service-1)
    Start-Sleep -Seconds 2
    $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $runningId = docker compose ps -q execution-service 2>$null
    if (-not $runningId) {
        $logs = docker compose logs --tail 20 execution-service 2>&1
        $ErrorActionPreference = $saved
        Write-Log "execution-service container is not in running state.`nLast logs:`n$logs" "ERROR"
        exit 1
    }
    $ErrorActionPreference = $saved
    Write-Log "execution-service container is running (ID: $runningId)."

    # Wait for health endpoint
    $healthUrl = "http://localhost:4000/health"
    $maxAttempts = 30   # 30 * 5s = 150s, give execution-service more time
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
        # final diagnostic logs
        $saved = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        $finalLogs = docker compose logs execution-service 2>&1
        $ErrorActionPreference = $saved
        Write-Log "Execution service failed health check after $maxAttempts attempts. Container logs:`n$finalLogs" "ERROR"
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
    # Validate .env exists — missing env file causes a cryptic backend crash for new devs
    $envFile = Join-Path -Path $PSScriptRoot -ChildPath ".env"
    if (-Not (Test-Path $envFile -PathType Leaf)) {
        Write-Log ".env file is missing. Copy .env.example to .env and fill in required values." "ERROR"
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
    # Cleanup  # Disabled to keep execution-service container alive after script finishes
}
