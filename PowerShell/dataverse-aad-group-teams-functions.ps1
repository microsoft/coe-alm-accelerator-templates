﻿function Set-Dataverse-AAD-Group-Teams
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
        [Parameter(Mandatory)] [String]$aadGroupTeamConfiguration
    )
    #$microsoftPowerAppsAdministrationPowerShellModule = '$(CoETools_Microsoft_PowerApps_Administration_PowerShell)'
    Import-Module $microsoftPowerAppsAdministrationPowerShellModule -Force -RequiredVersion $powerAppsAdminModuleVersion -ArgumentList @{ NonInteractive = $true }
    Add-PowerAppsAccount -TenantID $tenantId -ApplicationId $clientId -ClientSecret $clientSecret
    #$microsoftXrmDataPowerShellModule = '$(CoeTools_Microsoft_Xrm_Data_Powershell)'
    Import-Module $microsoftXrmDataPowerShellModule -Force -RequiredVersion $XrmDataPowerShellVersion -ArgumentList @{ NonInteractive = $true }
    $conn = Get-CrmConnection -ConnectionString "$CdsBaseConnectionString$serviceConnection"

    # json config value must follow this format
    # [
    #   {
    #     "aadGroupTeamName":"name-of-aad-group-team-to-create-or-update-1",
    #     "aadSecurityGroupId":"guid-of-security-group-from-aad-1",
    #     "dataverseSecurityRoleNames":["dataverse-security-role-name-1","dataverse-security-role-name-2"]
    #   },
    # [
    #   {
    #     "aadGroupTeamName":"name-of-aad-group-team-to-create-or-update-2",
    #     "aadSecurityGroupId":"guid-of-security-group-from-aad-2",
    #     "dataverseSecurityRoleNames":["dataverse-security-role-name-3","dataverse-security-role-name-4"]
    #   }
    # ]
    Write-Host '$aadGroupTeamConfiguration'

    $config = Get-Content "$aadGroupTeamConfiguration" | ConvertFrom-Json

    foreach ($c in $config){
      $aadGroupTeamName = $c.aadGroupTeamName
      $aadId = $c.aadSecurityGroupId
      $securityRoleNames = $c.dataverseSecurityRoleNames
      if($aadGroupTeamName -ne '' -and $aadId -ne '') {
          $teamTypeValue = New-CrmOptionSetValue -Value 2

          $aadGroupTeams = Get-CrmRecords -conn $conn -EntityLogicalName team -FilterAttribute "name" -FilterOperator "eq" -FilterValue $aadGroupTeamName -Fields teamid
          $fields = @{ "name"=$aadGroupTeamName;"teamtype"=$teamTypeValue;"azureactivedirectoryobjectid"=[guid]$aadId }

          if ($aadGroupTeams.Count -eq 0){
            $aadGroupTeamId = New-CrmRecord -conn $conn -EntityLogicalName team -Fields $fields
          } else {
            $aadGroupTeamId = $aadGroupTeams.CrmRecords[0].teamid
            Set-CrmRecord -conn $conn -EntityLogicalName team -Id $aadGroupTeamId -Fields $fields
          }
      
          foreach ($securityRoleName in $securityRoleNames){
            $securityRoles = Get-CrmRecords -conn $conn -EntityLogicalName role -FilterAttribute "name" -FilterOperator "eq" -FilterValue $securityRoleName -Fields roleid
            if($securityRoles.Count -gt 0) {

                $securityRole = $securityRoles.CrmRecords[0]
                $aadGroupTeamRoles = Get-CrmRecords -conn $conn -EntityLogicalName teamroles -FilterAttribute "teamid" -FilterOperator "eq" -FilterValue $aadGroupTeamId -Fields roleid
        
                if ($aadGroupTeamRoles.CrmRecords.Where({$_.roleid -eq $securityRole.roleid}).Count -eq 0){
                  Add-CrmSecurityRoleToTeam -conn $conn -TeamId $aadGroupTeamId -SecurityRoleId $securityRole.roleid
                }
            }
            else {
                Write-Host "##vso[task.logissue type=warning]A specified security role was not found in the target environment. Verify your deployment configuration and try again."
            }
          }      
        }
    }
 }