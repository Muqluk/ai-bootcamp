# Build the AI/LLM Bootcamp: one catalogue page plus one standalone page per module.
#   pwsh site/build.ps1     (or powershell.exe -File site/build.ps1)
# Inputs (this folder): page.html (frame), style.css, app.js, tools.js (instruments), catalogue.html, module-body.html,
#   mNN-*.html (module fragments), diagrams/<hash>.svg (Mermaid sources pre-rendered by ../tools/render-diagrams.mjs).
# Outputs:
#   ../dist/index.html, ../dist/mNN-*.html   self-contained files that link to each other (committed; open index.html)
#   ../out/ai-bootcamp.zip                    the download: dist pages plus the content licence in ai-bootcamp/
#                                             (git-ignored; published as the GitHub Release asset ai-bootcamp.zip)
# The build fails if a private-looking name, host, address or path is in the output; the full check is tools/public-scan.js.
param()
$site = $PSScriptRoot
$dist = Join-Path (Split-Path -Parent $site) 'dist'
$utf8 = [Text.UTF8Encoding]::new($false)
function Read-Site([string]$name) { [IO.File]::ReadAllText((Join-Path $site $name), $utf8) }
$modules = @(
  @{ id = 'm1';  file = 'm01-context.html';       title = 'Context';                     sub = 'What the model sees, and what it costs to show it';           level = 'foundation';   prereq = @() },
  @{ id = 'm2';  file = 'm02-tokens.html';        title = 'Tokens and their price';      sub = 'Input, output, cache write, cache read';                      level = 'foundation';   prereq = @() },
  @{ id = 'm3';  file = 'm03-skills.html';        title = 'Skills';                      sub = 'Instructions that load only when needed';                     level = 'practitioner'; prereq = @('m1') },
  @{ id = 'm4';  file = 'm04-commands.html';      title = 'Commands';                    sub = 'Built-in and your own';                                       level = 'practitioner'; prereq = @('m1') },
  @{ id = 'm5';  file = 'm05-hooks.html';         title = 'Hooks';                       sub = 'Rules the model cannot talk its way past';                    level = 'practitioner'; prereq = @() },
  @{ id = 'm6';  file = 'm06-marketplaces.html';  title = 'Plugins and marketplaces';    sub = 'Package it, publish it, control it';                          level = 'advanced';     prereq = @('m3', 'm5') },
  @{ id = 'm7';  file = 'm07-agents.html';        title = 'Headless runs and subagents'; sub = 'Claude Code as a program, and as a team';                     level = 'practitioner'; prereq = @('m1', 'm2') },
  @{ id = 'm8';  file = 'm08-orchestration.html'; title = 'Orchestration';               sub = 'Briefs, handoffs, queues and the ways they fail';             level = 'advanced';     prereq = @('m7') },
  @{ id = 'm9';  file = 'm09-telemetry.html';     title = 'Telemetry';                   sub = 'See tokens, cache and cost as they happen';                   level = 'practitioner'; prereq = @('m2') },
  @{ id = 'm10'; file = 'm10-cost.html';          title = 'Cutting cost';                sub = 'The levers, and proof that each one worked';                  level = 'advanced';     prereq = @('m2', 'm9') },
  @{ id = 'm11'; file = 'm11-ab-testing.html';    title = 'Evals and A/B testing';       sub = 'Compare prompts, models and setups without fooling yourself'; level = 'advanced';     prereq = @('m2', 'm7') },
  @{ id = 'm12'; file = 'm12-transcripts.html';   title = 'Session transcripts';         sub = 'The anatomy of the JSONL behind every session';               level = 'practitioner'; prereq = @('m1', 'm2') },
  @{ id = 'm13'; file = 'm13-models.html';        title = 'Models and ways to teach them'; sub = 'Model tiers, retrieval, ingestion, fine-tuning and what you will actually use'; level = 'foundation'; prereq = @() },
  @{ id = 'm14'; file = 'm14-agent-sdk.html';     title = 'Agent SDK and agent teams';   sub = 'Your own agent loop, and sessions that message each other';   level = 'advanced';     prereq = @('m7') },
  @{ id = 'm15'; file = 'm15-ecosystem.html';     title = 'The wider ecosystem';         sub = 'Multiplexers, community skills and how to vet them';          level = 'practitioner'; prereq = @('m3') },
  @{ id = 'm16'; file = 'm16-security.html';      title = 'Security';                    sub = 'Permissions, sandboxing, prompt injection and what you install'; level = 'practitioner'; prereq = @() },
  @{ id = 'm17'; file = 'm17-workflow.html';      title = 'Daily workflow';              sub = 'Plan mode, rewind, worktrees, effort and git habits';         level = 'foundation';   prereq = @() },
  @{ id = 'm18'; file = 'm18-ci.html';            title = 'Unattended and CI';           sub = 'GitHub Actions, review in the pipeline, scheduled runs';      level = 'advanced';     prereq = @('m7', 'm16') },
  @{ id = 'm19'; file = 'm19-api.html';           title = 'Claude API building blocks';  sub = 'Tool use, structured outputs, vision, citations, batch, computer use'; level = 'practitioner'; prereq = @('m2') },
  @{ id = 'm20'; file = 'm20-writing.html';       title = 'Writing for agents';          sub = 'Briefs, specs, handoffs and CLAUDE.md design';                level = 'foundation';   prereq = @() },
  @{ id = 'm21'; file = 'm21-surfaces.html';      title = 'Where Claude Code runs';      sub = 'Terminal, VS Code, JetBrains, desktop and web compared';      level = 'foundation';   prereq = @() },
  @{ id = 'm22'; file = 'm22-sensitive-data.html'; title = 'Sensitive data';             sub = 'PHI, PII and secrets: what leaves the machine and how to stop it'; level = 'practitioner'; prereq = @('m5', 'm16') },
  @{ id = 'm23'; file = 'm23-mcp.html';           title = 'MCP: anatomy of the protocol'; sub = 'JSON-RPC, capabilities, transports, auth, and a server you build'; level = 'practitioner'; prereq = @('m1') },
  @{ id = 'm24'; file = 'm24-mcp-or-cli.html';    title = 'MCP server or CLI tool';      sub = 'The same job both ways, measured in tokens and turns';        level = 'advanced';     prereq = @('m2', 'm23') }
)
$page = Read-Site 'page.html'; $style = Read-Site 'style.css'; $app = Read-Site 'app.js'
$tools = if (Test-Path (Join-Path $site 'tools.js')) { Read-Site 'tools.js' } else { '' }
$catalogue = Read-Site 'catalogue.html'; $moduleBody = Read-Site 'module-body.html'
if ($app.Contains('</script') -or $tools.Contains('</script')) { throw 'build: a script file contains a closing script tag' }

