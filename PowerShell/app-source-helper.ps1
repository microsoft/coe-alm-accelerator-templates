function add-solution-references-to-package-project{
     param (
        [Parameter(Mandatory)] [String]$pacPath,
        [Parameter(Mandatory)] [String]$appSourcePackageProjectPath,
        [Parameter(Mandatory)] [String]$solutionsFolderPath,
        [Parameter(Mandatory)] [String]$appSourceInputFilePath
     )

     if(Test-Path $solutionsFolderPath){
         if(Test-Path $appSourcePackageProjectPath)
         {
            $pacexepath = "$pacPath\pac.exe"
            if(Test-Path "$pacexepath")
            {
                Get-ChildItem "$solutionsFolderPath" -Filter *.managed.zip | 
                Foreach-Object {
                    $solutionName = $_.Name
                    $solutionPath = $_.FullName
                    Write-Host "Fetching import order of Solution - " $solutionName
                    $importOrder = get-solution-import-order "$appSourceInputFilePath" "$solutionName"
                    $pacCommand = "package add-solution --path $solutionPath --import-order $importOrder --import-mode async"

                    Write-Host "Pac Command - $pacCommand"
                    if($importOrder -ne 0){
                        Write-Host "Pointing to $appSourcePackageProjectPath path" 
                        Set-Location -Path $appSourcePackageProjectPath
                        Invoke-Expression -Command "$pacexepath $pacCommand"
                    }
                    else{
                        Write-Host "Invalid import order for Solution - $solutionName"
                    }
                }
            }
            else{
                Write-Host "Invalid pac exe path $pacexepath"
            }
         }
         else{
              Write-Host "Invalid app source folder path - $appSourcePackageProjectPath"
         }
     }
    else{
        Write-Host "Invalid solutions folder path - $solutionsFolderPath"
    }
}

function get-solution-import-order{
    param(
        [Parameter(Mandatory)] [String]$appSourceInputFilePath,
        [Parameter(Mandatory)] [String]$solutionName       
    )

    $importOrder = 0
    if(Test-Path "$appSourceInputFilePath"){
        $appSourceInputData = Get-Content "$appSourceInputFilePath" | ConvertFrom-Json        
        foreach($solution in $appSourceInputData.Configdatastorage.Solutions){
          if("$solutionName" -match $solution.Name){
              $importOrder = $solution.Importorder
              Write-Host "Given Solution - $solutionName MACTHED with appSource Solution - "$solution.Name
              break;
          }
          else{
             #Write-Host "Given Solution - $solutionName not matched with appSource Solution - "$solution.Name
          }
        }
    }
    else{
        Write-Host "appSourceInputPath is unavailble at {$appSourceInputFilePath}"
    }

    Write-Host "importOrder - $importOrder"
    return $importOrder;
}

function trigger-dotnet-publish{
    param(
        [Parameter(Mandatory)] [String]$appSourcePackageProjectPath
    )

    Write-Host "Pointing to package project folder path - " $appSourcePackageProjectPath
    if(Test-Path $appSourcePackageProjectPath){
        Set-Location -Path $appSourcePackageProjectPath
        dotnet publish
    }
    else{
        Write-Host "Path unavailble; $appSourcePackageProjectPath"
    }
}

# Copy the .zip folder generated in either bin\debug or bin\release and move it to "AppSourcePackageProject\AppSourceAssets"
function copy-published-assets-to-AppSourceAssets{
    param(
        [Parameter(Mandatory)] [String]$appSourcePackageProjectPath,
        [Parameter(Mandatory)] [String]$appSourceAssetsPath
    )

    $pdpkgFileCount = 0
    $appSourcePackageFound = $false

    if(Test-Path "$appSourcePackageProjectPath\bin\Release"){
        $pdpkgFileCount = (Get-ChildItem "$appSourcePackageProjectPath\bin\Release" -Filter *pdpkg.zip | Measure-Object).Count
        Write-Host "Count of .pdpkg.zip from $appSourcePackageProjectPath\bin\Release - "$pdpkgFileCount
        if($pdpkgFileCount -gt 0){
            Write-Host "pdpkg file found under $appSourcePackageProjectPath\bin\Release"
            Get-ChildItem "$appSourcePackageProjectPath\bin\Release" -Filter *pdpkg.zip | Copy-Item -Destination "$appSourceAssetsPath" -Force -PassThru
            $appSourcePackageFound = $true
        }
        else{
            Write-Host "pdpkg.zip not found under $appSourcePackageProjectPath\bin\Release"
        }
    }

    if(($pdpkgFileCount -eq 0) -and (Test-Path "$appSourcePackageProjectPath\bin\Debug")){
        $pdpkgFileCount = (Get-ChildItem "$appSourcePackageProjectPath\bin\Debug" -Filter *pdpkg.zip | Measure-Object).Count
        Write-Host "Count of .pdpkg.zip from $appSourcePackageProjectPath\bin\Debug - "$pdpkgFileCount
        if($pdpkgFileCount -gt 0){
            Write-Host "pdpkg file found under $appSourcePackageProjectPath\bin\Debug"
            Get-ChildItem "$appSourcePackageProjectPath\bin\Debug" -Filter *pdpkg.zip | Copy-Item -Destination "$appSourceAssetsPath" -Force -PassThru
            $appSourcePackageFound = $true
        }
        else{
            Write-Host "pdpkg.zip not found under $appSourcePackageProjectPath\bin\Debug"
        }
    }

    if($pdpkgFileCount -eq 0){
        Write-Host "pdpkg.zip not found; Exiting"
    }

    Write-Host "##vso[task.setVariable variable=AppSourcePackageFound]$appSourcePackageFound"
}

function pack-and-move-assets-to-AppSourcePackage{
    param(
        [Parameter(Mandatory)] [String]$appSourceAssetsPath,
        [Parameter(Mandatory)] [String]$appSourcePackagePath,
        [Parameter(Mandatory)] [String]$releaseZipName
    )

    $destinationPath = "$appSourcePackagePath\$releaseZipName"
    if(Test-Path "$appSourceAssetsPath")
    {
        if(Test-Path "$appSourcePackagePath"){
            Write-Host "Packaging assets from $appSourceAssetsPath and creating $destinationPath"
            Compress-Archive -Path $appSourceAssetsPath -CompressionLevel Optimal -DestinationPath $destinationPath -Force
        }
        else{
                Write-Host "Invalid appSourcePackagePath path - $appSourcePackagePath" 
            }
    }
    else{
        Write-Host "Invalid appSourceAssetsPath path - $appSourceAssetsPath" 
    }
}

function update-input-file{
    param (
        [Parameter(Mandatory)] [String]$inputFilePath,
        [Parameter(Mandatory)] [String]$packageFileName
    )

    if(Test-Path $inputFilePath){
        [xml]$xmlDoc = Get-Content -Path $inputFilePath

        $todayDate = (Get-Date).ToString('MM-dd-yyyy')
        $futureDate = (Get-Date).AddMonths(12).ToString('MM-dd-yyyy')
        $xmlDoc.PvsPackageData.StartDate = $todayDate
        $xmlDoc.PvsPackageData.EndDate = $futureDate
        $xmlDoc.PvsPackageData.PackageFile = $packageFileName

        Write-Host "Setting StartDate as $todayDate and EndDate as $futureDate and PackageFile as $packageFileName"
        $xmlDoc.save("$inputFilePath")
    }
    else{
        Write-Host "Input.xml file unavailble at - $inputFilePath"
    }
}