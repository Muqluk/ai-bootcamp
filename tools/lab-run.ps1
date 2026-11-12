# Run one lab script for verification, the way a reader would in a plain terminal, without touching the live agent setup.
#   .\lab-run.ps1 -Script <temp>\ai-bootcamp-labs\m5\lab1.ps1 [-TimeoutSec 300] [-IsolatedConfig] [-MaxChars 12000]
# (<temp> is your user temp folder.) What it guarantees:
#   - the script lives under <temp>\ai-bootcamp-labs\ and runs with that folder as its working directory
#   - every headless `claude -p` line in it carries --setting-sources and --strict-mcp-config, so your own hooks, settings
#     and MCP servers never load; a script without them is refused before anything runs
#   - the child environment has no HERDR_*, CLAUDE_CODE_*, CLAUDE_PID, CLAUDECODE or AI_AGENT, so a lab session has no
#     pane identity; BOOTCAMP_LAB is set to the lab root
#   - -IsolatedConfig points CLAUDE_CONFIG_DIR at <temp>\ai-bootcamp-labs\_config\<module>, for plugin and marketplace
#     commands, so the real ~/.claude/plugins is untouched (a session there is not signed in: use it for `claude plugin ...` only)
#   - a hard time limit, then the whole process tree is killed; no window is shown
# Output: stdout and stderr go to <script>.out.txt next to the script; the last -MaxChars characters are printed, then "EXIT n".
param(
  [Parameter(Mandatory)][string]$Script,
  [int]$TimeoutSec = 300,
  [switch]$IsolatedConfig,
  [int]$MaxChars = 12000
)
$root = Join-Path ([IO.Path]::GetTempPath()).TrimEnd('\') 'ai-bootcamp-labs'
$full = [IO.Path]::GetFullPath($Script)
if (-not $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "lab-run: the script must be under $root\" }
if (-not (Test-Path -LiteralPath $full)) { throw "lab-run: no such script: $full" }
$text = [IO.File]::ReadAllText($full) -replace "``\r?\n\s*", ' '
$n = 0
foreach ($line in ($text -split "\r?\n")) {
  $n++
  if ($line -match '^\s*#') { continue }
  if ($line -match '(?<![\w.\\/-])claude(\.exe)?\s' -and $line -match '(\s-p(\s|$)|\s--print(\s|$))') {
    if ($line -notmatch '--setting-sources\s' -or $line -notmatch '--strict-mcp-config') { throw "lab-run: line $n runs claude -p without --setting-sources and --strict-mcp-config: $($line.Trim())" }
    if ($line -match '--setting-sources\s+\S*user') { throw "lab-run: line $n loads user settings: $($line.Trim())" }
  }
  if ($line -match 'herdr\s|tmux\s') { throw "lab-run: line $n reaches for the live agent setup: $($line.Trim())" }
}
$work = Split-Path -Parent $full
$psi = [Diagnostics.ProcessStartInfo]::new('powershell.exe')
$psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$full`""
$psi.WorkingDirectory = $work
$psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
$psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
foreach ($k in @($psi.EnvironmentVariables.Keys)) {
  if ($k -like 'HERDR_*' -or $k -like 'CLAUDE_CODE_*' -or $k -eq 'CLAUDE_PID' -or $k -eq 'CLAUDE_EFFORT' -or $k -eq 'CLAUDECODE' -or $k -eq 'AI_AGENT') { [void]$psi.EnvironmentVariables.Remove($k) }
}
$psi.EnvironmentVariables['BOOTCAMP_LAB'] = $root
if ($IsolatedConfig) {
  $rel = $work.Substring($root.Length).Trim('\').Split('\')[0]
  $cfg = Join-Path $root ("_config\" + $(if ($rel) { $rel } else { 'root' }))
  [void](New-Item -ItemType Directory -Force $cfg)
  $psi.EnvironmentVariables['CLAUDE_CONFIG_DIR'] = $cfg
}
$p = [Diagnostics.Process]::Start($psi)
$out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
$p.StandardInput.Close()
$killed = $false
if (-not $p.WaitForExit($TimeoutSec * 1000)) { & taskkill.exe /T /F /PID $p.Id 2>&1 | Out-Null; $killed = $true }
$all = $out.Result
if ($err.Result.Trim()) { $all += "`n--- stderr ---`n" + $err.Result }
[IO.File]::WriteAllText($full + '.out.txt', $all)
if ($all.Length -gt $MaxChars) { "... ($($all.Length - $MaxChars) earlier characters are in $full.out.txt)"; $all.Substring($all.Length - $MaxChars) } else { $all }
if ($killed) { "EXIT killed after $TimeoutSec s" } else { "EXIT $($p.ExitCode)" }
