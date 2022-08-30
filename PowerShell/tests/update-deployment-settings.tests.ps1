param(
    $DeploymentConfig, $BuildSourceDirectory, $PipelineSourceDirectory, $BuildProjectName, $BuildRepositoryName, $CdsBaseConnectionString,
    $XrmDataPowerShellVersion, $MicrosoftXrmDataPowerShellModule, $OrgUrl, $ProjectName, $Repo, $AuthType,
    $ServiceConnection, $SolutionName, $UsePlaceholders, $AgentOS, $AccessToken, $Pat
)

Describe 'Update-Deployment-Settings-Test' {
    It 'UpdateDeploymentSettings' -Tag 'UpdateDeploymentSettings' {
        Set-Location -Path "..\"
        Install-Module $MicrosoftXrmDataPowerShellModule -RequiredVersion $XrmDataPowerShellVersion -Force -AllowClobber
        $env:SYSTEM_ACCESSTOKEN = $AccessToken
        $env:DEPLOYMENT_SETTINGS = $DeploymentConfig
        . .\update-deployment-settings.ps1
        Set-DeploymentSettingsConfiguration $BuildSourceDirectory $PipelineSourceDirectory $BuildProjectName $BuildRepositoryName $CdsBaseConnectionString $XrmDataPowerShellVersion $MicrosoftXrmDataPowerShellModule $OrgUrl $ProjectName $Repo $AuthType $ServiceConnection $SolutionName $AgentOS $UsePlaceholders $Pat
    }
}
