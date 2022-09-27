[CmdletBinding()]
param (
    # Directory where PowerShell scripts to be tested are stored. Use a relative path like '../scripts'. Script Analyzer will recurse through subdirectories as well
    [Parameter(Mandatory = $true)][string] $ScriptDirectory,
    # Comma separated list of specific PSScriptAnalyzer rules to exclude
    [Parameter(Mandatory = $false)][string]$ScriptAnalyzerExcludeRules
)

function Add-PRComment {
[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)][string]$Body
)
    Write-Information "Posting PR Comment via AzureDevOps REST API"

    # post the comment to the pull request
    try {
        $uri = "https://api.github.com/repos/microsoft/coe-alm-accelerator-templates/pulls/$(System.PullRequest.PullRequestId)"
        Write-Host $uri
        Write-Host $env:GITHUBPAT
        $response = Invoke-RestMethod -Uri $uri -Method GET -Headers @{Authorization = "Bearer $env:GITHUBPAT" } -ContentType application/json

        if($null -ne $response) {
            $pr = Get-Content $response | ConvertFrom-Json
            $uri = $pr._links.comments
            Write-Information "Constructed URL: $uri"

            $response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{Authorization = "Bearer $env:GITHUBPAT" } -Body $Body -ContentType application/json

            if ($null -eq $response) {
                Write-Information "Rest API posted OK"
            }
        }
    }
    catch {
        Write-Error $_
        Write-Error $_.Exception.Message
    }
}

$ScriptAnalyzerRules = Get-ScriptAnalyzerRule -Severity Error, Warning, Information
$ScriptAnalyzerResult = Invoke-ScriptAnalyzer -Path $ScriptDirectory -Recurse -IncludeRule $ScriptAnalyzerRules -ExcludeRule $ScriptAnalyzerExcludeRules

if ( $ScriptAnalyzerResult ) {
    $ScriptAnalyzerResultString = $ScriptAnalyzerResult | Out-String
    Write-Warning $ScriptAnalyzerResultString

    # loop through each result and post to the azuredevops rest api
    foreach ($result in $ScriptAnalyzerResult) {
        # build the script path for the PR comment, drop the workdir from the path
        $ScriptPath = $result.ScriptPath -replace [regex]::Escape($Env:SYSTEM_DEFAULTWORKINGDIRECTORY), ""
        Write-Information "ScriptPath: $ScriptPath"
        Write-Information "Line Number: $($result.Line)"
        Write-Information "Message: $($result.Message)"


        # build the markdown comments
        # cannot be tabbed over to match indentation
        $markdownComment = @"
:warning: Script Analyzer found the following issues with your code:

``$($result.Message)``
"@


    $body = @"
{
    "body": "$markdownComment"
}
"@
        # post to the PR
        Add-PRComment -Body $body
    }

    throw "PSScriptAnalyzer found issues with your code"

} else {
    Write-Output "All Script Analyzer tests passed"

    $markdownComment = @"
:white_check_mark: Script Analyzer found no issues with your code! High Five! :hand:
"@

    Write-Information "Posting PR Comment via AzureDevOps REST API"

    $body = @"
{
    "body": "$markdownComment"
}
"@
    # post to the PR
    Add-PRComment -Body $body
}
