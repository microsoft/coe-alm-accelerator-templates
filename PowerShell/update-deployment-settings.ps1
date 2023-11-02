﻿<#
This function reads custom deployment settings and creates the branches, pipeline definitions.
Creates or updates the pipeline definition variables.
#>
function Set-DeploymentSettingsConfiguration
{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$pipelineSourceDirectory,
        [Parameter(Mandatory)] [String]$buildProjectName,
        [Parameter(Mandatory)] [String]$buildRepositoryName,
        [Parameter(Mandatory)] [String]$dataverseConnectionString,
        [Parameter(Mandatory)] [String]$xrmDataPowerShellVersion,
        [Parameter(Mandatory)] [String]$microsoftXrmDataPowerShellModule,
        [Parameter(Mandatory)] [String]$orgUrl,
        [Parameter(Mandatory)] [String]$projectName,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$azdoAuthType,
        [Parameter(Mandatory)] [String]$serviceConnection,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$currentBranch,
        [Parameter(Mandatory)] [String]$createSolutionBranch,
        [Parameter()] [String]$pipelineServiceConnectionName = "",
        [Parameter()] [String]$pipelineServiceConnectionUrl = "",
        [Parameter()] [String] [AllowEmptyString()]$pipelineStageRunId = "",
        [Parameter()] [String]$agentPool = "Azure Pipelines",
        [Parameter()] [String]$agentOS = "",
        [Parameter()] [String]$usePlaceholders = "true",
        [Parameter()] [String]$pat = "" # Azure DevOps Personal Access Token only required for running local tests
    )
    $configurationData = $env:DEPLOYMENT_SETTINGS | ConvertFrom-Json
    $reservedVariables = @("TriggerSolutionUpgrade","BypassAppConsent")
    Write-Host (ConvertTo-Json -Depth 10 $configurationData)

    #Generate Deployment Settings
    Write-Host "Update Deployment Settings"
    if(!(Test-Path "$buildSourceDirectory\$repo\$solutionName\config\")) {
        New-Item "$buildSourceDirectory\$repo\$solutionName\" -Name "config" -ItemType "directory"
    } else {
        #Remove legacy deployment settings
        Remove-Item "$buildSourceDirectory\$repo\$solutionName\config\*eploymentSettings.json" -Force
    }

    # Fetch Repository Id
    $solutionRepoId = Get-RepositoryIdbyName "$orgUrl" "$projectName" "$azdoAuthType" "$repo"

    #Update / Create Deployment Pipelines
    New-DeploymentPipelines "$buildProjectName" "$buildRepositoryName" "$orgUrl" "$projectName" "$repo" "$azdoAuthType" "$pat" "$solutionName" $configurationData $agentOS $solutionRepoId "$pipelineSourceDirectory" "$buildSourceDirectory" "$currentBranch" "$createSolutionBranch" "$agentPool"

    Write-Host "Importing PowerShell Module: $microsoftXrmDataPowerShellModule - $xrmDataPowerShellVersion"
    Import-Module $microsoftXrmDataPowerShellModule -Force -RequiredVersion $xrmDataPowerShellVersion -ArgumentList @{ NonInteractive = $true }
    $conn = Get-CrmConnection -ConnectionString "$dataverseConnectionString"

    #Load util function
    . "$env:POWERSHELLPATH/util.ps1"

    #Loop through the build definitions we found and update the pipeline variables based on the placeholders we put in the deployment settings files.
    foreach($configurationDataEnvironment in $configurationData)
    {
        $connectionReferences = [System.Collections.ArrayList]@()
        $environmentVariables = [System.Collections.ArrayList]@()
        $webHookUrls = [System.Collections.ArrayList]@()
        $sdkMessages = [System.Collections.ArrayList]@()
        $canvasApps = [System.Collections.ArrayList]@()
        $customConnectorSharings = [System.Collections.ArrayList]@()
        $componentOwnerships = [System.Collections.ArrayList]@()
        $flowActivationUsers = [System.Collections.ArrayList]@()
        $flowSharings = [System.Collections.ArrayList]@()
        $groupTeams = [System.Collections.ArrayList]@()
        #Getting the build definition id and variables to be updated
        $buildName = $configurationDataEnvironment.BuildName
        $environmentName = $configurationDataEnvironment.DeploymentEnvironmentName

        # Fetch the first build definition by name and update variables
        $buildDefinitionResourceUrl = "$orgUrl$projectName/_apis/build/definitions?name=$buildName&includeAllProperties=true&api-version=6.0"
        Write-Host "Fetching Builds for report BuildDefinitionResourceUrl - "$buildDefinitionResourceUrl
        $fullBuildDefinitionResponse = Invoke-RestMethod $buildDefinitionResourceUrl -Method Get -Headers @{
            Authorization = "$azdoAuthType  $env:SYSTEM_ACCESSTOKEN"
        }
        # If more than one build is returned search based on the repo
        if($fullBuildDefinitionResponse.count -gt 1) {
            $buildDefinitionResourceUrl = "$orgUrl$projectName/_apis/build/definitions?repositoryId=$solutionRepoId&repositoryType=TfsGit&name=$buildName&includeAllProperties=true&api-version=6.0"
            Write-Host "Fetching Builds for report BuildDefinitionResourceUrl - "$buildDefinitionResourceUrl
            $fullBuildDefinitionResponse = Invoke-RestMethod $buildDefinitionResourceUrl -Method Get -Headers @{
                Authorization = "$azdoAuthType  $env:SYSTEM_ACCESSTOKEN"
            }
        }
        $buildDefinitionResponseResults = $fullBuildDefinitionResponse.value
        Write-Host "Retrieved " $buildDefinitionResponseResults.length " builds"

        $newBuildDefinitionVariables = $null
        if($buildDefinitionResponseResults.length -gt 0) {
            $newBuildDefinitionVariables = $buildDefinitionResponseResults[0].variables
        }
		
        # Updating "ServiceConnection"; Required if the ''Environment URL' in the profile changes post commit.
        if($null -ne $configurationDataEnvironment -and $null -ne $configurationDataEnvironment.DeploymentEnvironmentUrl) {         
            $DeploymentEnvironmentUrl=$configurationDataEnvironment.DeploymentEnvironmentUrl
            $ServiceConnectionName=$configurationDataEnvironment.ServiceConnectionName
            if($null -ne $newBuildDefinitionVariables){
                Invoke-Create-Update-ServiceConnection-Parameters $DeploymentEnvironmentUrl $ServiceConnectionName $newBuildDefinitionVariables
            }
        }		

        # Updating PipelineStageRunId if the pipeline is triggered from a Power Platform Pipeline Invoke-Create-Update-PipelineStageRun-Parameter
        if($null -ne $newBuildDefinitionVariables -and $null -ne $pipelineStageRunId -and $pipelineStageRunId -ne ""){
            Write-Host "Updating PipelineStageRunId - $pipelineStageRunId"
            Invoke-Create-Update-PipelineStageRun-Parameter $pipelineStageRunId $pipelineServiceConnectionName $pipelineServiceConnectionUrl $newBuildDefinitionVariables
        }
        if($null -ne $configurationDataEnvironment) {
            if($null -ne $configurationDataEnvironment.UserSettings) {
                foreach($configurationVariable in $configurationDataEnvironment.UserSettings) {
                    $userSettingsJson = $configurationDataEnvironment.UserSettings | ConvertTo-Json

                    $configurationVariableName = $configurationVariable.Name
                    $configurationVariableValue = $configurationVariable.Value

                    # See if the $configurationVariableName repeated
                    # If repeated append "_index" to the $configurationVariableName
                    $jsonArray = ConvertFrom-Json $userSettingsJson
                    $configurationVariableName = Update-IndicesOfNodesWithValue -jsonArray $jsonArray -searchName "$configurationVariableName" -searchValue "$configurationVariableValue"

                    if (-not ([string]::IsNullOrEmpty($configurationVariableName)))
                    {				
                      #Set connection reference variables
                      if($configurationVariableName.StartsWith("connectionreference.user.", "CurrentCultureIgnoreCase")) {
                          $schemaName = $configurationVariableName -replace "connectionreference.user.", ""
                          $connRefResults = Get-CrmRecords -conn $conn -EntityLogicalName connectionreference -FilterAttribute "connectionreferencelogicalname" -FilterOperator "eq" -FilterValue $schemaName -Fields connectorid
                          if ($connRefResults.Count -gt 0){
                              $connectorId = $connRefResults.CrmRecords[0].connectorid
                              $connectionVariable = $configurationDataEnvironment.UserSettings | Where-Object { $_.Name -eq "connectionreference.$schemaName" } | Select-Object -First 1
                              $connectionVariableName = $connectionVariable.Name
                              $connectionVariableValue = $connectionVariable.Value
                              if($null -ne $connectionVariable) {
                                  $connRef = [PSCustomObject]@{"LogicalName"="$schemaName"; "ConnectionId"="#{$connectionVariableName}#"; "ConnectorId"= "$connectorId"; "ConnectionOwner"="#{$configurationVariableName}#" }
                                  if($usePlaceholders.ToLower() -eq 'false') {
                                      $connRef = [PSCustomObject]@{"LogicalName"="$schemaName"; "ConnectionId"="$connectionVariableValue"; "ConnectorId"= "$connectorId"; "ConnectionOwner"="$configurationVariableValue" }
                                  }
                                  $connectionReferences.Add($connRef)
                              }
                          }
                      }
                      elseif($configurationVariableName.StartsWith("environmentvariable.", "CurrentCultureIgnoreCase")) {
                          #Set environment variable variables
                          if(-not [string]::IsNullOrWhiteSpace($configurationVariableValue))
                          {
                              $schemaName = $configurationVariableName -replace "environmentvariable.", ""
                              $envVarResults =  Get-CrmRecords -conn $conn -EntityLogicalName environmentvariabledefinition -FilterAttribute "schemaname" -FilterOperator "eq" -FilterValue $schemaName -Fields type
                              if ($envVarResults.Count -gt 0){
                                  $type = $envVarResults.CrmRecords[0].type_Property.Value.Value
                                  Write-Host "configurationVariableValue is not null or empty - $configurationVariableValue"
                                  $envVar = [PSCustomObject]@{"SchemaName"="$schemaName"; "Value"="#{$configurationVariableName}#"}
                                  if($usePlaceholders.ToLower() -eq 'false') {
                                      $envVar = [PSCustomObject]@{"SchemaName"="$schemaName"; "Value"="$configurationVariableValue"}
                                  }
                                  $environmentVariables.Add($envVar)                                
                              }
                          }
                          else{
                              Write-Host "Environment variable $configurationVariableName is Null or Empty"
                          }
                      }
                      elseif($configurationVariableName.StartsWith("webhookurl.", "CurrentCultureIgnoreCase")) {
                          #Set WebHook URL variables
                          if(-not [string]::IsNullOrWhiteSpace($configurationVariableValue))
                          {
                              $schemaName = $configurationVariableName -replace "webhookurl.", ""
                              $endPointResults =  Get-CrmRecords -conn $conn -EntityLogicalName "serviceendpoint" -FilterAttribute "name" -FilterOperator "eq" -FilterValue $schemaName -Fields "name"
                              if ($endPointResults.Count -gt 0){
                                  $envVar = [PSCustomObject]@{"SchemaName"="$schemaName"; "Value"="#{$configurationVariableName}#"}
                                  if($usePlaceholders.ToLower() -eq 'false') {
                                      $envVar = [PSCustomObject]@{"SchemaName"="$schemaName"; "Value"="$configurationVariableValue"}
                                  }
                                  $webHookUrls.Add($envVar)                                
                              }
                          }
                          else{
                              Write-Host "Service Endpoint variable $configurationVariableName is Null or Empty for $environmentName"
                          }
                      }
                      elseif($configurationVariableName.StartsWith("sdkstep.", "CurrentCultureIgnoreCase")) {
                          #Set SDK Step configurations
                          if(-not [string]::IsNullOrWhiteSpace($configurationVariableValue))
                          {
                try{
                                  # SDK step configuration format will be "sdkstep.{unsec/sec}.{sdkmessageprocessingstep}"
                                  $sdkmessageprocessingstepid = $configurationVariableName -replace "sdkstep.unsec.", "" -replace "sdkstep.sec.", "" 
                                  Write-Host "Sdkmessageprocessingstepid - $sdkmessageprocessingstepid"
                                  $configKey = $configurationVariableName -replace "sdkstep.", "" 
                                  $sdkmessageprocessingstepRecord = Get-CrmRecord -conn $conn -EntityLogicalName "sdkmessageprocessingstep" -Id "$sdkmessageprocessingstepid" -Fields sdkmessageprocessingstepid
                                  if($null -ne $sdkmessageprocessingstepRecord){
                                      $sdkConfig = [PSCustomObject]@{"Config"="$configKey"; "Value"="#{$configurationVariableName}#"}
                                      if($usePlaceholders.ToLower() -eq 'false' -or $isDevEnvironment) {
                                          $sdkConfig = [PSCustomObject]@{"Config"="$configKey"; "Value"="$configurationVariableValue"}
                                      }
                                      $sdkMessages.Add($sdkConfig)
                                  }								
                              }
                              catch {
                                  Write-Host "Error occurred while retrieving the SDK step - $($_.Exception.Message)"
                              }                            
                          }
                          else{
                              Write-Host "SDK Message Variable $configurationVariableName value is either Null or Empty for $environmentName"
                          }
                      }
                      elseif($configurationVariableName.StartsWith("canvasshare.aadGroupId.", "CurrentCultureIgnoreCase")) {
                          $schemaSuffix = $configurationVariableName -replace "canvasshare.aadGroupId.", ""
                          $schemaName = $configurationVariableName.Split(".")[2]

                          $roleVariable = $configurationDataEnvironment.UserSettings | Where-Object { $_.Name -eq "canvasshare.roleName.$schemaSuffix" } | Select-Object -First 1
                          $canvasAppResults =  Get-CrmRecords -conn $conn -EntityLogicalName canvasapp -FilterAttribute "name" -FilterOperator "eq" -FilterValue $schemaName -Fields displayname
                          if($canvasAppResults.Count -gt 0 -and $null -ne $roleVariable) {
                              $canvasAppResult = $canvasAppResults.CrmRecords[0]
                              $roleVariableName = $roleVariable.Name
                              $roleVariableValue = $roleVariable.Value
                              $canvasConfig = [PSCustomObject]@{"aadGroupId"="#{$configurationVariableName}#"; "canvasNameInSolution"=$schemaName; "canvasDisplayName"= $canvasAppResult.displayname; "roleName"="#{$roleVariableName}#"}
                              if($usePlaceholders.ToLower() -eq 'false') {
                                  $canvasConfig = [PSCustomObject]@{"aadGroupId"="$configurationVariableValue"; "canvasNameInSolution"=$schemaName; "canvasDisplayName"= $canvasAppResult.displayname; "roleName"="$roleVariableValue"}
                              }
                              $canvasApps.Add($canvasConfig)
                          }
                      }
                      elseif($configurationVariableName.StartsWith("owner.ownerEmail.", "CurrentCultureIgnoreCase")) {
                          #Create the flow ownership deployment settings
                          $flowSplit = $configurationVariableName.Split(".")
                          $solutionComponentName = Get-Flow-Component-Name $configurationVariableName

                          $flowOwnerConfig = [PSCustomObject]@{"solutionComponentType"=29; "solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$flowSplit[$flowSplit.Count-1]; "ownerEmail"="#{$configurationVariableName}#"}
                          if($usePlaceholders.ToLower() -eq 'false') {
                              $flowOwnerConfig = [PSCustomObject]@{"solutionComponentType"=29; "solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$flowSplit[$flowSplit.Count-1]; "ownerEmail"="$configurationVariableValue"}
                          }
                          $componentOwnerships.Add($flowOwnerConfig)
                      }
                      elseif($configurationVariableName.StartsWith("canvasowner.ownerEmail.", "CurrentCultureIgnoreCase")) {
                          #Create the canvas ownership deployment settings
                          $canvasSplit = $configurationVariableName.Split(".")
                          $solutionComponentName = Get-Flow-Component-Name $configurationVariableName

                          $canvasOwnerConfig = [PSCustomObject]@{"solutionComponentType"=300; "solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$canvasSplit[$canvasSplit.Count-1]; "ownerEmail"="#{$configurationVariableName}#"}
                          if($usePlaceholders.ToLower() -eq 'false') {
                              $canvasOwnerConfig = [PSCustomObject]@{"solutionComponentType"=300; "solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$canvasSplit[$canvasSplit.Count-1]; "ownerEmail"="$configurationVariableValue"}
                          }
                          $componentOwnerships.Add($canvasOwnerConfig)
                      }
                      elseif($configurationVariableName.StartsWith("flow.sharing.", "CurrentCultureIgnoreCase")) {
                          $flowSplit = $configurationVariableName.Split(".")
                          $solutionComponentName = Get-Flow-Component-Name $configurationVariableName
                          $flowSharing = [PSCustomObject]@{"solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$flowSplit[$flowSplit.Count-1]; "aadGroupTeamName"="#{$configurationVariableName}#"}
                          if($usePlaceholders.ToLower() -eq 'false') {
                              $flowSharing = [PSCustomObject]@{"solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$flowSplit[$flowSplit.Count-1]; "aadGroupTeamName"="$configurationVariableValue"}
                          }
                          $flowSharings.Add($flowSharing)
                      }
                      elseif($configurationVariableName.StartsWith("activateflow.activate.", "CurrentCultureIgnoreCase")) {
                          Write-Host "Flow configurationVariableName - $configurationVariableName"
                          $flowSplit = $configurationVariableName.Split(".")

                          for($indxVariableParts=0;$indxVariableParts -lt $flowSplit.Count;$indxVariableParts++)
                          {
                              Write-Host "$indxVariableParts - " $flowSplit[$indxVariableParts]
                          }

                          $flowActivateOrderName = $configurationVariableName.Replace(".activate.", ".order.")

                          $flowActivateOrder = $configurationDataEnvironment.UserSettings | Where-Object { $_.Name -eq $flowActivateOrderName } | Select-Object -First 1

                          Write-Host "FlowActivateOrder - $flowActivateOrder"
                          #if($null -ne $flowActivateAs -and $null -ne $flowActivateOrder) {
                          if($null -ne $flowActivateOrder) {
                              $flowActivateOrderValue = $flowActivateOrder.Value
                          } else {
                              $flowActivateOrderValue = 0
                          }
                          $solutionComponentName = Get-Flow-Component-Name $configurationVariableName
                          $flowActivateConfig = [PSCustomObject]@{"solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$flowSplit[$flowSplit.Count-1]; "sortOrder"="#{$flowActivateOrderName}#"; "activate"="#{$configurationVariableName}#"}
                          if($usePlaceholders.ToLower() -eq 'false') {
                              $flowActivateConfig = [PSCustomObject]@{"solutionComponentName"=$solutionComponentName; "solutionComponentUniqueName"=$flowSplit[$flowSplit.Count-1]; "sortOrder"="$flowActivateOrderValue"; "activate"="$configurationVariableValue"}
                          }

                          # Convert the PSCustomObject to a JSON string
                          $jsonString = $flowActivateConfig | ConvertTo-Json

                          # Print the JSON string
                          Write-Host "FlowActivateConfig json string -" $jsonString							
                          $flowActivationUsers.Add($flowActivateConfig)
                      }
                      elseif($configurationVariableName.StartsWith("connector.teamname.", "CurrentCultureIgnoreCase")) {
                          $connectorSplit = $configurationVariableName.Split(".")
                          if($connectorSplit.length -eq 4){
                              $connectorSharingConfig = [PSCustomObject]@{"solutionComponentName"=$connectorSplit[2]; "solutionComponentUniqueName"=$connectorSplit[3]; "aadGroupTeamName"="#{$configurationVariableName}#"}
                              if($usePlaceholders.ToLower() -eq 'false') {
                                  $connectorSharingConfig = [PSCustomObject]@{"solutionComponentName"=$connectorSplit[2]; "solutionComponentUniqueName"=$connectorSplit[3]; "aadGroupTeamName"="$configurationVariableValue"}
                              }
                              $customConnectorSharings.Add($connectorSharingConfig)
                          }
                      }
                      elseif($configurationVariableName.StartsWith("groupTeam.", "CurrentCultureIgnoreCase")) {
                          $teamName = Get-Group-Team-Name $configurationVariableName
                          $teamGroupRoles = $configurationVariable.Data.split(',')
                          $businessUnitVariableName = $configurationVariableName.Replace("groupTeam", "businessUnit")
                          $teamBusinessUnit = $configurationDataEnvironment.UserSettings | Where-Object { $_.Name -eq $businessUnitVariableName } | Select-Object -First 1
                          $teamBusinessUnitValue = ""
                          if($null -ne $teamBusinessUnit) {
                              $teamBusinessUnitValue = $teamBusinessUnit.Value
                          }
                          $teamSkipRolesVariableName = $configurationVariableName.Replace("groupTeam", "teamnameskiproles")
                          Write-Host "teamSkipRolesVariableName - $teamSkipRolesVariableName"
                          $teamSkipRoles = $configurationDataEnvironment.UserSettings | Where-Object { $_.Name -eq $teamSkipRolesVariableName } | Select-Object -First 1
                          $teamSkipRolesValue = ""
                          if($null -ne $teamSkipRoles) {
                              $teamSkipRolesValue = $teamSkipRoles.Value
                          }
                          Write-Host "teamSkipRolesValue - $teamSkipRolesValue"
                          $groupTeamConfig = [PSCustomObject]@{"aadGroupTeamName"=$teamName; "aadGroupTeamBusinessUnitId"="#{$businessUnitVariableName}#"; "aadSecurityGroupId"="#{$configurationVariableName}#"; "dataverseSecurityRoleNames"=@($teamGroupRoles);"skipRolesDeletion"=$teamSkipRolesValue;}
                          if($usePlaceholders.ToLower() -eq 'false') {
                              $groupTeamConfig = [PSCustomObject]@{"aadGroupTeamName"=$teamName; "aadGroupTeamBusinessUnitId"="$teamBusinessUnitValue"; "aadSecurityGroupId"="$configurationVariableValue"; "dataverseSecurityRoleNames"=@($teamGroupRoles)}
                          }
                          $groupTeams.Add($groupTeamConfig)
                      }
                    }

                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                }
            } elseif($null -ne $configurationDataEnvironment.DeploymentSettings) {
                Update-Deployment-Settings-Slugs $configurationDataEnvironment.DeploymentSettings $usePlaceholders $newBuildDefinitionVariables $reservedVariables ([ref]$environmentVariables) ([ref]$connectionReferences) ([ref]$flowActivationUsers) ([ref]$customConnectorSharings) ([ref]$componentOwnerships) ([ref]$flowSharings) ([ref]$canvasApps) ([ref]$groupTeams) ([ref]$webHookUrls) ([ref]$sdkMessages)
            }

            if(Test-Path "$buildSourceDirectory\$repo\$solutionName\config\$environmentName\") {
                Write-Host "Deleting $buildSourceDirectory\$repo\$solutionName\config\$environmentName\*eploymentSettings.json"
                Remove-Item -Path "$buildSourceDirectory\$repo\$solutionName\config\$environmentName\*eploymentSettings.json" -Force
            }
            else {
                Write-Host "Creating $buildSourceDirectory\$repo\$solutionName\config" -Name "$environmentName" -ItemType "directory"
                New-Item "$buildSourceDirectory\$repo\$solutionName\config" -Name "$environmentName" -ItemType "directory"
            }

            #Create the deployment configuration
            $deploymentSettingsFilePath = "$buildSourceDirectory\$repo\$solutionName\config\$environmentName\deploymentSettings.json"
            $newConfiguration = [PSCustomObject]@{}
            $newConfiguration | Add-Member -MemberType NoteProperty -Name 'EnvironmentVariables' -Value $environmentVariables
            $newConfiguration | Add-Member -MemberType NoteProperty -Name 'ConnectionReferences' -Value $connectionReferences

            Write-Host "Creating deployment settings"
            $json = ConvertTo-Json -Depth 10 $newConfiguration
            $json = [System.Text.RegularExpressions.Regex]::Unescape($json)
            if ($PSVersionTable.PSVersion.Major -gt 5) {
                Set-Content -Path $deploymentSettingsFilePath -Value $json
            }
            else {
                $utf8NoBomEncoding = New-Object System.Text.UTF8Encoding $false
                $jsonBytes = $utf8NoBomEncoding.GetBytes($json)
                Set-Content -Path $deploymentSettingsFilePath -Value $jsonBytes -Encoding Byte
            }

            #Create the custom deployment configuration
            $customDeploymentSettingsFilePath = "$buildSourceDirectory\$repo\$solutionName\config\$environmentName\customDeploymentSettings.json"
            $newCustomConfiguration = [PSCustomObject]@{}
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'ActivateFlowConfiguration' -Value $flowActivationUsers
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'ConnectorShareWithGroupTeamConfiguration' -Value $customConnectorSharings
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'SolutionComponentOwnershipConfiguration' -Value $componentOwnerships
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'FlowShareWithGroupTeamConfiguration' -Value $flowSharings
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'AadGroupCanvasConfiguration' -Value $canvasApps
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'AadGroupTeamConfiguration' -Value $groupTeams
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'WebhookUrls' -Value $webHookUrls
            $newCustomConfiguration | Add-Member -MemberType NoteProperty -Name 'SDKMessages' -Value $sdkMessages            

            #Convert the updated configuration to json and store in customDeploymentSettings.json
            Write-Host "Creating custom deployment settings"
            $json = ConvertTo-Json -Depth 10 $newCustomConfiguration
            $json = [System.Text.RegularExpressions.Regex]::Unescape($json)
            Write-Host "Custom Deployment Settings - $json"
            if ($PSVersionTable.PSVersion.Major -gt 5) {
                Set-Content -Path $customDeploymentSettingsFilePath -Value $json
            }
            else {
                $utf8NoBomEncoding = New-Object System.Text.UTF8Encoding $false
                $jsonBytes = $utf8NoBomEncoding.GetBytes($json)
                Set-Content -Path $customDeploymentSettingsFilePath -Value $jsonBytes -Encoding Byte
            }
        }
        #Set the build variables
        Write-Host "Updating Build Definition Variables"
        Set-BuildDefinitionVariables $orgUrl $projectName $azdoAuthType $buildDefinitionResponseResults[0] $buildDefinitionResponseResults[0].id $newBuildDefinitionVariables
    }
}
<#
This function updates deployment settings that contains plain text values with placeholders. 
#>
function Update-Deployment-Settings-Slugs
{
    param(
        [Parameter(Mandatory)] [PSCustomObject][AllowNull()] $deploymentSettings,
        [Parameter(Mandatory)] [String]$usePlaceholders,
        [Parameter()] [PSCustomObject]$newBuildDefinitionVariables,
        [Parameter(Mandatory)] [System.Object]$reservedVariables,
        [Parameter(Mandatory)] [ref] $environmentVariables,
        [Parameter(Mandatory)] [ref] $connectionReferences,
        [Parameter(Mandatory)] [ref] $flowActivationUsers,
        [Parameter(Mandatory)] [ref] $customConnectorSharings,
        [Parameter(Mandatory)] [ref] $componentOwnerships,
        [Parameter(Mandatory)] [ref] $flowSharings,
        [Parameter(Mandatory)] [ref] $canvasApps,
        [Parameter(Mandatory)] [ref] $groupTeams,
        [Parameter(Mandatory)] [ref] $webHookUrls,
        [Parameter(Mandatory)] [ref] $sdkMessages
    )
    if($null -ne $deploymentSettings) {

        Write-Host "Updating Deployment Settings Slugs"
        if($null -ne $deploymentSettings.EnvironmentVariables) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($environmentVariable in $deploymentSettings.EnvironmentVariables) {
                    $configurationVariableName = "environmentvariable.$($environmentVariable.SchemaName)"
                    $configurationVariableValue = $environmentVariable.Value
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $environmentVariable.Value = "#{$configurationVariableName}#"
                }
            }
            $environmentVariables.Value = $deploymentSettings.EnvironmentVariables
        }
        if($null -ne $deploymentSettings.ConnectionReferences) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($connectionReference in $deploymentSettings.ConnectionReferences) {
                    $configurationVariableName = "connectionreference.$($connectionReference.LogicalName)"
                    $configurationVariableValue = $connectionReference.ConnectionId
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $connectionReference.ConnectionId = "#{$configurationVariableName}#"
                }
            }
            $connectionReferences.Value = $deploymentSettings.ConnectionReferences
        } 
        if($null -ne $deploymentSettings.ActivateFlowConfiguration) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($activateFlowConfiguration in $deploymentSettings.ActivateFlowConfiguration) {
                    $flowName = Update-IndicesOfNodesWithValue -jsonArray $deploymentSettings.ActivateFlowConfiguration -searchName $activateFlowConfiguration.solutionComponentName -searchValue $activateFlowConfiguration.solutionComponentUniqueName -searchProperty "solutionComponentName"
                    $configurationVariableName = "activateflow.$($flowName)"
                    $configurationVariableValue = $activateFlowConfiguration.solutionComponentUniqueName
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $activateFlowConfiguration.solutionComponentUniqueName = "#{$configurationVariableName}#"
                }
            }
            $flowActivationUsers.Value = $deploymentSettings.ActivateFlowConfiguration
        } 
        if($null -ne $deploymentSettings.ConnectorShareWithGroupTeamConfiguration) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($connectorSharing in $deploymentSettings.ConnectorShareWithGroupTeamConfiguration) {
                    #Unique Name
                    $configurationVariableName = "connector.$($connectorSharing.solutionComponentName)"
                    $configurationVariableValue = $connectorSharing.solutionComponentUniqueName
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $connectorSharing.solutionComponentUniqueName = "#{$configurationVariableName}#"
                    #Team Name
                    $configurationVariableName = "connector.teamname.$($connectorSharing.solutionComponentName)"
                    $configurationVariableValue = $connectorSharing.solutionComponentUniqueName
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $connectorSharing.solutionComponentUniqueName = "#{$configurationVariableName}#"
                }
            }
            $customConnectorSharings.Value = $deploymentSettings.ConnectorShareWithGroupTeamConfiguration
        } 
        if($null -ne $deploymentSettings.SolutionComponentOwnershipConfiguration) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($componentOwnership in $deploymentSettings.SolutionComponentOwnershipConfiguration) {
                    #Unique Name
                    $configurationVariableName = "owner.$($componentOwnership.solutionComponentName)"
                    $configurationVariableValue = $componentOwnership.solutionComponentUniqueName
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $componentOwnership.solutionComponentUniqueName = "#{$configurationVariableName}#"
                    #Email
                    $configurationVariableName = "owner.ownerEmail.$($componentOwnership.solutionComponentName)"
                    $configurationVariableValue = $componentOwnership.ownerEmail
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $componentOwnership.ownerEmail = "#{$configurationVariableName}#"
                }
            }
            $componentOwnerships.Value = $deploymentSettings.SolutionComponentOwnershipConfiguration
        } 
        if($null -ne $deploymentSettings.FlowShareWithGroupTeamConfiguration) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($flowSharing in $deploymentSettings.FlowShareWithGroupTeamConfiguration) {
                    #Unique Name
                    $configurationVariableName = "flow.$($connectorSharing.solutionComponentName)"
                    $configurationVariableValue = $flowSharing.solutionComponentUniqueName
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $flowSharing.solutionComponentUniqueName = "#{$configurationVariableName}#"
                    #Team Name
                    $configurationVariableName = "flow.sharing.$($flowSharing.solutionComponentName)"
                    $configurationVariableValue = $flowSharing.aadGroupTeamName
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $flowSharing.aadGroupTeamName = "#{$configurationVariableName}#"
                }
            }
            $flowSharings.Value = $deploymentSettings.FlowShareWithGroupTeamConfiguration
        } 
        if($null -ne $deploymentSettings.AadGroupCanvasConfiguration) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($canvasConfig in $deploymentSettings.AadGroupCanvasConfiguration) {
                    #AAD Group ID
                    $configurationVariableName = "canvasshare.aadGroupId.$($canvasConfig.canvasNameInSolution)"
                    $configurationVariableValue = $canvasConfig.aadGroupId
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $canvasConfig.aadGroupId = "#{$configurationVariableName}#"
                }
            }
            $canvasApps.Value = $deploymentSettings.AadGroupCanvasConfiguration
        }
        if($null -ne $deploymentSettings.AadGroupTeamConfiguration) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($aadGroupTeam in $deploymentSettings.AadGroupTeamConfigurations) {
                    #AAD Group ID
                    if($aadGroupTeam.PSobject.Properties.Name -contains "aadGroupTeamId") {
                        $configurationVariableName = "groupTeam.$($aadGroupTeam.aadGroupTeamId).$($aadGroupTeam.aadGroupTeamName)"
                    }
                    else {
                        $configurationVariableName = "groupTeam.$($aadGroupTeam.aadGroupTeamName)"
                    }
                    $configurationVariableValue = $aadGroupTeam.aadSecurityGroupId
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $aadGroupTeam.aadSecurityGroupId = "#{$configurationVariableName}#"

                    #Business Unit ID
                    if($aadGroupTeam.PSobject.Properties.Name -contains "aadGroupTeamId") {
                        $configurationVariableName = "businessunit.$($aadGroupTeam.aadGroupTeamId).$($aadGroupTeam.aadGroupTeamName)"
                    }
                    else {
                        $configurationVariableName = "businessunit.$($aadGroupTeam.aadGroupTeamName)"
                    }
                    $configurationVariableValue = $aadGroupTeam.aadGroupTeamBusinessUnitId
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $aadGroupTeam.aadGroupTeamBusinessUnitId = "#{$configurationVariableName}#"
                }
            }
            $groupTeams.Value = $deploymentSettings.AadGroupTeamConfiguration
        } 
        if($null -ne $deploymentSettings.WebhookUrls) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($webHook in $deploymentSettings.WebhookUrls) {
                    #Webhook Url
                    $configurationVariableName = "webhookurl.$($webHook.SchemaName)"
                    $configurationVariableValue = $webHook.Value
                    Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                    $webHook.Value = "#{$configurationVariableName}#"
                }
            }
            $webHookUrls.Value = $deploymentSettings.WebhookUrls
        } 
        if($null -ne $deploymentSettings.SDKMessages) {
            if($usePlaceholders.ToLower() -ne 'false') {
                foreach($sdkMessage in $deploymentSettings.SDKMessages) {
                    #Webhook Url
                    $split = $sdkMessage.Config.Split(".")
                    if($split.length -eq 2) {
                        $sdkMessage.Config = $split[1]
                        $configurationVariableName = "sdkstep.$split[0].$($webHook.SchemaName)"
                        $configurationVariableValue = $webHook.Value
                        Add-Pipeline-Variable $configurationVariableName $configurationVariableValue $newBuildDefinitionVariables $reservedVariables
                        $sdkMessage.Value = "#{$configurationVariableName}#"
                    }
                }
            }
            $sdkMessages.Value = $deploymentSettings.SDKMessages
        }
    }
}
<#
This function adds or updates a variable on the build definition.
#>
function Add-Pipeline-Variable
{
    param(
        [Parameter(Mandatory)] [String] $configurationVariableName,
        [Parameter(Mandatory)] [String] [AllowEmptyString()]$configurationVariableValue,
        [Parameter(Mandatory)] [System.Object] [AllowNull()]$newBuildDefinitionVariables,
        [Parameter(Mandatory)] [System.Object]$reservedVariables
    )

    #See if the variable already exists
    if($null -ne $newBuildDefinitionVariables) {
        $found = Get-Parameter-Exists $configurationVariableName $newBuildDefinitionVariables                
        #Add the configuration variable to the list of pipeline variables if usePlaceholders is not false
        if($usePlaceholders.ToLower() -ne 'false') {
            #If the variable was not found create it 
            if(!$found) { 
                $newBuildDefinitionVariables | Add-Member -MemberType NoteProperty -Name $configurationVariableName -Value @{value = ''}
            }

            # Set the value to the value passed in on the configuration data
            if($null -eq $configurationVariableValue -or [string]::IsNullOrWhiteSpace($configurationVariableValue)) {
                $newBuildDefinitionVariables.$configurationVariableName.value = ''
            } else {
                $newBuildDefinitionVariables.$configurationVariableName.value = $configurationVariableValue
            }
        }
        elseif($reservedVariables -contains $configurationVariableName) {
            #If the variable is in the reserved variables list then set the value to the value passed in on the configuration data
            if(!$found) { 
                $newBuildDefinitionVariables | Add-Member -MemberType NoteProperty -Name $configurationVariableName -Value @{value = ''}
            }
            $newBuildDefinitionVariables.$configurationVariableName.value = $configurationVariableValue
        }
    }

}
<#
This function creates the deployment pipeline definitions.
#>
function New-DeploymentPipelines
{
    param (
        [Parameter(Mandatory)] [String]$buildProjectName,
        [Parameter(Mandatory)] [String]$buildRepositoryName,
        [Parameter(Mandatory)] [String]$orgUrl,
        [Parameter(Mandatory)] [String]$projectName,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$azdoAuthType,
        [Parameter(Mandatory)] [String] [AllowEmptyString()] $pat,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter()] [System.Object[]] [AllowEmptyCollection()]$configurationData,
        [Parameter()] [String]$agentOS,
        [Parameter()] [String]$solutionRepoId,
        [Parameter(Mandatory)] [String]$pipelineSourceDirectory,
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$currentBranch,
        [Parameter(Mandatory)] [String]$createSolutionBranch,
        [Parameter(Mandatory)] [String]$agentPool
    )
    if($null -ne $configurationData -and $configurationData.length -gt 0) {
        Write-Host "Retrieved " $configurationData.length " deployment environments"
        $branchResourceUrl = "$orgUrl$projectName/_apis/git/repositories/$repo/refs?filter=heads/$solutionName&api-version=6.0"
        Write-Host "BranchResourceUrl - "$branchResourceUrl
        $branchResourceResponse = Invoke-RestMethod $branchResourceUrl -Method Get -Headers @{
            Authorization = "$azdoAuthType  $env:SYSTEM_ACCESSTOKEN"
        }
        $branchResourceResults = $branchResourceResponse.value
        Write-Host "Retrieved " $branchResourceResults.length " branch"

        #Update / Create Deployment Pipelines
        Write-Host "Fetching build definitions in all repos"
        $buildDefinitionResourceUrl = "$orgUrl$projectName/_apis/build/definitions?name=deploy-*-$solutionName&includeAllProperties=true&api-version=6.0"
        Write-Host "BuildDefinitionResourceUrl - "$buildDefinitionResourceUrl
        $fullBuildDefinitionResponse = Invoke-RestMethod $buildDefinitionResourceUrl -Method Get -Headers @{
            Authorization = "$azdoAuthType  $env:SYSTEM_ACCESSTOKEN"
        }

        if($fullBuildDefinitionResponse.count -gt $deploymentConfigurationData.length) {
            Write-Host "Fetching build definitions under the repo - $repo"
            $buildDefinitionResourceUrl = "$orgUrl$projectName/_apis/build/definitions?repositoryId=$solutionRepoId&repositoryType=TfsGit&name=deploy-*-$solutionName&includeAllProperties=true&api-version=6.0"
            $fullBuildDefinitionResponse = Invoke-RestMethod $buildDefinitionResourceUrl -Method Get -Headers @{
                Authorization = "$azdoAuthType  $env:SYSTEM_ACCESSTOKEN"
            }
        }
        $buildDefinitionResponseResults = $fullBuildDefinitionResponse.value
        Write-Host "Retrieved " $buildDefinitionResponseResults.length " builds"

        $deploymentConfigurationData = $configurationData
        
        Write-Host "Retrieved " $deploymentConfigurationData.length " deployment configurations"

        Write-Host "Creating new deployment pipelines"
        $settings= ""
        $environmentNames = ""
        foreach($deploymentEnvironment in $deploymentConfigurationData) {
            Write-Host "Environment Name: " $deploymentEnvironment.DeploymentEnvironmentName
            if(-Not [string]::IsNullOrWhiteSpace($settings)) {
                $settings = $settings + ","
            }

            if(-Not [string]::IsNullOrWhiteSpace($environmentNames)) {
                $environmentNames = $environmentNames + "|"
            }

            if(-Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.DeploymentEnvironmentUrl) -and -Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.DeploymentEnvironmentName)) {
                $environmentNames = $environmentNames + $deploymentEnvironment.DeploymentEnvironmentName
                $settings = $settings + $deploymentEnvironment.DeploymentEnvironmentName.ToLower() + "=" + $deploymentEnvironment.DeploymentEnvironmentUrl
            }

            if(-Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.ServiceConnectionName) -and -Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.DeploymentEnvironmentName)) {
                if(-Not [string]::IsNullOrWhiteSpace($settings)) {
                    $settings = $settings + ","
                }
                $settings = $settings + $deploymentEnvironment.DeploymentEnvironmentName.ToLower() + "-scname=" + $deploymentEnvironment.ServiceConnectionName
            }

            if(-Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.VariableGroup) -and -Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.DeploymentEnvironmentName)) {
                if(-Not [string]::IsNullOrWhiteSpace($settings)) {
                    $settings = $settings + ","
                }
                $settings = $settings + $deploymentEnvironment.DeploymentEnvironmentName.ToLower() + "-variablegroup=" + $deploymentEnvironment.VariableGroup
            }

            if(-Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.BuildName) -and -Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.BuildName)) {
                if(-Not [string]::IsNullOrWhiteSpace($settings)) {
                    $settings = $settings + ","
                }
                $settings = $settings + $deploymentEnvironment.DeploymentEnvironmentName.ToLower() + "-buildname=" + $deploymentEnvironment.BuildName
            }

            if(-Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.BuildTemplate) -and -Not [string]::IsNullOrWhiteSpace($deploymentEnvironment.BuildTemplate)) {
                if(-Not [string]::IsNullOrWhiteSpace($settings)) {
                    $settings = $settings + ","
                }
                $settings = $settings + $deploymentEnvironment.DeploymentEnvironmentName.ToLower() + "-buildtemplate=" + $deploymentEnvironment.BuildTemplate
            }
        }
        if(-Not [string]::IsNullOrWhiteSpace($settings)) {
            $settings = $settings + ",environments=" + $environmentNames
            Write-Host "Settings: " $settings

            $currentPath = Get-Location
            Set-Location "$pipelineSourceDirectory"
            try{
                . "$env:POWERSHELLPATH/branch-pipeline-policy.ps1"
                if($branchResourceResults.length -eq 0 -or $buildDefinitionResponseResults.length -lt $deploymentConfigurationData.length) {
                    Write-Host "Branch creation start"
                    $solutionProjectRepo = Invoke-Create-Branch "$orgUrl" "$buildProjectName" "$projectName" "$repo" "$buildRepositoryName" "$pipelineSourceDirectory" "$buildSourceDirectory" "$solutionName" "$environmentNames" "$azdoAuthType" "$solutionRepoId" "$agentPool" "$currentBranch" "$createSolutionBranch" "$pipelineStageRunId"

                    if($null -ne $solutionProjectRepo){
                        Write-Host "Creation of build definitions start"
                        Update-Build-for-Branch "$orgUrl" "$projectName" "$azdoAuthType" "$environmentNames" "$solutionName" $solutionProjectRepo "$settings" "$solutionRepoId" "$buildRepositoryName" "$buildSourceDirectory" "$currentBranch" "$agentPool" "$pipelineStageRunId"
                        Write-Host "Setting up branch policy start"
                        Set-Branch-Policy "$orgUrl" "$projectName" "$azdoAuthType" "$environmentNames" "$solutionName" $solutionProjectRepo "$settings" "$solutionRepoId" "$agentPool"
                    }
                } else {
                    # Generate 'pipelines' content for all environments if they don't exist
                    foreach ($environmentName in $environmentNames.Split('|')) {
                        Write-Host "Check if content yml file available for $environmentName. If not download and create them."
                        # Fetch Commit Changes Collection
                        Get-Git-Commit-Changes "$orgUrl" "$buildProjectName" "$projectName" "$repo" "$pipelineSourceDirectory" "$buildRepositoryName" "$buildSourceDirectory" "$solutionName" "$environmentName" "$agentPool" "$pipelineStageRunId"
                    }
                }
            }
            catch{
                # Code to handle the error goes here
                Write-Host "An error occurred during Branch creation with definitions and policy configurations : $($_.Exception.Message)"
            }
            Set-Location $currentPath
        }
    }
}

