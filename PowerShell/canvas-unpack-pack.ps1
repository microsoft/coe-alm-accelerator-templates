﻿<#
This function loads the PowerAppsLanguageTooling dll.
Either packs or unpacks the canvas app based on the packOrUnpack parameter.
#>
function Invoke-CanvasUnpackPack {
    param (
        [Parameter(Mandatory)] [String]$packOrUnpack,
        [Parameter(Mandatory)] [String]$source,
        [Parameter(Mandatory)] [String]$destination
    )
    Write-Host "Loading Assemblies"
    Get-ChildItem -Path "..\PowerAppsLanguageTooling\" -Recurse -Filter *.dll | 
    ForEach-Object {
        [System.Reflection.Assembly]::LoadFrom($_.FullName)
    }
    
    if ($packOrUnpack -eq 'pack') {
        Write-Host "Packing $source to $destination"
        $results = [Microsoft.PowerPlatform.Formulas.Tools.CanvasDocument]::LoadFromSources($source)
        if($results.HasErrors) {
            throw $results.Item2.ToString();
            return
        } else {
            Write-Host $results.Item2.ToString()
        }
        $saveResults = $results.Item1.SaveToMsApp($destination)
        if($saveResults.HasErrors) {
            throw $saveResults.ToString();
            return
        } 
        else {
            Write-Host $saveResults.ToString()
        }
    }
    else {
        if ($packOrUnpack -eq 'unpack') {
            Write-Host "Unpacking $source to $destination"
            $results = [Microsoft.PowerPlatform.Formulas.Tools.CanvasDocument]::LoadFromMsapp($source)
            if($results.HasErrors) {
                throw $results.Item2.ToString();
                return
            } else {
                Write-Host $results.Item2.ToString()
            }
    
            $saveResults = $results.Item1.SaveToSources($destination)
            if($saveResults.HasErrors) {
                throw $saveResults.ToString();
                return
            } 
            else {
                Write-Host $saveResults.ToString()
            }
        }
        else {
            throw "Invalid packOrUnpack parameter. Must be 'pack' or 'unpack'.";
        }
    }
}

