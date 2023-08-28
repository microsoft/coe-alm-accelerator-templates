<#
This function fetches all the pcf projects under the repository.
Runs the npm 'clean install'.
Installs a project's dependencies.
#>
function Invoke-Pre-Deployment-Status-Update{
    param (
        [Parameter(Mandatory)] [String]$pipelineStageRunId,
        [Parameter(Mandatory)] [String]$stageStatus,
        [Parameter(Mandatory)] [String]$pipelineServiceConnectionUrl,
        [Parameter(Mandatory)] [String]$aadHost,
        [Parameter(Mandatory)] [String]$tenantId,
        [Parameter(Mandatory)] [String]$applicationId,
        [Parameter(Mandatory)] [String]$clientSecret
    )
    . "$env:POWERSHELLPATH/dataverse-webapi-functions.ps1"
    $dataverseHost = Get-HostFromUrl "$pipelineServiceConnectionUrl"
    $spnToken = Get-SpnToken "$tenantId" "$applicationId" "$clientSecret" "$dataverseHost" "$aadHost"

    # Set up the request body
    $requestBody = @{
        StageRunId = "$pipelineStageRunId"
        PreDeploymentStepStatus = "$stageStatus"
    }
    $jsonBody = $requestBody | ConvertTo-Json

    Invoke-DataverseHttpPost "$spnToken" "$dataverseHost" "UpdatePreDeploymentStepStatus" "$jsonBody"
}