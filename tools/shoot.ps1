# Headless screenshots of built pages, for looking at a build before it ships. No window is shown.
#   .\shoot.ps1 -Shots 'index.html?style=a|1300x1600', 'm02-tokens.html?style=c&mode=dark#labs|420x1800' [-Dir ..\dist] [-Out <temp>\ai-bootcamp\shots]
# Each shot is "<file>[?query][#hash]|<width>x<height>". ?style=a..e picks the theme and ?mode=light|dark the mode.
param([Parameter(Mandatory)][string[]]$Shots, [string]$Dir = '',[string]$Out = (Join-Path ([IO.Path]::GetTempPath()) 'ai-bootcamp-shots'))
if (-not $Dir) { $Dir = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'dist' }
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
[void](New-Item -ItemType Directory -Force $Out)
$base = ([Uri](Resolve-Path $Dir).Path).AbsoluteUri.TrimEnd('/')
foreach ($s in $Shots) {
  $spec, $size = $s -split '\|'; if (-not $size) { $size = '1300x1600' }
  $w, $h = $size -split 'x'
  $name = ($spec -replace '\.html', '' -replace '[^A-Za-z0-9]+', '-').Trim('-') + "-$w.png"
  $png = Join-Path $Out $name
  $args2 = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', "--window-size=$w,$h", '--virtual-time-budget=4000', "--screenshot=$png", "$base/$spec")
  $p = Start-Process -FilePath $chrome -ArgumentList $args2 -WindowStyle Hidden -PassThru -Wait -RedirectStandardError (Join-Path $Out 'chrome.err.txt')
  if (Test-Path $png) { $png } else { "FAILED $spec" }
}