<#
This function reads variables from deployment settings and update pipeline variables.
#>
function Set-BuildDefinitionVariables {
    param (
        [Parameter(Mandatory)] [String]$orgUrl,
        [Parameter(Mandatory)] [String]$projectName,
        [Parameter(Mandatory)] [String]$azdoAuthType,
        [Parameter()] [PSCustomObject]$buildDefinitionResult,
        [Parameter()] [String]$definitionId,
        [Parameter()] [PSCustomObject] [AllowNull()]$newBuildDefinitionVariables
    )
    if($null -ne $newBuildDefinitionVariables) {
        #Set the build definition variables to the newly created list
        ([pscustomobject]$buildDefinitionResult.variables) = ([pscustomobject]$newBuildDefinitionVariables)
        $buildDefinitionResourceUrl = "$orgUrl$projectName/_apis/build/definitions/" + $definitionId + "?api-version=6.0"
        $headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
        $headers.Add("Authorization", "$azdoAuthType  $env:SYSTEM_ACCESSTOKEN")
        $headers.Add("Content-Type", "application/json")
        $body = ConvertTo-Json -Depth 10 $buildDefinitionResult
        #remove tab charcters from the body
        $body = $body -replace "`t", ""
        #remove newline charcters from the body
        $body = $body -replace '([^\\])\\n', '$1'
        Write-Host "Body - $body"
        Write-Host "BuildDefinitionResourceUrl - " $buildDefinitionResourceUrl
        Invoke-RestMethod $buildDefinitionResourceUrl -Method 'PUT' -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) | Out-Null   
    }
}