<#
This function reads aadGroupCanvasConfiguration from custom deployment Settings.
Shares the canvas app with AAD group.
#>
function Invoke-Share-Canvas-App-with-AAD-Group
{
    param (
        [Parameter(Mandatory)] [String]$microsoftPowerAppsAdministrationPowerShellModule,
        [Parameter(Mandatory)] [String]$powerAppsAdminModuleVersion,
        [Parameter(Mandatory)] [String]$tenantId,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$microsoftXrmDataPowerShellModule,
        [Parameter(Mandatory)] [String]$XrmDataPowerShellVersion,
        [Parameter(Mandatory)] [String]$serviceConnection,
        [Parameter()] [String]$aadGroupCanvasConfiguration,
        [Parameter(Mandatory)] [String]$environmentId,
        [Parameter(Mandatory)] [String]$dataverseConnectionString
    )
	if($aadGroupCanvasConfiguration -ne '') {
        #$microsoftPowerAppsAdministrationPowerShellModule = '$(CoETools_Microsoft_PowerApps_Administration_PowerShell)'
        Import-Module $microsoftPowerAppsAdministrationPowerShellModule -Force -RequiredVersion $powerAppsAdminModuleVersion -ArgumentList @{ NonInteractive = $true }
        Add-PowerAppsAccount -TenantID $tenantId -ApplicationId $clientId -ClientSecret $clientSecret
        #$microsoftXrmDataPowerShellModule = '$(CoETools_Microsoft_Xrm_Data_PowerShell)'
        Import-Module $microsoftXrmDataPowerShellModule -Force -RequiredVersion $XrmDataPowerShellVersion -ArgumentList @{ NonInteractive = $true }
        $conn = Get-CrmConnection -ConnectionString "$dataverseConnectionString"

        # json config value must follow this format
        #[
        #    {
        #        "aadGroupId": "aad-security-group-guid-1",
        #        "canvasNameInSolution": "pfx_app-name-in-solution-name-1",
        #        "roleName":"CanView or CanViewWithShare or CanEdit" 
        #    },
        #    {
        #        "aadGroupId": "aad-security-group-guid-2",
        #        "canvasNameInSolution": "pfx_app-name-in-solution-name-2",
        #        "roleName":"CanView or CanViewWithShare or CanEdit" 
        #    }
        #]
        $config = Get-Content "$aadGroupCanvasConfiguration" | ConvertFrom-Json

        foreach ($c in $config){
            $aadGroupId = $c.aadGroupId
            $roleName = $c.roleName
            $canvasNameInSolution = $c.canvasNameInSolution     
            if($aadGroupId -ne '' -and $roleName -ne '' -and $canvasNameInSolution -ne '') {
                $canvasApps = Get-CrmRecords -conn $conn -EntityLogicalName canvasapp -FilterAttribute "name" -FilterOperator "eq" -FilterValue $canvasNameInSolution -Fields canvasappid,uniquecanvasappid
                if($canvasApps.Count -gt 0) {
                    $appId = $canvasApps.CrmRecords[0].canvasappid
                    $uniqueCanvasAppId = $canvasApps.CrmRecords[0].uniquecanvasappid
                    Write-Host "AppId - $appId and UniqueCanvasAppId - $uniqueCanvasAppId"

					# 'CanViewWithShare' is no longer works. Replacing with 'CanView'.
                    if($roleName -eq "CanViewWithShare"){
                        $roleName = "CanView"
                    }
                    if($null -ne $uniqueCanvasAppId) {
                        Write-Host "Command Unique Id- Set-AdminPowerAppRoleAssignment -PrincipalType Group -PrincipalObjectId $aadGroupId -RoleName $roleName -AppName $uniqueCanvasAppId -EnvironmentName $environmentId"
                        Set-AdminPowerAppRoleAssignment -PrincipalType Group -PrincipalObjectId $aadGroupId -RoleName $roleName -AppName $uniqueCanvasAppId -EnvironmentName $environmentId
                    }
                    else {
                        Write-Host "Command App Id- Set-AdminPowerAppRoleAssignment -PrincipalType Group -PrincipalObjectId $aadGroupId -RoleName $roleName -AppName $appId -EnvironmentName $environmentId"
                        Set-AdminPowerAppRoleAssignment -PrincipalType Group -PrincipalObjectId $aadGroupId -RoleName $roleName -AppName $appId -EnvironmentName $environmentId
                    }
                }
                else {
                    Write-Host "##vso[task.logissue type=warning]A specified canvas app was not found in the target environment. Verify your deployment configuration and try again."
                }
            }
        }
	}
}

<#
Read all the Canvas Apps part of the solution.
Apply PowerShell command to bypass the Canvas app consents.
#>
function ByPass-Canvas-App-Consents
{
    param (
        [Parameter(Mandatory)] [String]$microsoftPowerAppsAdministrationPowerShellModule,
        [Parameter(Mandatory)] [String]$powerAppsAdminModuleVersion,
        [Parameter(Mandatory)] [String]$tenantId,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$microsoftXrmDataPowerShellModule,
        [Parameter(Mandatory)] [String]$XrmDataPowerShellVersion,
        [Parameter(Mandatory)] [String]$serviceConnection,
        [Parameter(Mandatory)] [String]$environmentId,
        [Parameter(Mandatory)] [String]$dataverseConnectionString,
        [Parameter(Mandatory)] [String]$solutionName
    )

    Import-Module $microsoftPowerAppsAdministrationPowerShellModule -Force -RequiredVersion $powerAppsAdminModuleVersion -ArgumentList @{ NonInteractive = $true }
    Add-PowerAppsAccount -TenantID $tenantId -ApplicationId $clientId -ClientSecret $clientSecret
    #$microsoftXrmDataPowerShellModule = '$(CoETools_Microsoft_Xrm_Data_PowerShell)'
    Import-Module $microsoftXrmDataPowerShellModule -Force -RequiredVersion $XrmDataPowerShellVersion -ArgumentList @{ NonInteractive = $true }
    $conn = Get-CrmConnection -ConnectionString "$dataverseConnectionString"

    $environmentName = "$environmentId"

    # Fetch all solution components
    $solutions = Get-CrmRecords -conn $conn -EntityLogicalName solution -FilterAttribute "uniquename" -FilterOperator "eq" -FilterValue "$solutionName" -Fields solutionid
    if($solutions.Count -gt 0) {
        $solutionId = $solutions.CrmRecords[0].solutionid

        $result = Get-CrmRecords -conn $conn -EntityLogicalName solutioncomponent -FilterAttribute "solutionid" -FilterOperator "eq" -FilterValue $solutionId -Fields objectid,componenttype
        $solutionComponents = $result.CrmRecords

        $optionSetMetadata = $null
        foreach ($c in $solutionComponents){
            $componentType = $c.componenttype
            Write-Host "Componenttype - $componentType"

            if ($c.componenttype -eq "Canvas App" -and $c.objectid -ne ""){
                Write-Host "Bypassing the canvas app $($c.objectid) consent. Environment - $environmentName"
                # Set-AdminPowerAppApisToBypassConsent -EnvironmentName [Guid] -AppName [Guid]
                Write-Host "Command - Set-AdminPowerAppApisToBypassConsent –EnvironmentName $environmentName –AppName $($c.objectid)"
                Set-AdminPowerAppApisToBypassConsent –EnvironmentName $environmentName –AppName $($c.objectid)
            }
        }
    }
}

