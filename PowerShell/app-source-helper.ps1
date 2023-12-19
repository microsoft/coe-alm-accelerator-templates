<#
This function adds the managed solutions to deployment packager file (i.e.,PD Package project).
This step is needed to for App Source Packaging.
#>
function Invoke-Add-Solution-References-To-Package-Project{
     param (
        [Parameter(Mandatory)] [String]$pacPath,
        [Parameter(Mandatory)] [String]$packageDeployerProjectPath,
        [Parameter(Mandatory)] [String]$solutionsFolderPath,
        [Parameter(Mandatory)] [String]$packageDeployerConfigSettingsPath,
        [Parameter(Mandatory)] [String]$projectName
     )

     if(Test-Path $solutionsFolderPath){
         if(Test-Path $packageDeployerProjectPath)
         {
            $pacexepath = "$pacPath\pac.exe"
            if(Test-Path "$pacexepath")
            {
                Get-ChildItem "$solutionsFolderPath" | Where-Object {$_.Name -match '_managed.zip'} |
                Foreach-Object {
                    $solutionName = $_.Name
                    $solutionPath = $_.FullName
                    Write-Host "Fetching the solution $solutionName setting from configuration"
                    $matchingSolution = Get-Solution-By-Name "$packageDeployerConfigSettingsPath" "$projectName" "$solutionName"
                    if($matchingSolution -ne $null)
                    {
                        $importOrder = $($matchingSolution.importorder)
                        Write-Host "ImportOrder - $importOrder"
                        $pacCommand = "package add-solution --path $solutionPath --import-order $importOrder --import-mode async"
                        Write-Host "Pac Command - $pacCommand"
                        if($importOrder -ne 0){
                            Write-Host "Pointing to $packageDeployerProjectPath path" 
                            Set-Location -Path $packageDeployerProjectPath
                            Invoke-Expression -Command "$pacexepath $pacCommand"
                        }
                        else{
                            Write-Host "Invalid import order for Solution - $solutionName"
                        }

					    # Solution Anchor Name in input.xml file can be Solution Name with Import order 1
                        if($importOrder -eq 1){
						    Write-Host "Setting Solution Anchor Name to $solutionName"
                            Write-Host "##vso[task.setVariable variable=SolutionAnchorName]$solutionName"
                        }
                    }
                }
            }
            else{
                Write-Host "Invalid pac exe path $pacexepath"
            }
         }
         else{
              Write-Host "Invalid PackageDeployerProjectPath - $packageDeployerProjectPath"
         }
     }
    else{
        Write-Host "Invalid solutions folder path - $solutionsFolderPath"
    }
}

# Function to get Solution by Project Name and Solution Name
function Get-Solution-By-Name {
    param (
        [Parameter(Mandatory)] [String]$projectConfigSettingsFilePath,
        [Parameter(Mandatory)] [String]$projectName,
        [Parameter(Mandatory)] [String]$solutionName
    )

    # Check if the file exists
    if (-not (Test-Path $projectConfigSettingsFilePath)) {
        Write-Host "Config file '$projectConfigSettingsFilePath' not found."
        return $null
    }

    # Read the JSON content from the file
    $jsonString = Get-Content -Path $projectConfigSettingsFilePath -Raw

    # Convert the JSON string to a PowerShell object
    $jsonObject = $jsonString | ConvertFrom-Json
    $projects = $jsonObject | ConvertFrom-Json | Select-Object -ExpandProperty Project
    # Find the project node by name
    $project = $projects | Where-Object { $_.name -eq $projectName }	

    if ($project -ne $null) {
        $solution = $project.solutions | Where-Object { $_.Name -eq $solutionName }

        if ($solution -ne $null) {
            return $solution
        } else {
            Write-Host "Solution '$solutionName' not found for project '$projectName'."
            return $null
        }
    } else {
        Write-Host "Project '$projectName' not found."
        return $null
    }
}

function Invoke-Trigger-Dotnet-Publish{
    param(
        [Parameter(Mandatory)] [String]$packageDeployerProjectPath
    )

    Write-Host "Pointing to package project folder path - " $packageDeployerProjectPath
    if(Test-Path $packageDeployerProjectPath){
        Set-Location -Path $packageDeployerProjectPath
        dotnet publish
    }
    else{
        Write-Host "Path unavailble; $packageDeployerProjectPath"
    }
}

