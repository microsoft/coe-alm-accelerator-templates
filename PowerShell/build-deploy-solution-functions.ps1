﻿function Process-old-canvas-code-folder-structure
{
    param (
        [Parameter(Mandatory)] [String]$sourcesDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$agentOS,
        [Parameter(Mandatory)] [String]$tempDirectory
    )

   if ($agentOS -eq "Linux") {
       $pacPath = $env:POWERPLATFORMTOOLS_PACCLIPATH + "/pac_linux/tools"
       $env:PATH = $env:PATH + ":" + $pacPath #note colon delimeter in path for linux
   }
   else {
       $pacPath = $env:POWERPLATFORMTOOLS_PACCLIPATH + "\pac\tools"
       $env:PATH = $env:PATH + ";" + $pacPath #note semi-colon delimeter in path for windows
   }   
   $solutionSource = "$sourcesDirectory\$repo\$solutionName"
   # We need to keep the source of the canvas app in temp for later use in canvas test automation
   Copy-Item $solutionSource -Destination "$tempDirectory\$solutionName" -Recurse -Force
   Get-ChildItem -Path $solutionSource -Recurse -Filter *_msapp_src | 
   ForEach-Object {     
     $unpackedPath = $_.FullName
     $packedFileName = $unpackedPath.Replace("_msapp_src", ".msapp")
     if(!(Test-Path $packedFileName)) {
        #Temporarily unpacking with latest version of Power Apps Language Tooling
        Write-Host "Packing cavas app source files into msapp"
       pac canvas pack --sources $unpackedPath --msapp $packedFileName
     }
     else {
        Write-Host "$packedFileName already exists. Skipping packing of the app."
     }

    # We need to copy the old folder structure for canvas app source into the new
    # folder structure used by "pac solution pack --processCanvasApps" which is what
    # the Azure DevOps task uses
    $newCanvasAppSourceDirectory = $packedFileName.Split("\")[-1].Replace("_DocumentUri.msapp","")
    Copy-Item -Path $unpackedPath -Destination "$solutionSource\SolutionPackage\CanvasApps\src\$newCanvasAppSourceDirectory" -Recurse -Force
    Remove-Item -Path $unpackedPath -Recurse
   }
}

function Get-managed-solution-zip-path
{
    param (
        [Parameter(Mandatory)] [String]$artifactDropPath,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$triggerSolutionUpgrade
    )

    $managedSolutionPath = ''
    Write-Host "artifactDropPath - $artifactDropPath"
    #Attempt to find the managed solution in the build pipeline drop if build and deploy are seperate pipelines
    Get-ChildItem -Path "$artifactDropPath" -Filter "$solutionName*.zip" | 
    ForEach-Object {
        If ($_.FullName.Contains("_managed")) 
        { 
            $managedSolutionPath = $_.FullName 
        }
    }
    Write-Host "##vso[task.setVariable variable=ManagedSolutionPath]$managedSolutionPath"

    #Set TriggerSolutionUpgrade to false if the variable is not set
    if("$triggerSolutionUpgrade".Contains("TriggerSolutionUpgrade")) {
        Write-Host "##vso[task.setVariable variable=TriggerSolutionUpgrade]false"
    }
}

function Check-if-Deployment-Settings-Exist
{
    param (
        [Parameter()] [String]$environmentName,
        [Parameter(Mandatory)] [String]$configPath
    )

    $settingFiles = @("deploymentSettings","customDeploymentSettings")
    #Temporary workaround for naming convention mismatches. Needs to fix this issue with convention vs. configuration. This will be cleaned up via https://github.com/microsoft/coe-starter-kit/issues/1960
    if($environmentName -eq 'Validate') { $environmentName = 'Validation' }
    if($environmentName -eq 'Production') { $environmentName = 'Prod' }
    
    foreach ($settingFile in $settingFiles) {
        $deploymentSettingsPath = ''
        $path = "$configPath$settingFile-$environmentName.json"
        Write-Host "Artifact Path: $path"
        if(Test-Path "$path")
        {
            $deploymentSettingsPath = "$path"
        }
        else
        {
            $path = "$configPath$environmentName\$settingFile.json"
            Write-Host "Environment Path: $path"
            if(Test-Path "$path") {
                $deploymentSettingsPath = "$path"
            }
            else
            {
                $path = "$configPath$settingFile.json"
                Write-Host "Default Path: $path"
                if(Test-Path "$path")
                {
                    $deploymentSettingsPath = "$path"
                }
            }
        }

        Write-Host "Deployment Settings Path: $deploymentSettingsPath"
        
        if($settingFile -eq "deploymentSettings")
        {
            Write-Host "##vso[task.setVariable variable=DeploymentSettingsPath]$deploymentSettingsPath"
            $useDeploymentSettings = 'false'
            if($deploymentSettingsPath -ne '') {
                $useDeploymentSettings = 'true'
            }
            Write-Host "##vso[task.setVariable variable=UseDeploymentSettings]$useDeploymentSettings"
        }
        else
        {
            Write-Host "##vso[task.setVariable variable=CustomDeploymentSettingsPath]$deploymentSettingsPath"
        }
    }
}

function set-deployment-variable
{
    param (
        [Parameter()] [String]$deploymentSettingsPath,
        [Parameter(Mandatory)] [String]$deploymentSettingsNode,
        [Parameter(Mandatory)] [String]$variableName,
        [Parameter(Mandatory)] [String]$BuildDirectory
    )

    # The if statement below is checking to see if the variable has been set in the pipeline. If it hasn't been set the value of the variable will be the name of the variable (e.g. $(SomeDeploymentVariable) it should be safe to check for the characters '$(' to determine if it's been set
    Write-Host "Setting variable from $deploymentSettingsPath"
    $variableValue = ""
    if (-not ([string]::IsNullOrEmpty("$deploymentSettingsPath"))){
        $deploymentSettings = Get-Content "$deploymentSettingsPath" | ConvertFrom-Json
        $settingsNode = $deploymentSettings.$deploymentSettingsNode
        if($null -ne $settingsNode) {
            Write-Host "Found settings node in $deploymentSettingsNode"
            $settingsJson = $settingsNode | ConvertTo-Json
            if ($settingsJson -ne '') {
                $variableValue = "$BuildDirectory\$variableName.json"
                if (Test-Path $variableValue) {
                    Remove-Item $variableValue
                }
                Write-Host "Writing to file $variableValue"
                Write-Host $settingsJson
                $settingsJson | Out-File $variableValue -Encoding utf8NoBOM
            }
        }
    }
    # Set the deployment variable for use elsewhere
    Write-Host "##vso[task.setvariable variable=$variableName;]$variableValue"
}

function Set-Solution-Exists
{
    param (
        [Parameter(Mandatory)] [String]$microsoftPowerAppsAdministrationPowerShellModule,
        [Parameter(Mandatory)] [String]$powerAppsAdminModuleVersion,
        [Parameter(Mandatory)] [String]$tenantId,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$microsoftXrmDataPowerShellModule,
        [Parameter(Mandatory)] [String]$XrmDataPowerShellVersion,
        [Parameter(Mandatory)] [String]$CdsBaseConnectionString,
        [Parameter(Mandatory)] [String]$serviceConnection,
        [Parameter(Mandatory)] [String]$solutionName
    )
    $microsoftPowerAppsAdministrationPowerShellModule = '$(CoETools_Microsoft_PowerApps_Administration_PowerShell)'
    Import-Module $microsoftPowerAppsAdministrationPowerShellModule -Force -RequiredVersion $powerAppsAdminModuleVersion -ArgumentList @{ NonInteractive = $true }
    Add-PowerAppsAccount -TenantID $tenantId -ApplicationId $clientId -ClientSecret $clientSecret
    #$microsoftXrmDataPowerShellModule = '$(CoETools_Microsoft_Xrm_Data_PowerShell)'
    Import-Module $microsoftXrmDataPowerShellModule -Force -RequiredVersion $XrmDataPowerShellVersion -ArgumentList @{ NonInteractive = $true }
    $conn = Get-CrmConnection -ConnectionString "$(connectionVariables.BuildTools.DataverseConnectionString)"

    $solutions = Get-CrmRecords -conn $conn -EntityLogicalName solution -FilterAttribute "uniquename" -FilterOperator "eq" -FilterValue "$solutionName" -Fields solutionid
    if ($solutions.Count -eq 0){
      # Set the SolutionExists as a global variable for use in other templates
      echo "##vso[task.setvariable variable=SolutionExists]false"
    }
    else {
      # Set the SolutionExists as a global variable for use in other templates
      echo "##vso[task.setvariable variable=SolutionExists]true"
    }
}

function update-solution-xml-with-build-number
{
    param (
        [Parameter(Mandatory)] [String]$solutionXMLPath,
        [Parameter(Mandatory)] [String]$buildNumber
    )

   Write-Host "buildNumber - $buildNumber"
    [xml]$xmlDoc = Get-Content -Path $solutionXMLPath
    $version = $xmlDoc.ImportExportXml.SolutionManifest.Version
    Write-Host "Existing version - $version"
    if(($version -ne $null) -and ($version -eq "0.0.0.0")){
        $xmlDoc.ImportExportXml.SolutionManifest.Version ="$buildNumber"
        $xmlDoc.save("$solutionXMLPath")
    }
}

function flatten-JSON-files
{
    param (
        [Parameter(Mandatory)] [String]$solutionFolderPath
    )

    Get-ChildItem -Path "$solutionFolderPath" -Recurse -Filter *.json |
    ForEach-Object {
        $fileContent = (Get-Content $_.FullName) -join ' '
        if(-not [string]::IsNullOrWhiteSpace($fileContent)) {
            Set-Content $_.FullName $fileContent -Encoding utf8NoBOM
        }
    }
}

function get-managed-solution-zip-path
{
    param (
        [Parameter(Mandatory)] [String]$artifactDropPath,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$triggerSolutionUpgrade
    )

    #Attempt to find the managed solution in the build pipeline drop if build and deploy are seperate pipelines
    Get-ChildItem -Path "$artifactDropPath" -Filter "$solutionName*.zip" | 
    ForEach-Object {
        If ($_.FullName.Contains("_managed")) 
        { 
            $managedSolutionPath = $_.FullName 
        }
    }
    Write-Host "##vso[task.setVariable variable=ManagedSolutionPath]$managedSolutionPath"

    #Set TriggerSolutionUpgrade to false if the variable is not set
    if('$triggerSolutionUpgrade'.Contains("TriggerSolutionUpgrade")) {
        Write-Host "##vso[task.setVariable variable=TriggerSolutionUpgrade]false"
    }
}