function Invoke-Create-Update-PipelineStageRun-Parameter{
    param (
        [Parameter()] [String]$PipelineStageRunId,
        [Parameter()] [String]$PipelineServiceConnectionName,
        [Parameter()] [String]$PipelineServiceConnectionUrl,
        [Parameter()] [PSCustomObject][AllowNull()]$newBuildDefinitionVariables
    )
    Write-Host "Inside Invoke-Create-Update-PipelineStageRun-Parameter"
    Write-Host "newBuildDefinitionVariables - $newBuildDefinitionVariables"
     if($null -ne $newBuildDefinitionVariables){
        #If the "ServiceConnection" variable was not found create it 
        $found = Get-Parameter-Exists "PipelineStageRunId" $newBuildDefinitionVariables
        if(!$found) { 
            $newBuildDefinitionVariables | Add-Member -MemberType NoteProperty -Name "PipelineStageRunId" -Value @{value = ''}
        }

        $newBuildDefinitionVariables.PipelineStageRunId.value = $PipelineStageRunId

        $found = Get-Parameter-Exists "PipelineServiceConnectionName" $newBuildDefinitionVariables
        if(!$found) { 
            $newBuildDefinitionVariables | Add-Member -MemberType NoteProperty -Name "PipelineServiceConnectionName" -Value @{value = ''}
        }

        $newBuildDefinitionVariables.PipelineServiceConnectionName.value = $PipelineServiceConnectionName        

        $found = Get-Parameter-Exists "PipelineServiceConnectionUrl" $newBuildDefinitionVariables
        if(!$found) { 
            $newBuildDefinitionVariables | Add-Member -MemberType NoteProperty -Name "PipelineServiceConnectionUrl" -Value @{value = ''}
        }

        $newBuildDefinitionVariables.PipelineServiceConnectionUrl.value = $PipelineServiceConnectionUrl        

    }
    Write-Host "newBuildDefinitionVariables - $newBuildDefinitionVariables"
}