# Copy the .zip folder generated in either bin\debug or bin\release and move it to "AppSourcePackageProject\AppSourceAssets"
function Copy-Published-Assets-To-AppSourceAssets{
    param(
        [Parameter(Mandatory)] [String]$packageDeployerProjectPath,
        [Parameter(Mandatory)] [String]$appSourceAssetsPath,
        [Parameter(Mandatory)] [String]$packageFileName,
        [Parameter(Mandatory)] [String]$releaseAssetsDirectory
    )

    $pdpkgFileCount = 0
    $appSourcePackageFound = $false

    if(Test-Path "$packageDeployerProjectPath\bin\Release"){
		$binPath = "bin\Release"
        $pdpkgFileCount = (Get-ChildItem "$packageDeployerProjectPath\$binPath" -Filter *pdpkg.zip | Measure-Object).Count
        Write-Host "Count of .pdpkg.zip from $packageDeployerProjectPath\$binPath - "$pdpkgFileCount
        if($pdpkgFileCount -gt 0){
            Copy-Pdpkg-File "$packageDeployerProjectPath" "$packageFileName" "$appSourceAssetsPath" "$binPath"           
            $appSourcePackageFound = $true
        }
        else{
            Write-Host "pdpkg.zip not found under $packageDeployerProjectPath\$binPath"
        }
    }

    if(($pdpkgFileCount -eq 0) -and (Test-Path "$packageDeployerProjectPath\bin\Debug")){
		$binPath = "bin\Debug"
        $pdpkgFileCount = (Get-ChildItem "$packageDeployerProjectPath\$binPath" -Filter *pdpkg.zip | Measure-Object).Count
        Write-Host "Count of .pdpkg.zip from $packageDeployerProjectPath\$binPath - "$pdpkgFileCount
        if($pdpkgFileCount -gt 0){
            Copy-Pdpkg-File "$packageDeployerProjectPath" "$packageFileName" "$appSourceAssetsPath" "$binPath"           
            $appSourcePackageFound = $true
        }
        else{
            Write-Host "pdpkg.zip not found under $packageDeployerProjectPath\$binPath"
        }
    }

    if($pdpkgFileCount -eq 0){
        Write-Host "pdpkg.zip not found; Exiting"
        return
    }

    Write-Host "##vso[task.setVariable variable=AppSourcePackageFound]$appSourcePackageFound"
}

<#
This function creates a new App Source folder.
Compresses package deployer assets and moves them to newly created folder.
#>
function Invoke-Pack-And-Move-Assets-To-AppSourcePackage{
    param(
        [Parameter(Mandatory)] [String]$appSourceAssetsPath,
        [Parameter(Mandatory)] [String]$appSourcePackagePath,
        [Parameter(Mandatory)] [String]$releaseZipName,
        [Parameter(Mandatory)] [String]$appSourcePackageFolderName
    )

    # Create a new folder in Destination
    if(!(Test-Path "$appSourcePackagePath\$appSourcePackageFolderName")){
        Write-Host "Creating a new folder $appSourcePackageFolderName under $appSourcePackagePath"
        New-Item -Path "$appSourcePackagePath" -Name "$appSourcePackageFolderName" -ItemType "directory"
    }

    $destinationPath = "$appSourcePackagePath\$appSourcePackageFolderName\$releaseZipName"
    if(Test-Path "$appSourceAssetsPath")
    {
        if(Test-Path "$appSourcePackagePath\$appSourcePackageFolderName"){
            Write-Host "Packaging assets from $appSourceAssetsPath and creating $destinationPath"
            Compress-Archive -Path "$appSourceAssetsPath\*" -CompressionLevel Optimal -DestinationPath "$destinationPath" -Force
        }
        else{
            Write-Host "Invalid appSourcePackagePath path - $appSourcePackagePath\$appSourcePackageFolderName"
        }
    }
    else{
        Write-Host "Invalid appSourceAssetsPath path - $appSourceAssetsPath" 
    }
}

<#
This function updates the 'Input.xml' file.
Sets StartDate,EndDate and SolutionAnchorName.
#>
function Update-Input-File{
    param (
        [Parameter(Mandatory)] [String]$inputFilePath,
        [Parameter(Mandatory)] [String]$packageFileName,
        [Parameter()] [String]$solutionAnchorName
    )

    if(Test-Path "$inputFilePath"){
        [xml]$xmlDoc = Get-Content -Path $inputFilePath

        $todayDate = (Get-Date).ToString('MM-dd-yyyy')
        $futureDate = (Get-Date).AddMonths(12).ToString('MM-dd-yyyy')
        $xmlDoc.PvsPackageData.StartDate = $todayDate
        $xmlDoc.PvsPackageData.EndDate = $futureDate
        $xmlDoc.PvsPackageData.PackageFile = "$packageFileName"
		$xmlDoc.PvsPackageData.SolutionAnchorName = "$solutionAnchorName"
        Write-Host "Setting StartDate as $todayDate and EndDate as $futureDate and PackageFile as $packageFileName and Solution Anchor Name as $solutionAnchorName"
        $xmlDoc.save("$inputFilePath")
    }
    else{
        Write-Host "Input.xml unavailable at - $inputFilePath"
    }
}