<#
This function reads custom deployment Settings and updates canvas app ownership.
#>
function Update-Canvas-App-Ownership
{
    param (
        [Parameter(Mandatory)] [String]$microsoftPowerAppsAdministrationPowerShellModule,
        [Parameter(Mandatory)] [String]$powerAppsAdminModuleVersion,
        [Parameter(Mandatory)] [String]$tenantId,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$microsoftXrmDataPowerShellModule,
        [Parameter(Mandatory)] [String]$XrmDataPowerShellVersion,
        [Parameter(Mandatory)] [String]$dataverseConnectionString,
        [Parameter(Mandatory)] [String]$environmentId,
        [Parameter(Mandatory)] [String]$requestedForEmail,
        [Parameter(Mandatory)] [String]$solutionName
    )
    #$microsoftPowerAppsAdministrationPowerShellModule = '$(CoETools_Microsoft_PowerApps_Administration_PowerShell)'
    Import-Module $microsoftPowerAppsAdministrationPowerShellModule -Force -RequiredVersion $powerAppsAdminModuleVersion -ArgumentList @{ NonInteractive = $true }
    Add-PowerAppsAccount -TenantID $tenantId -ApplicationId $clientId -ClientSecret $clientSecret
    #$microsoftXrmDataPowerShellModule = '$(CoETools_Microsoft_Xrm_Data_PowerShell)'
    Import-Module $microsoftXrmDataPowerShellModule -Force -RequiredVersion $XrmDataPowerShellVersion -ArgumentList @{ NonInteractive = $true }
    $conn = Get-CrmConnection -ConnectionString "$dataverseConnectionString"

    $environmentName = "$environmentId"

    $systemusers = Get-CrmRecords -conn $conn -EntityLogicalName systemuser -FilterAttribute "internalemailaddress" -FilterOperator eq -FilterValue "$requestedForEmail" -Fields azureactivedirectoryobjectid
    if($systemusers.Count -gt 0) {

        $azureactivedirectoryobjectid = $systemusers.CrmRecords[0].azureactivedirectoryobjectid

        $solutions = Get-CrmRecords -conn $conn -EntityLogicalName solution -FilterAttribute "uniquename" -FilterOperator "eq" -FilterValue "$solutionName" -Fields solutionid
        if($solutions.Count -gt 0) {
            $solutionId = $solutions.CrmRecords[0].solutionid

            $result = Get-CrmRecords -conn $conn -EntityLogicalName solutioncomponent -FilterAttribute "solutionid" -FilterOperator "eq" -FilterValue $solutionId -Fields objectid,componenttype
            $solutionComponents = $result.CrmRecords
            foreach ($c in $solutionComponents){
                if ($c.componenttype -eq "Canvas App" -and $c.objectid -ne ""){
                    Write-Host "Setting canvas app owner $($c.objectid) with $azureactivedirectoryobjectid. Environment - $environmentName"
                    Write-Host "Command - Set-AdminPowerAppOwner –AppName $c.objectid -AppOwner $azureactivedirectoryobjectid –EnvironmentName $environmentName"
                    Set-AdminPowerAppOwner –AppName $c.objectid -AppOwner $azureactivedirectoryobjectid –EnvironmentName $environmentName
                }
            }
        }
    }
}
