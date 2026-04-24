param(
    [string]$SerialPort = "COM4",
    [int]$Port = 8765,
    [int]$BoardId = 0,
    [switch]$AutoConnect
)

Write-Host "Launching EEG dashboard..."
Write-Host "  Env: BCI"
Write-Host "  SerialPort: $SerialPort"
Write-Host "  Port: $Port"
Write-Host "  BoardId: $BoardId"
Write-Host "  AutoConnect: $AutoConnect"

$args = @("run", "--no-capture-output", "-n", "BCI", "python", "-u", "app.py", "--serial-port", $SerialPort, "--port", $Port, "--board-id", $BoardId)

if ($AutoConnect) {
    $args += "--auto-connect"
}

& conda @args
