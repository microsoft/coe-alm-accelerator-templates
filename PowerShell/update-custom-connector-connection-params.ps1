#Requires -Version 6.0

function Update-CustomConnectorConnectionParameters {
  [CmdletBinding()]
  param(
    [Parameter(ValueFromPipeline)] [PSCustomObject]$CustomConnector,
    [Parameter(Mandatory)] [String]$TenantId,
    [Parameter(Mandatory)] [String]$ClientId,
    [Parameter(Mandatory)] [String]$ClientSecret,
    [Parameter(Mandatory)] [String]$DataverseHost,
    [Parameter(Mandatory)] [String]$EnvironmentId,
    [Parameter()] [String]$AadHost = "login.microsoftonline.com"
  )

  begin {
    $DataverseToken = Get-SpnToken $TenantId $ClientId $ClientSecret $DataverseHost $AadHost
    # Note: trailing slash in Power Apps OAuth Resource Id is required
    $PowerAppsToken = Get-SpnToken $TenantId $ClientId $ClientSecret "service.powerapps.com/" $AadHost |
    ConvertTo-SecureString -AsPlainText -Force
  }

  process {
    [string]$ConnectorId = $CustomConnector.ConnectorId
    $ConnectorResourcePath = "connectors(${ConnectorId})"
    
    $PSCmdlet.WriteVerbose("API: Dataverse; Instance: $DataverseHost; Resource: ${ConnectorResourcePath}")
    $ConnectorEntity = Invoke-DataverseHttpGet $DataverseToken $DataverseHost $ConnectorResourcePath
    [string]$ConnectorInternalName = $ConnectorEntity.connectorinternalid

    $PSCmdlet.WriteVerbose("API: Power Apps; Environment: $EnvironmentId; Resource: apis/${ConnectorInternalName}; Details")
    $ConnectorEnvironmentFilter = [System.Uri]::EscapeDataString("environment eq '${EnvironmentId}'")
    [uri]$ConnectorApiUrl = "https://api.powerapps.com/providers/Microsoft.PowerApps/apis/${ConnectorInternalName}?`$filter=${ConnectorEnvironmentFilter}&api-version=2021-02-01"
    $ConnectorApiDetails = Invoke-RestMethod -Method Get -Uri $ConnectorApiUrl `
      -Authentication OAuth -Token $PowerAppsToken
    $PSCmdlet.WriteVerbose("API: Power Apps; Environment: $EnvironmentId; Resource: apis/${ConnectorInternalName}; Original Swagger Definition")
    $ConnectorOpenApiResponse = Invoke-WebRequest -Method Get -Uri $ConnectorApiDetails.properties.apiDefinitions.originalSwaggerUrl -UseBasicParsing
    $ConnectorOpenApiReader = New-Object System.IO.StreamReader $ConnectorOpenApiResponse.RawContentStream

    # The PATCH operation for a custom connector is very picky about the payload.
    # The payload contents below simulates what the Power Apps web UI does when
    # hitting the 'Update Connector' button
    # Because of Depth limitations in JSON serialization in PowerShell, the 
    # OpenAPI definition is copied verbatim from the original swagger url endpoint
    $PSCmdlet.WriteVerbose("API: Power Apps; Environment: $EnvironmentId; Resource: apis/${ConnectorInternalName}; Update connection parameters")
    [string]$PatchPayload = @"
{
  "properties": {
    "backendService": $(ConvertTo-Json $ConnectorApiDetails.properties.backendService -Depth 100),
    "capabilities": $(ConvertTo-Json $ConnectorApiDetails.properties.capabilities -Depth 100),
    "description": $(ConvertTo-Json $ConnectorApiDetails.properties.description -Depth 100),
    "connectionParameters": $($CustomConnector.CustomParameters),
    "environment": $(ConvertTo-Json $ConnectorApiDetails.properties.environment -Depth 100),
    "openApiDefinition": $($ConnectorOpenApiReader.ReadToEnd()),
    "policyTemplateInstances": $(ConvertTo-Json $ConnectorApiDetails.properties.policyTemplateInstances -Depth 100)
  }
}
"@
    $ConnectorOpenApiReader.Close()
    Remove-Variable ConnectorOpenApiReader
    [void](
      Invoke-RestMethod -Method Patch -Uri $ConnectorApiUrl `
        -Authentication OAuth -Token $PowerAppsToken `
        -ContentType "application/json; charset=utf-8" -Body $PatchPayload
    )
  }

  end {
    Remove-Variable DataverseToken
    Remove-Variable PowerAppsToken
  }
}