<#
This function installs the PowerApps.CLI nuget package.
#>
function Install-Pac-Cli{
	param(
        [Parameter()] [String]$nugetPackageVersion		
	)
    $nugetPackage = "Microsoft.PowerApps.CLI"
    $outFolder = "pac"
    if($nugetPackageVersion -ne '') {
        nuget install $nugetPackage -Version $nugetPackageVersion -OutputDirectory $outFolder
    }
    else {
        nuget install $nugetPackage -OutputDirectory $outFolder
    }
    $pacNugetFolder = Get-ChildItem $outFolder | Where-Object {$_.Name -match $nugetPackage + "."}
    $pacPath = $pacNugetFolder.FullName + "\tools"
    Write-Host "##vso[task.setvariable variable=pacPath]$pacPath"	
}

<#
This function copies the generated package deployer file (i.e., pdpkg.zip).
Moves the file to ReleaseAssets folder.
#>
function Copy-Pdpkg-File{
    param (
        [Parameter(Mandatory)] [String]$packageDeployerProjectPath,
        [Parameter(Mandatory)] [String]$packageFileName,
        [Parameter(Mandatory)] [String]$appSourceAssetsPath,
        [Parameter(Mandatory)] [String]$binPath
    )

    Write-Host "pdpkg file found under $packageDeployerProjectPath\$binPath"
    Write-Host "Copying pdpkg.zip file to $appSourceAssetsPath\$packageFileName"
            
    Get-ChildItem "$packageDeployerProjectPath\$binPath" -Filter *pdpkg.zip | Copy-Item -Destination "$appSourceAssetsPath\$packageFileName" -Force -PassThru
    # Copy pdpkg.zip file to ReleaseAssets folder
    if(Test-Path "$releaseAssetsDirectory"){
        Write-Host "Copying pdpkg file to Release Assets Directory"
        Get-ChildItem "$packageDeployerProjectPath\$binPath" -Filter *pdpkg.zip | Copy-Item -Destination "$releaseAssetsDirectory" -Force -PassThru
    }
    else{
        Write-Host "Release Assets Directory is unavailable to copy pdpkg file; Path - $releaseAssetsDirectory"
    }
}

# Function to get PreImportSettings by project name
function Get-PreImport-Settings-of-Project {
    param (
        [Parameter(Mandatory)] [String]$projectConfigSettingsFilePath,
        [Parameter(Mandatory)] [String]$projectName
    )

    # Check if the file exists
    if (-not (Test-Path $projectConfigSettingsFilePath)) {
        Write-Host "ProjectConfigSettingsFilePath $projectConfigSettingsFilePath not found."
        return $null
    }

    # Read the JSON content from the file
    $jsonString = Get-Content -Path $projectConfigSettingsFilePath -Raw

    # Convert the JSON string to a PowerShell object
    $jsonObject = $jsonString | ConvertFrom-Json

    $project = $jsonObject.Projects | Where-Object { $_.Name -eq $projectName }

    if ($project -ne $null) {
        return $project.PreImportSettings
    } else {
        Write-Host "Project '$projectName' not found."
        return $null
    }
}

function Execute-PreImport-Settings-of-Project{
     param (
        [Parameter(Mandatory)] [String]$pacPath,
        [Parameter(Mandatory)] [String]$projectConfigSettingsFilePath,
        [Parameter(Mandatory)] [String]$projectName
     )

     $pacexepath = "$pacPath\pac.exe"

     $preImportSettings = Get-PreImport-Settings-of-Project $projectConfigSettingsFilePath $projectName

     if ($preImportSettings -ne $null) {
        Write-Host "PreImportSettings for $projectName"
    
        foreach ($setting in $preImportSettings) {
            Write-Host "Name: $($setting.name), Value: $($setting.value)"

            $pacCommand = "org update-settings --name $($setting.name) --value $($setting.value)"
            Write-Host "Pac Command - $pacCommand"
            Invoke-Expression -Command "$pacexepath $pacCommand"
        }
    }else{
        Write-Host "PreImportSettings are not configured for $projectName"
    }
}
