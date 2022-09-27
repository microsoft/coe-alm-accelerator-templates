function Get-Website-Name
{
    param (
        [Parameter(Mandatory)] [String]$sourcesDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName
    )

    $websiteName = "NA"
    $solutionUnpackedFolder = "$sourcesDirectory\$repo\$solutionName\PowerPages"
    Write-Information -MessageData "solutionUnpackedFolder - $solutionUnpackedFolder"
    if(Test-Path "$solutionUnpackedFolder")
    {
        $matchedFolders = Get-ChildItem "$solutionUnpackedFolder" -Directory | Select-Object Name
        Write-Information -MessageData "matchedFolders - $matchedFolders"

        if($matchedFolders){
          $websiteName = $matchedFolders[0].Name
        }
    }
    else
    {
       Write-Information -MessageData "Unpacked website folder unavailable. Path - $solutionUnpackedFolder"
    }
    return $websiteName
}

function Remove-Website-Folder
{
    param (
        [Parameter(Mandatory)] [String]$sourcesDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$websiteName
    )
    $portalWebsitePath = "$sourcesDirectory\$repo\$solutionName\PowerPages\$websiteName\"
    if(Test-Path "$portalWebsitePath"){
      Remove-Item "$portalWebsitePath\*" -Recurse -Force
    }
    else{
       Write-Information -MessageData "Unpacked website folder unavailable. Path - $portalWebsitePath"
    }
}