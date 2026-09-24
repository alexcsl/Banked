$deckPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Banked-pitch-deck.pptx')).Path
$pdfPath = Join-Path $PSScriptRoot 'Banked-pitch-deck.pdf'
$previewPath = Join-Path $PSScriptRoot 'previews'
New-Item -ItemType Directory -Path $previewPath -Force | Out-Null

$powerPoint = New-Object -ComObject PowerPoint.Application
$presentation = $null
try {
    $presentation = $powerPoint.Presentations.Open($deckPath, $false, $false, $false)
    $presentation.SaveAs($pdfPath, 32)
    for ($index = 1; $index -le $presentation.Slides.Count; $index++) {
        $imagePath = Join-Path $previewPath ('slide-{0:00}.png' -f $index)
        $presentation.Slides.Item($index).Export($imagePath, 'PNG', 1600, 900)
    }
} finally {
    if ($presentation) { $presentation.Close() }
    $powerPoint.Quit()
}

Write-Output $pdfPath
