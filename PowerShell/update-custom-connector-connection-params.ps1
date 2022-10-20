#Requires -Version 6.0

function Update-CustomConnectorConnectionParameters {
  [CmdletBinding()]
  param(
    [Parameter(ValueFromPipeline)] [PSCustomObject]$CustomConnector,
    [Parameter(Mandatory)] [String]$AccessToken,
    [Parameter(Mandatory)] [String]$DataverseHost
  )

  process {
    [string]$ConnectorId = $CustomConnector.ConnectorId
    $ResourcePath = "connectors(${ConnectorId})"
    $PatchObject = [PSCustomObject]@{
        connectionparameters = $CustomConnector.CustomParameters
    }
    $PatchPayload = $PatchObject | ConvertTo-Json -EscapeHandling EscapeNonAscii
    [void](Invoke-DataverseHttpPatch $AccessToken $DataverseHost $ResourcePath $PatchPayload)
    $PSCmdlet.WriteVerbose(
        "Custom connector ${ConnectorId}: connection parameters updated"
    )
  }
}