<#
This function creates or updates the service connection parameters.
#>
function Invoke-Create-Update-ServiceConnection-Parameters{
    param (
        [Parameter()] [String]$DeploymentEnvironmentUrl,
        [Parameter()] [String]$ServiceConnectionName,
        [Parameter()] [PSCustomObject][AllowNull()]$newBuildDefinitionVariables
    )
    Write-Host "Inside Invoke-Create-Update-ServiceConnection-Parameters"
    Write-Host "newBuildDefinitionVariables - $newBuildDefinitionVariables"
     if($null -ne $newBuildDefinitionVariables){
        #If the "ServiceConnection" variable was not found create it 
        $found = Get-Parameter-Exists "ServiceConnection" $newBuildDefinitionVariables
        if(!$found) { 
            $newBuildDefinitionVariables | Add-Member -MemberType NoteProperty -Name "ServiceConnection" -Value @{value = ''}
        }

        #If the "ServiceConnectionUrl" variable was not found create it 
        $found = Get-Parameter-Exists "ServiceConnectionUrl" $newBuildDefinitionVariables
        if(!$found) { 
            $newBuildDefinitionVariables | Add-Member -MemberType NoteProperty -Name "ServiceConnectionUrl" -Value @{value = ''}
        }

		# If the "$ServiceConnectionName" variable was not found, use $DeploymentEnvironmentUrl
		if([string]::IsNullOrEmpty($ServiceConnectionName))
		{
			$ServiceConnectionName = $DeploymentEnvironmentUrl
        }
        $newBuildDefinitionVariables.ServiceConnection.value = $ServiceConnectionName
        $newBuildDefinitionVariables.ServiceConnectionUrl.value = $DeploymentEnvironmentUrl
    }
}

