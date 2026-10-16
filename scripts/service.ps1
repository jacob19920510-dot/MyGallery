param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop')]
    [string]$Action,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectPattern = '(?i)' + [regex]::Escape($projectRoot) + '[\\/]'
$serviceSpecs = @(
    @{ Name = 'API'; Port = 4174; Script = (Join-Path $projectRoot 'desktop\server.cjs') },
    @{ Name = 'Frontend'; Port = 5173; Script = (Join-Path $projectRoot 'node_modules\vite\bin\vite.js') }
)

function Test-ProjectOwner($processId, $processMap) {
    # Older npm/concurrently launches use a relative backend path. Check its
    # ancestors for this exact workspace, without stopping those ancestors.
    for ($depth = 0; $depth -lt 8; $depth++) {
        $entry = $processMap[[int]$processId]
        if (!$entry) { return $false }
        if ($entry.CommandLine -match $projectPattern) { return $true }
        if ($entry.ParentProcessId -eq $processId) { break }
        $processId = $entry.ParentProcessId
    }
    return $false
}

try {
    $processMap = @{}
    Get-CimInstance Win32_Process | ForEach-Object { $processMap[[int]$_.ProcessId] = $_ }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
    $ownedIds = @()
    $missing = @()

    foreach ($spec in $serviceSpecs) {
        $ports = @($listeners | Where-Object { $_.LocalPort -eq $spec.Port })
        if (!$ports.Count) {
            Write-Host ($spec.Name + ' (' + $spec.Port + '): stopped')
            $missing += $spec
            continue
        }
        foreach ($connection in $ports) {
            $entry = $processMap[[int]$connection.OwningProcess]
            $owned = $entry -and $entry.Name -eq 'node.exe' -and (Test-ProjectOwner $entry.ProcessId $processMap)
            if (!$owned) {
                if ($Action -eq 'Start') { throw ('Port ' + $spec.Port + ' is used by another application. No process was stopped.') }
                Write-Host ('Skipped foreign process on port ' + $spec.Port)
                continue
            }
            $ownedIds += [int]$entry.ProcessId
            Write-Host ($spec.Name + ' (' + $spec.Port + '): running, PID ' + $entry.ProcessId)
        }
    }

    if ($CheckOnly) { Write-Host 'Check only; no processes changed.'; exit 0 }

    if ($Action -eq 'Stop') {
        # Include this launcher's exact script commands if startup was incomplete.
        foreach ($entry in $processMap.Values) {
            if ($entry.Name -ne 'node.exe') { continue }
            foreach ($spec in $serviceSpecs) {
                if ($entry.CommandLine -and $entry.CommandLine.Contains($spec.Script)) {
                    $ownedIds += [int]$entry.ProcessId
                }
            }
        }
        foreach ($targetId in ($ownedIds | Select-Object -Unique)) {
            # Verify process creation time to guard against PID reuse.
            $current = Get-CimInstance Win32_Process -Filter "ProcessId = $targetId" -ErrorAction SilentlyContinue
            if ($current -and $current.CreationDate -eq $processMap[$targetId].CreationDate) {
                Stop-Process -Id $targetId -ErrorAction Stop
            }
        }
        Write-Host 'MyGallery services stopped. Your library is saved on disk.'
        exit 0
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (!$nodeCommand) { throw 'Node.js was not found. Install Node.js and try again.' }
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vite\bin\vite.js'))) {
        throw 'Dependencies are missing. Run npm install in this project first.'
    }
    $logDirectory = Join-Path $projectRoot '.service'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $started = @()
    try {
        foreach ($spec in $missing) {
            $arguments = '"' + $spec.Script + '"'
            $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory ($spec.Name + '.log')) -RedirectStandardError (Join-Path $logDirectory ($spec.Name + '.error.log'))
            $started += $process
        }
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            try {
                $apiResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:4174/api/bootstrap' -UseBasicParsing -TimeoutSec 1
                $frontendResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 1
                if ($apiResponse.StatusCode -eq 200 -and $frontendResponse.StatusCode -eq 200) { $ready = $true; break }
            } catch { }
            foreach ($process in $started) { if ($process.HasExited) { throw ('A service exited. Check logs in ' + $logDirectory) } }
            Start-Sleep -Milliseconds 500
        }
        if (!$ready) { throw ('Services did not become ready. Check logs in ' + $logDirectory) }
        Write-Host 'MyGallery is ready: http://127.0.0.1:5173/'
        Start-Process 'http://127.0.0.1:5173/'
    } catch {
        foreach ($process in $started) { if (!$process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue } }
        throw
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
