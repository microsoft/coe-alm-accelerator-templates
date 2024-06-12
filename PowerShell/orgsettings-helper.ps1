function Update-Org-Settings{
    param (
        [Parameter(Mandatory)] [String]$serviceConnectionUrl,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$tenantID,
        [Parameter(Mandatory)] [String]$pacPath,        
        [Parameter(Mandatory)] [String]$orgSettingConfiguration
    )
	
	$pacexepath = "$pacPath\pac.exe"
    if(Test-Path "$pacexepath")
    {
        # Trigger Auth
        Invoke-Expression -Command "$pacexepath auth create --url $serviceConnectionUrl --name ppdev --applicationId $clientId --clientSecret $clientSecret --tenant $tenantID"

        Write-Host "orgSettingConfiguration - $orgSettingConfiguration"
        $orgSettingConfigCollection = Get-OrgSettingConfigurations $orgSettingConfiguration

        foreach ($orgSetting in $orgSettingConfigCollection) {
            # Retrieve Service End Point
            if ($null -ne $orgSetting.SchemaName) {
                Write-Host "Updating orgsetting $orgSetting - "$orgSetting.Value

                $orgUpdateCommand = "org update-settings --name $($orgSetting.SchemaName) --value $($orgSetting.Value)"
                Write-Host "Triggering org update-settings - $orgUpdateCommand"
                Invoke-Expression -Command "$pacexepath $orgUpdateCommand"
            }
        }
    }
}

<#
This function reads OrgSettings from custom deployment settings.
#>
function Get-OrgSettingConfigurations {
    param (
        [Parameter(Mandatory)] [String] [AllowEmptyString()]$orgSettingsConfiguration
    )
    $orgSettingConfigs = $null
    if ($orgSettingsConfiguration -ne "") {
        $orgSettingConfigs = Get-Content $orgSettingsConfiguration | ConvertFrom-Json
    }

    return $orgSettingConfigs
}