<#
This is child function. Checks whether the parameter exists in pipeline definition.
#>
function Get-Parameter-Exists{
    param (
        [Parameter()] [String]$configurationVariableName,
        [Parameter()] [PSCustomObject][AllowNull()]$newBuildDefinitionVariables
    )
    $found = $false
    if($null -ne $newBuildDefinitionVariables){
        foreach($buildVariable in $newBuildDefinitionVariables.PSObject.Properties) {
            if($buildVariable.Name -eq $configurationVariableName) {
                $found = $true
                break
            }
         }
     }

     return $found
}

<#
This is child function. Parses and retrieves the group team name.
#>
function Get-Group-Team-Name{
    param (
        [Parameter()] [String]$configurationVariableName
    )

    $teamName = ""
    $seperator=""
    $arrVariableParts = $configurationVariableName.split('.')

    if($arrVariableParts.Count -gt 2)
    {
        for($indxVariableParts=2;$indxVariableParts -lt $arrVariableParts.Count;$indxVariableParts++)
        {
            $teamName += $seperator + $arrVariableParts[$indxVariableParts]
            $seperator='.'
        }
    }

    Write-Host "teamName - $teamName"
    return $teamName
}

<#
This is child function. Parses and gets flow component name.
'Flow component name' starts from split[2] to split[n-2]; if contains periods
#>
function Get-Flow-Component-Name{
    param (
        [Parameter()] [String]$configurationVariableName
    )

    $flowComponentName = ""
    $seperator=""
    $arrVariableParts = $configurationVariableName.split('.')

    if($arrVariableParts.Count -gt 4)
    {
        for($indxVariableParts=2;$indxVariableParts -lt $arrVariableParts.Count-1;$indxVariableParts++)
        {
            $flowComponentName += $seperator + $arrVariableParts[$indxVariableParts]
            $seperator='.'
        }
    }
    elseif($arrVariableParts.Count -eq 4){
       $flowComponentName = $arrVariableParts[2]
    }

    #Write-Host "flowComponentName - $flowComponentName"
    return $flowComponentName
}