# Mermaid sources become inline SVG from the cache; the hash is over the text exactly as written in the file.
$sha = [Security.Cryptography.SHA1]::Create()
$missing = [Collections.Generic.List[string]]::new()
function Expand-Diagrams([string]$html, [string]$where) {
  [regex]::Replace($html, '(?s)<pre class="mermaid">(.*?)</pre>', {
    param($m)
    $hash = (-join ($sha.ComputeHash($utf8.GetBytes(($m.Groups[1].Value -replace "`r", ''))) | ForEach-Object { $_.ToString('x2') })).Substring(0, 12)
    $svg = Join-Path $site "diagrams\$hash.svg"
    if (Test-Path $svg) { [IO.File]::ReadAllText($svg, $utf8) } else { $missing.Add("$where $hash"); '<p class="note">Diagram not rendered yet.</p>' }
  })
}

$done = 0
foreach ($m in $modules) {
  $f = Join-Path $site $m.file
  # A fragment still being written (a lab step marked EXPECTED-TBD, or no closing tag yet) is built as a stub, not shipped half done.
  $raw = if (Test-Path $f) { [IO.File]::ReadAllText($f, $utf8) } else { '' }
  if ($raw -and ($raw.Contains('EXPECTED-TBD') -or -not $raw.TrimEnd().EndsWith('</section>'))) { "pending: $($m.file) is still being written; built as a stub"; $raw = '' }
  $m.stub = -not $raw
  if ($raw) {
    $m.html = Expand-Diagrams $raw $m.file; $done++
    if ($m.html -notmatch "<section class=`"module`" id=`"$($m.id)`"") { throw "build: $($m.file) does not start a section.module with id $($m.id)" }
    # Checked on the fragment as written: a rendered diagram's inline SVG carries its own style element.
    if ($raw -match '<script(?![^>]*class="drill")' -or $raw -match '<style|\son\w+=|<link|<img') { Write-Warning "build: $($m.file) has a script, style, handler or image; check it" }
    try { $q = [regex]::Match($m.html, '(?s)<script type="application/json" class="drill">(.*?)</script>').Groups[1].Value | ConvertFrom-Json; $m.calls = @($q).Count } catch { throw "build: $($m.file) drill JSON does not parse: $_" }
  } else {
    $m.html = "<section class=`"module`" id=`"$($m.id)`" data-title=`"$($m.title)`" data-sub=`"$($m.sub)`" data-level=`"$($m.level)`" data-prereq=`"$($m.prereq -join ',')`" data-minutes=`"0`"><div class=`"overview`"><p class=`"lede`">This module is planned and not written yet. The catalogue lists the modules that are ready.</p></div><div class=`"labs`"></div><script type=`"application/json`" class=`"drill`">[]</script></section>"
    $m.calls = 0
  }
  $m.minutes = [int]([regex]::Match($m.html, '<section class="module"[^>]*data-minutes="(\d+)"').Groups[1].Value)
  $m.labs = [regex]::Matches($m.html, '<article class="lab"').Count
  $m.lessons = [regex]::Matches($m.html, '<div class="lesson"').Count
  $m.tools = $m.html.Contains('data-tool=')
}
$catalogue = Expand-Diagrams $catalogue 'catalogue.html'
if ($missing.Count) { Write-Warning ("build: $($missing.Count) diagram(s) not rendered (run: node ..\tools\render-diagrams.mjs): " + ($missing -join '; ')) }


function Edition([string]$html) {
  return $html.Replace('{{LAB}}', '~/bootcamp-labs')
}
function Href([string]$id, [string]$edition, [string]$kind) {
  if ($id -eq 'index') { return 'index.html' }
  return ($modules | Where-Object { $_.id -eq $id }).file
}
function Render([string]$self) {
  $edition = 'portable'; $kind = 'file'
  $man = [ordered]@{ edition = $edition; kind = $kind; self = $self; catalogue = (Href 'index' $edition $kind); modules = @($modules | ForEach-Object {
        [ordered]@{ id = $_.id; title = $_.title; sub = $_.sub; level = $_.level; prereq = @($_.prereq); minutes = $_.minutes; stub = [bool]$_.stub; lessons = $_.lessons; labs = $_.labs; calls = $_.calls; href = (Href $_.id $edition $kind) } }) }
  $catHref = Href 'index' $edition $kind
  $target = ''
  if ($self -eq 'index') {
    $body = $catalogue; $title = 'AI/LLM Bootcamp'; $crumb = 'Catalogue'; $file = 'index.html'; $useTools = $false; $catAttr = 'href="#"'
  } else {
    $m = $modules | Where-Object { $_.id -eq $self }
    $catLink = if ($catHref) { "<a href=`"$catHref`"$target>All modules</a>" } else { '' }
    $body = $moduleBody.Replace('{{FRAGMENT}}', $m.html).Replace('{{CATALOGUE_LINK}}', $catLink).Replace('{{FILE}}', $m.file).Replace('{{SHARE_LEDE}}', $(if ($m.stub) { 'This module is planned and not written yet, so there is little to hand on. Once it is written, the same link and file carry the full module.' } else { 'This module is a complete page on its own: briefing, labs, judgment calls and cheat sheet. It names no organization, host, account or internal tool, and every lab runs on plain Claude Code in a scratch folder.' }))
    $title = "$($m.title) $([char]0xB7) AI/LLM Bootcamp"; $crumb = ''; $file = $m.file; $useTools = $m.tools
    $catAttr = if ($catHref) { "href=`"$catHref`"$target" } else { 'href="#overview"' }
  }
  $json = ($man | ConvertTo-Json -Depth 6 -Compress).Replace('</', '<\/')
  $out = $page.Replace('{{BODY}}', $body).Replace('{{TITLE}}', $title).Replace('{{CRUMB}}', $crumb).Replace('{{CATALOGUE_ATTR}}', $catAttr)
  $out = Edition $out
  $out = $out.Replace('{{STYLE}}', $style).Replace('{{MANIFEST}}', $json).Replace('{{APP}}', $app).Replace('{{TOOLS}}', $(if ($useTools) { $tools } else { '' }))
  if ($kind -eq 'file' -or $self -ne 'index') {
    $cut = $out.IndexOf('<div class="top">')
    $head = $out.Substring(0, $cut).Replace('<meta name="claude:viewport-fit-sides" content="cover">', '')
    $out = "<!doctype html>`n<html lang=`"en`">`n<head>`n<meta charset=`"utf-8`">`n<meta name=`"viewport`" content=`"width=device-width,initial-scale=1,viewport-fit=cover`">`n<style>html,body{height:100%}body{margin:0}img{max-width:100%}</style>`n$head</head>`n<body>`n" + $out.Substring($cut) + "`n</body>`n</html>`n"
  }
  return @{ file = $file; html = $out }
}

# Generic leak gate; tools/public-scan.js is the full check.
$deny = '(?i)172\.16\.|192\.168\.|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|C:[\\/]+scratch|C:[\\/]+repo|\bW-\d{2,}\b|\{\{[A-Z_]+\}\}'
# Private terms stay outside the repo: one regex per line in the file named by PUBLIC_SCAN_EXTRA (optional).
if ($env:PUBLIC_SCAN_EXTRA -and (Test-Path $env:PUBLIC_SCAN_EXTRA)) {
  $extra = @(Get-Content $env:PUBLIC_SCAN_EXTRA | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
  if ($extra.Count) { $deny = $deny + '|' + (($extra | ForEach-Object { "(?:$_)" }) -join '|') }
}
$ids = @('index') + @($modules | ForEach-Object { $_.id })
$pages = foreach ($id in $ids) { $r = Render $id; @{ file = $r.file; html = $r.html } }
$leaks = 0
foreach ($p in $pages) {
  $hits = @([regex]::Matches($p.html, $deny))
  if ($hits.Count) { $leaks += $hits.Count; $hits | Select-Object -First 6 | ForEach-Object { $s0 = [Math]::Max(0, $_.Index - 50); "LEAK $($p.file) '$($_.Value)': ..." + ($p.html.Substring($s0, [Math]::Min(130, $p.html.Length - $s0)) -replace '\s+', ' ') } }
}
if ($leaks) { throw "build: $leaks leak hit(s); nothing written" }
[void](New-Item -ItemType Directory -Force $dist)
foreach ($p in $pages) { [IO.File]::WriteAllText((Join-Path $dist $p.file), $p.html, $utf8) }
$out = Join-Path (Split-Path -Parent $site) 'out'; [void](New-Item -ItemType Directory -Force $out)
$zip = Join-Path $out 'ai-bootcamp.zip'
# The download: the built pages and the content licence under one ai-bootcamp/ folder, so it unzips and opens offline.
# Entries are sorted and carry a fixed timestamp, so the same pages always give the same zip.
Add-Type -AssemblyName System.IO.Compression
$fs = [IO.File]::Open($zip, [IO.FileMode]::Create)
$za = [IO.Compression.ZipArchive]::new($fs, [IO.Compression.ZipArchiveMode]::Create)
$stamp = [DateTimeOffset]::new(2026, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
$entries = @($pages | ForEach-Object { $_.file } | Sort-Object { $_ } -Culture ([Globalization.CultureInfo]::InvariantCulture) | ForEach-Object { @{ name = $_; src = Join-Path $dist $_ } }) +
  @{ name = 'LICENSE-CONTENT.md'; src = Join-Path (Split-Path -Parent $site) 'LICENSE-CONTENT.md' }
foreach ($e in $entries) {
  $ze = $za.CreateEntry("ai-bootcamp/$($e.name)", [IO.Compression.CompressionLevel]::Optimal); $ze.LastWriteTime = $stamp
  $w = $ze.Open(); $b = [IO.File]::ReadAllBytes($e.src); $w.Write($b, 0, $b.Length); $w.Dispose()
}
$za.Dispose(); $fs.Dispose()
$labs = ($modules | ForEach-Object { $_.labs } | Measure-Object -Sum).Sum
"built: $done of $($modules.Count) modules, $labs labs, $($pages.Count) pages; zip $zip"
