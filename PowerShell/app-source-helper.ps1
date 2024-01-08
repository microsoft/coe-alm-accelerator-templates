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
				# Initialize an array to store pac commands
                $pacCommands = @()
				
                Get-ChildItem "$solutionsFolderPath" | Where-Object {$_.Name -match '_managed.zip'} |
                Foreach-Object {
                    $solutionName = $_.Name
                    $solutionPath = $_.FullName
                    Write-Host "Fetching the solution $solutionName setting from configuration"
                    $matchingSolution = Get-Solution-By-Name "$packageDeployerConfigSettingsPath" "$projectName" "$solutionName"
                    if($matchingSolution -ne $null)
                    {
						$pacCommand = "package add-solution --path $solutionPath"
						
                        # Validate and access parameters of the matching solution
                        if ($matchingSolution.'publishworkflows-activate-plugins' -ne $null -and $matchingSolution.'publishworkflows-activate-plugins' -ne "") {
                            $publishWorkflowsActivatePlugins = $matchingSolution.'publishworkflows-activate-plugins'
                            Write-Host "publishworkflows-activate-plugins: $publishWorkflowsActivatePlugins"
							$pacCommand += " --publish-workflows-activate-plugins $publishWorkflowsActivatePlugins"
                        } else {
                            Write-Host "publishworkflows-activate-plugins is missing or blank/null."
                        }

                        if ($matchingSolution.'overwrite-unmanaged-customizations' -ne $null -and $matchingSolution.'overwrite-unmanaged-customizations' -ne "") {
                            $overwriteUnmanagedCustomizations = $matchingSolution.'overwrite-unmanaged-customizations'
                            Write-Host "overwrite-unmanaged-customizations: $overwriteUnmanagedCustomizations"
							$pacCommand += " --overwrite-unmanaged-customizations $overwriteUnmanagedCustomizations"
                        } else {
                            Write-Host "overwrite-unmanaged-customizations is missing or blank/null."
                        }

                        if ($matchingSolution.'missing-dependency-behavior' -ne $null -and $matchingSolution.'missing-dependency-behavior' -ne "") {
                            $missingDependencyBehavior = $matchingSolution.'missing-dependency-behavior'
                            Write-Host "missing-dependency-behavior: $missingDependencyBehavior"
							$pacCommand += " --missing-dependency-behavior $missingDependencyBehavior"
                        } else {
                            Write-Host "missing-dependency-behavior is missing or blank/null."
                        }

                        if ($matchingSolution.'import-mode' -ne $null -and $matchingSolution.'import-mode' -ne "") {
                            $importMode = $matchingSolution.'import-mode'
                            Write-Host "import-mode: $importMode"
							$pacCommand += " --import-mode $importMode"
                        } else {
                            Write-Host "import-mode is missing or blank/null."
                        }
						
						if ($matchingSolution.'importorder' -ne $null -and $matchingSolution.'importorder' -ne "") {
                            $importOrder = $matchingSolution.'importorder'
                            Write-Host "importOrder: $importOrder"
							$pacCommand += " --import-order $importOrder"
                            # Solution Anchor Name in input.xml file can be Solution Name with Import order 1
                            if($importOrder -eq 1){
						        Write-Host "Setting Solution Anchor Name to $solutionName"
                                Write-Host "##vso[task.setVariable variable=SolutionAnchorName]$solutionName"
                            }							
                        } else {
                            Write-Host "importOrder is missing or blank/null."
                        }
					
                        Write-Host "Adding Pac Command - $pacCommand to array"
                        # Add the pac command to the array
                        $pacCommands += $pacCommand                        
                    }
                }

				if ($pacCommands.Count -gt 0) {
                    Set-Location -Path $packageDeployerProjectPath
				    foreach ($command in $pacCommands) {
                        Write-Host "Invoking Pac Command: $command"
                        # Perform actions with $command as needed
						Invoke-Expression -Command "$pacexepath $command"
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

    $jsonString = Get-Content -Path $projectConfigSettingsFilePath -Raw
    # Convert the JSON string to a PowerShell object
    $projects = $jsonString | ConvertFrom-Json | Select-Object -ExpandProperty Project
    # Find the project node by name
    $project = $projects | Where-Object { $_.name -eq $projectName }	

    if ($project -ne $null) {
        $solution = $project.solutions | Where-Object { Match-SolutionName -SolutionNameToMatch $solutionName -SolutionName $_.name }
		
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
function Copy-Published-Assets-To-AppSourceAssets {
    param(
        [Parameter(Mandatory)] [String]$packageDeployerProjectPath,
        [Parameter(Mandatory)] [String]$releaseArtifactsPath,
        [Parameter(Mandatory)] [String]$pdProjectAssetsFolderPath
    )

    $binPaths = @("bin\Release", "bin\Debug")
    $appSourcePackageFound = $false

    foreach ($binPath in $binPaths) {
        $binFullPath = Join-Path $packageDeployerProjectPath $binPath

        if (Test-Path $binFullPath) {
            $pdpkgFileCount = (Get-ChildItem "$binFullPath" -Filter *pdpkg.zip | Measure-Object).Count
            Write-Host "Count of .pdpkg.zip from $binFullPath - $pdpkgFileCount"

            if ($pdpkgFileCount -gt 0) {
                Write-Host "pdpkg.zip found under $binFullPath"
                Copy-Pdpkg-File $packageDeployerProjectPath $releaseArtifactsPath $binPath $pdProjectAssetsFolderPath
                $appSourcePackageFound = $true
                break  # Exit the loop once a valid package is found
            } else {
                Write-Host "pdpkg.zip not found under $binFullPath"
            }
        }
    }

    if ($pdpkgFileCount -eq 0) {
        Write-Host "pdpkg.zip not found; Exiting"
    }

    Write-Host "##vso[task.setVariable variable=AppSourcePackageFound]$appSourcePackageFound"
}

<#
This function creates a new App Source folder.
Compresses package deployer assets and moves them to newly created folder.
#>
function Move-PDProjectAppSourceAssets-to-Release-Path{
    param(
        [Parameter(Mandatory)] [String]$pdProjectAssetsFolderPath,
        [Parameter(Mandatory)] [String]$releaseArtifactsPath,
        [Parameter(Mandatory)] [String]$releaseZipName
    )

	# print the params
	Write-Host "ReleaseArtifactsPath - $releaseArtifactsPath"
	Write-Host "PDProjectAssetsFolderPath - $pdProjectAssetsFolderPath"
	Write-Host "ReleaseZipName - $releaseZipName"

	if(!(Test-Path "$pdProjectAssetsFolderPath")){
		Write-Host "Invalid PDProjectAssetsFolderPath - $pdProjectAssetsFolderPath. Exiting."
		return;
    }

    # Create the release assets folder if it doesn't exist
    if (!(Test-Path $releaseArtifactsPath)) {
        New-Item -Path $releaseArtifactsPath -ItemType Directory
    }

    # Create a temporary folder
    $tempFolder = Join-Path $releaseArtifactsPath "TempFolder"
    New-Item -Path $tempFolder -ItemType Directory

    # Copy components from source to temporary folder
    Get-ChildItem -Path $pdProjectAssetsFolderPath | Copy-Item -Destination $tempFolder

    # Zip the components in the temporary folder
    $zipFilePath = Join-Path $releaseArtifactsPath $releaseZipName
    Compress-Archive -Path $tempFolder\* -DestinationPath $zipFilePath -Force

    # Remove the temporary folder
    Remove-Item -Path $tempFolder -Force -Recurse

    Write-Host "PDProjectAssetsFolder - $pdProjectAssetsFolderPath components copied to $releaseArtifactsPath and zipped to $zipFilePath"
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
Moves the file to ReleaseAssets folder and AppSourceAssets folder
#>
function Copy-Pdpkg-File{
    param (
        [Parameter(Mandatory)] [String]$packageDeployerProjectPath,
        [Parameter(Mandatory)] [String]$releaseArtifactsPath,
        [Parameter(Mandatory)] [String]$binPath,
        [Parameter(Mandatory)] [String]$pdProjectAssetsFolderPath
    )

    Write-Host "pdpkg file found under $packageDeployerProjectPath\$binPath"
    Write-Host "Copying pdpkg.zip file to PDProjectAssetsFolderPath $pdProjectAssetsFolderPath"
	
	# Copy pdpkg.zip file to ReleaseAssets folder
    if(Test-Path "$pdProjectAssetsFolderPath"){
        Get-ChildItem "$packageDeployerProjectPath\$binPath" -Filter *pdpkg.zip | Copy-Item -Destination "$pdProjectAssetsFolderPath" -Force -PassThru
        Write-Host "Copied the pdpkg file to $pdProjectAssetsFolderPath"
    }
    else{
        Write-Host "PDProjectAssetsFolderPath $pdProjectAssetsFolderPath is unavailable to copy pdpkg file"
    }
            
    Write-Host "Copying pdpkg.zip file to ReleaseArtifactsPath $releaseArtifactsPath"
	if(Test-Path "$releaseArtifactsPath"){
        Get-ChildItem "$packageDeployerProjectPath\$binPath" -Filter *pdpkg.zip | Copy-Item -Destination "$releaseArtifactsPath" -Force -PassThru
        Write-Host "Copied the pdpkg file to $releaseArtifactsPath"
	}
	else{
        Write-Host "ReleaseArtifactsPath $releaseArtifactsPath Directory is unavailable to copy the pdpkg file"
    }
}

<#
 Fetches the configured solution name from the solution file.
#>
function Match-SolutionName {
    param (
        [string]$SolutionNameToMatch,
        [string]$SolutionName
    )

    Write-Host "SolutionName - $SolutionName"
    Write-Host "SolutionNameToMatch - $SolutionNameToMatch"

    # Use regex to extract the common part between the two strings
    $regex = "^($SolutionName).*$"
    $match = $SolutionNameToMatch -match $regex

    if ($match) {
        #Write-Host "Match!"
        $commonPart = $matches[1]
        return $commonPart
    } else {
        #Write-Host "No Match!"
        return $null
    }
}

<#
 Replaces the 'PowerCATPackage' with current project name.
#>
function Update-Package-Name {
    param (
        [string]$filePath,
        [string]$replacementText
    )

    # Check if the file exists
    if (Test-Path $filePath -PathType Leaf) {
        # Read the content of the file
        $fileContent = Get-Content -Path $filePath -Raw

        # Replace "PowerCATPackage" with the specified replacement text
        $modifiedContent = $fileContent -replace "PowerCATPackage", $replacementText

        # Save the modified content back to the file
        $modifiedContent | Set-Content -Path $filePath
        Write-Host "PD project file '$filePath' successfully modified."
    } else {
        Write-Host "PD project file '$filePath' not found."
    }
}