param(
    $ConfigFileOutPath, $ServiceConnectionName, $ServiceConnectionUrl, $EnvironmentName, $SolutionName,
    $ImportUnmanaged, $OverwriteUnmanagedCustomizations, $SkipBuildToolsInstaller, $CacheEnabled
)

Describe 'Load-Save-Deploy-Parameters' {
    It 'LoadsAndSavedDeployParameters' -Tag 'LoadsAndSavedDeployParameters' {

        . ..\load-save-pipeline-parameters.ps1
        Write-Deploy-Pipeline-Parameter $ConfigFileOutPath $ServiceConnectionName $ServiceConnectionUrl $EnvironmentName $SolutionName $ImportUnmanaged $OverwriteUnmanagedCustomizations $SkipBuildToolsInstaller $CacheEnabled
        Read-Pipeline-Parameters "$ConfigFileOutPath"
    }
}