<#
Read 'Portal Settings File' attached to 'User Settings' for each Environment
Create or Override 'Portal Settings' files under .\PowerPages\Websitename\deployment-profiles
#>
function Set-PortalSettings-Files
{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$buildRepositoryName,
        [Parameter(Mandatory)] [String]$serviceConnection,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$webSiteName,
        [Parameter()] [String]$token
    )

    . "$env:POWERSHELLPATH/dataverse-webapi-functions.ps1"
    $dataverseHost = Get-HostFromUrl "$serviceConnection"
    #Write-Host "dataverseHost - $dataverseHost"

    Write-Host "Inside Set-PortalSettings-Files"
    $configurationData = $env:DEPLOYMENT_SETTINGS | ConvertFrom-Json

    . "$env:POWERSHELLPATH/portal-functions.ps1"
    $powerPagesFolderPath = "$buildSourceDirectory\$buildRepositoryName\$solutionName\PowerPages\$webSiteName\"
    # Check if Power Pages folder available
    if(Test-Path $powerPagesFolderPath){
        #Loop through the build definitions we found and update the pipeline variables based on the placeholders we put in the deployment settings files.
        foreach($configurationDataEnvironment in $configurationData)
        {
            $userSettingIdAvailable = $false
            $environmentName = $configurationDataEnvironment.DeploymentEnvironmentName
            Write-Host "EnvironmentName - $environmentName"
            if($null -ne $configurationDataEnvironment -and $null -ne $configurationDataEnvironment.UserSettings) {
                foreach($configurationVariable in $configurationDataEnvironment.UserSettings) {
                    $configurationVariableName = $configurationVariable.Name
                    $configurationVariableValue = $configurationVariable.Value
                    if($configurationVariableName.StartsWith("UserSettingId", "CurrentCultureIgnoreCase")) {
                        $userSettingIdAvailable = $true
                        $userSettingId = $configurationVariableValue
                        if (-not [string]::IsNullOrEmpty($userSettingId)){
                            Write-Host "userSettingId - $userSettingId available for environment $environmentName"
                            $responseUserSetting = Get-UserSetting-by-Id $token $dataverseHost $userSettingId
                            if($null -ne $responseUserSetting -and $null -ne $responseUserSetting.value -and $responseUserSetting.value.count -gt 0){
                               # Read portalsettingscontent
                               $portalsettingsBase64content = Read-File-Content "$token" "$dataverseHost" "cat_portalsettingfile" "$userSettingId"
                               # Convert Base64 to Plain Text
                               $portalsettingscontent = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("$portalsettingsBase64content"))
                               Write-Host "portalsettingscontent - $portalsettingscontent"
                               if($portalsettingscontent){
                                    Write-Host "Creating or overriding deployment setting file for $environmentName environment"
                                    Invoke-Create-Or-Override-Profile-File "$buildSourceDirectory\$buildRepositoryName\$solutionName\PowerPages\$webSiteName\" "$environmentName" "$portalsettingscontent"
                               }
                               else{
                                   Write-Host "portalsettingscontent is empty"
                               }
                            }
                            else{
                                Write-Host "User Setting with Id $userSettingId for $environmentName either invalid or does not have portalsettings file"
                            }
                        }
                        else{
                            Write-Host "User Setting Id is Null or Empty"
                        }
                    }
                }
            }

            if($userSettingIdAvailable -eq $false){
                Write-Host "UserSettingId variable unavailable for $environmentName environment"
            }
        }
    }
    else{
        Write-Host "Power pages folder path $powerPagesFolderPath unavailable. Exiting."
    }
}

