function Invoke-EndToEndPipelineTest ($Data) {
    $path = './PowerShell/tests/e2e-pipeline.tests.ps1'    
    $container = New-PesterContainer -Path $path -Data $Data
    Invoke-Pester -Container $container
}