<# 
Fetch 'User Setting' record, if the 'Portal Settings Content' field has data. Else return $null
#>
function Get-UserSetting-by-Id {
    param (
        [Parameter(Mandatory)] [String]$token,
        [Parameter(Mandatory)] [String]$dataverseHost,
        [Parameter(Mandatory)] [String]$userSettingId
    )
    $responseUserSetting = $null
    #$queryUserSetting = 'cat_usersettings?$filter=cat_portalsettingfile ne null and cat_usersettingid eq ' + "'$userSettingId'" + '&$select=cat_portalsettingscontent'
    $queryUserSetting = 'cat_usersettings?$filter=cat_portalsettingfile ne null and cat_usersettingid eq ' + "'$userSettingId'" + '&$select=cat_usersettingid'
    try{
        Write-Host "User setting Query - $queryUserSetting"
        $responseUserSetting = Invoke-DataverseHttpGet $token $dataverseHost $queryUserSetting
    }
    catch{
        Write-Host "Error $queryUserSetting - $($_.Exception.Message)"
    }

    return $responseUserSetting
}

<# 
This function reads the 'File' column data from custom deployment settings.
'File' column contains portal website deployment configuration files.
#>
function Read-File-Content {
    param (
        [Parameter()] [String]$token,
        [Parameter(Mandatory)] [String]$dataverseHost,
        [Parameter(Mandatory)] [String]$fileAttributeName,
        [Parameter()] [String]$userSettingId
    )
    Write-Host "Inside Read-File-Content"
    $portalsettingsBase64content = $null

    try{
        $requestBody = @{
            Target = @{
                cat_usersettingid = "$userSettingId"
                "@odata.type" = "Microsoft.Dynamics.CRM.cat_usersetting"
            }
            FileAttributeName = "$fileAttributeName"
        } | ConvertTo-Json

        Write-Host "requestBody - $requestBody"
    
        $requestUrlRemainder = "InitializeFileBlocksDownload"
        $response = Invoke-DataverseHttpPost $token $dataverseHost $requestUrlRemainder $requestBody
        Write-Host "response - $response"

        if ($null -ne $response -and -not $response.IsEmpty){
            # Read FileContinuationToken and call 'InitializeFileBlocksDownload'
            $fileSizeInBytes = $response.FileSizeInBytes
            $fileContinuationToken = $response.FileContinuationToken

            Write-Host "fileContinuationToken - $fileContinuationToken"
            Write-Host "fileSizeInBytes - $fileSizeInBytes"

            $requestBody = @{
               "Offset" = 0
               "BlockLength" = $fileSizeInBytes
               "FileContinuationToken" = "$fileContinuationToken"
            } | ConvertTo-Json

            Write-Host "requestBody - $requestBody"
            $requestUrlRemainder = "DownloadBlock"
            $responseDownloadBlock = Invoke-DataverseHttpPost $token $dataverseHost $requestUrlRemainder $requestBody
            Write-Host "responseDownloadBlock - $responseDownloadBlock"

            if($responseDownloadBlock){
                $portalsettingsBase64content = $responseDownloadBlock.Data
                Write-Host "Reading portalsettingsBase64content from responseDownloadBlock - $portalsettingsBase64content"
            }
            else{
                Write-Host "DownloadBlock response is NullorEmpty"
            }
        }
        else{
            Write-Host "InitializeFileBlocksDownload response is NullorEmpty"
        }
    }
    catch {
        Write-Host "An error occurred in Read-File-Content: $($_.Exception.Message)"
    }

    return $portalsettingsBase64content
}

<#
Fetches the Repository Id by Name.
#>
function Get-RepositoryIdbyName {
    param (
        [Parameter(Mandatory)] [String]$orgUrl,
        [Parameter(Mandatory)] [String]$buildProjectName,
        [Parameter(Mandatory)] [string]$azdoAuthType,
        [Parameter(Mandatory)] [string]$repoNameToSearch
    )

    $repoId = $null
    $uriRepos = "$orgUrl$buildProjectName/_apis/git/repositories"
    
    try {
        $reposResponse = Invoke-RestMethod $uriRepos -Method Get -Headers @{
            Authorization = "$azdoAuthType  $env:SYSTEM_ACCESSTOKEN"
        }

        # Find the repository ID based on the repository name
        $repository = $reposResponse.value | Where-Object {$_.name -eq $repoNameToSearch}

        # Check if repository found
        if ($repository) {
            return $repository.id
        } else {
            Write-Error "Repository not found with name '$repoNameToSearch'"
            return $null
        }
    }
    catch {
        Write-Host "Error while retrieving repositories. " $_.Exception.Message
    }

    return $defaultQueue
}