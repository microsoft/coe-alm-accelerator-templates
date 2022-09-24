function npm-install-pcf-Projects{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory
    )

      $pcfProjectFiles = Get-ChildItem -Path $buildSourceDirectory -Filter *.pcfproj -Recurse
      foreach($pcfProj in $pcfProjectFiles)
      {     
        Write-Host "fullPath - "$pcfProj.FullName
        $fullPath = $pcfProj.FullName
        $pcfProjectRootPath = [System.IO.Path]::GetDirectoryName($fullPath)
              
        Write-Host "Dir Name - "$pcfProjectRootPath
        npm ci $pcfProjectRootPath --prefix $pcfProjectRootPath    
      }   
}

function npm-build-pcf-Projects{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo
    )

      $pcfProjectFiles = Get-ChildItem -Path "$buildSourceDirectory\$repo" -Filter *.pcfproj -Recurse
      foreach($pcfProj in $pcfProjectFiles)
      {     
        Write-Host "fullPath - " $pcfProj.FullName
        $fullPath = $pcfProj.FullName
        $pcfProjectRootPath = [System.IO.Path]::GetDirectoryName($fullPath)
              
        Write-Host "Dir Name - " $pcfProjectRootPath
        Set-Location -Path $pcfProjectRootPath
        # npm run build 
        npm run build -- --mode Release
      } 
}

function pcf-Projects-install-npm{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo
    )

      $pcfProjectFiles = Get-ChildItem -Path "$buildSourceDirectory\$repo" -Filter *.pcfproj -Recurse
      foreach($pcfProj in $pcfProjectFiles)
      {
        $fullPath = $pcfProj.FullName
        # Point cmd to pcfproj directory
        set-cmd-Path "$fullPath"
        
        npm install
      } 
}

function set-cmd-Path{
     param (
            [Parameter(Mandatory)] [String]$filePath
     )

    If(Test-Path "$filePath")
    {
        $folderPath = [System.IO.Path]::GetDirectoryName("$filePath")
              
        Write-Host "Dir Name - " $folderPath
        Set-Location -Path $folderPath
    }
}

function add-pcf-Projects-to-cdsproj{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$pacPath
    )
    if (-not ([string]::IsNullOrEmpty($pacPath)) -and (Test-Path "$pacPath\pac.exe"))
    {
        Write-Host "Executing Pac Auth List command"
        $pacexepath = "$pacPath\pac.exe"
        $authCommand = "auth list"
        Write-Host "Pac command - $pacexepath $authCommand"

        Invoke-Expression -Command "$pacexepath $authCommand"

        # Set location to .cdsproj Path
        $cdsProjPath = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\$solutionName.cdsproj"
        Write-Host "cdsProjPath - $cdsProjPath"
        if(Test-Path $cdsProjPath)
        {
            Write-Host "Cds Proj File Found!!!"
            $cdsProjectRootPath = [System.IO.Path]::GetDirectoryName($cdsProjPath)
            Set-Location -Path $cdsProjectRootPath
          
          # Get all pcfproject files under Repo/Commited Solution folder
          $pcfProjectFiles = Get-ChildItem -Path "$buildSourceDirectory\$repo\$solutionName" -Filter *.pcfproj -Recurse
          foreach($pcfProj in $pcfProjectFiles)
          {     
            Write-Host "Adding Reference of Pcf Project - " $pcfProj.FullName
            $pcfProjectPath = $pcfProj.FullName

            $addReferenceCommand = "solution add-reference -p $pcfProjectPath"
            Write-Host "Add Reference Command - $addReferenceCommand"
            Invoke-Expression -Command "$pacexepath $addReferenceCommand"
          } 
        }
        else
        {
            Write-Host "Cds Proj File Not Found!!!"
        }
    }
    else
    {
        Write-Host "pac not installed!!!"
    }
}

function build-cdsproj{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$pacexePath
    )
    # Set location to .cdsproj Path
    $cdsProjPath = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\$solutionName.cdsproj"
    Write-Host "cdsProjPath - $cdsProjPath"
    if(Test-Path $cdsProjPath)
    {
        Write-Host "Cds Proj File Found!!!"
        $cdsProjectRootPath = [System.IO.Path]::GetDirectoryName($cdsProjPath)
        Set-Location -Path $cdsProjectRootPath

        # Run Build Command
        msbuild /t:build /restore
    }
    else
    {
        Write-Host "Cds Proj File not Found!!!"
    }
}

function check-code-first-components{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo
    )
    $path = "$buildSourceDirectory\$repo"
    $totalCSproj = (Get-ChildItem -Path $path -force -Recurse | Where-Object Extension -eq '.csproj' | Measure-Object).Count
    $totalpcfproj = (Get-ChildItem -Path $path -force -Recurse | Where-Object Extension -eq '.pcfproj' | Measure-Object).Count
    [bool] $isCSProjExists = ($totalCSproj -gt 0)
    [bool] $isPCFProjExists = ($totalpcfproj -gt 0)
    [bool] $isCodeFirstProjectExists = ($isCSProjExists -or $isPCFProjExists)
    Write-Host "##vso[task.setvariable variable=pluginsexists;]$isCSProjExists"
    Write-Host "##vso[task.setvariable variable=pcfsexists;]$isPCFProjExists"
    Write-Host "##vso[task.setvariable variable=codefirstexists;]$isCodeFirstProjectExists"
}

function install-pac-and-authenticate{
    param (
        [Parameter(Mandatory)] [String]$serviceConnectionUrl,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$tenantID
    )
    $pacexepath = $null
    $outFolder = "pac"
    $nugetPackage = "Microsoft.PowerApps.CLI"
    nuget install $nugetPackage -OutputDirectory $outFolder

    $pacNugetFolder = Get-ChildItem $outFolder | Where-Object {$_.Name -match $nugetPackage + "."}
    $pacPath = $pacNugetFolder.FullName + "\tools"
    echo "##vso[task.setvariable variable=pacPath]$pacPath"
    if(Test-Path "$pacPath\pac.exe")
    {
        $pacexepath = "$pacPath\pac.exe"
        #Invoke-Expression -Command "$pacexepath auth create --url ${{parameters.serviceConnectionUrl}} --name ppdev --applicationId $(ClientId) --clientSecret $(ClientSecret) --tenant $(TenantID)"
        Invoke-Expression -Command "$pacexepath auth create --url $serviceConnectionUrl --name ppdev --applicationId $clientId --clientSecret $clientSecret --tenant $tenantID"
    }
    else
    {
        Write-Host "pac.exe NOT found"
    }

    return $pacexepath
}

function clone-or-sync-solution{
    param (
        [Parameter(Mandatory)] [String]$serviceConnectionUrl,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$tenantID,
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName
    )
    $pacexepath = $null
    $outFolder = "pac"
    $nugetPackage = "Microsoft.PowerApps.CLI"
    nuget install $nugetPackage -OutputDirectory $outFolder

    $pacNugetFolder = Get-ChildItem $outFolder | Where-Object {$_.Name -match $nugetPackage + "."}
    $pacPath = $pacNugetFolder.FullName + "\tools"
    $pacexepath = "$pacPath\pac.exe"
    if(Test-Path "$pacexepath")
    {
        # Trigger Auth
        Invoke-Expression -Command "$pacexepath auth create --url $serviceConnectionUrl --name ppdev --applicationId $clientId --clientSecret $clientSecret --tenant $tenantID"
        $unpackfolderpath = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage"

        # Trigger Clone or Sync
        $cdsProjPath = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\$solutionName.cdsproj"
        # If .cds project file exists (i.e., Clone performed already) trigger Sync
        if(Test-Path "$cdsProjPath")
        {
            Write-Host "Cloned solution available; Triggering Solution Sync"
            # Point cmd to cdsproj file directory
            set-cmd-Path "$cdsProjPath"
            $syncCommand = "solution sync -pca true -o $unpackfolderpath -p Both"
            Write-Host "Triggering Sync"
            Invoke-Expression -Command "$pacexepath $syncCommand"
        }
        else {
            if(Test-Path "$buildSourceDirectory\$repo\$solutionName\SolutionPackage"){ # Legacy folder structure
                # Delete "SolutionPackage" folder
                Remove-Item "$buildSourceDirectory\$repo\$solutionName\SolutionPackage" -Force
            }

            # Trigger Clone
            $cloneCommand = "solution clone -n $solutionName -pca true -o $unpackfolderpath -p Both"
            Write-Host "Clone Command - $pacexepath $cloneCommand"
            Invoke-Expression -Command "$pacexepath $cloneCommand"
        }        
    }
    ## Install Pac and Authenticate
    #$pacexepath = install-pac-and-authenticate "$serviceConnectionUrl" "$clientId" "$clientSecret" "$tenantID"
}

function add-packagetype-node-to-cdsproj{
    param (
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName
    )
    $cdsProjPath = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\$solutionName.cdsproj"

    if(Test-Path $cdsProjPath){
        $cdsContent = Get-Content -Path $cdsProjPath
        [xml]$xmlDoc = $cdsContent

        $newPropertyGroup = $xmlDoc.Project.AppendChild($xmlDoc.CreateElement("PropertyGroup",$xmlDoc.Project.NamespaceURI));
        $newSolPkgType = $newPropertyGroup.AppendChild($xmlDoc.CreateElement("SolutionPackageType",$xmlDoc.Project.NamespaceURI));
        $newSolPkgTypeTextNode = $newSolPkgType.AppendChild($xmlDoc.CreateTextNode("Both"));

        $xmlDoc.save("$cdsProjPath")
    }
    else{
        Write-Host "cdsproj file unavailble at - $cdsProjPath"
    }
}

function restructure-legacy-folders{
    param (
        [Parameter(Mandatory)] [String]$artifactStagingDirectory,
        [Parameter(Mandatory)] [String]$buildSourceDirectory,
        [Parameter(Mandatory)] [String]$repo,
        [Parameter(Mandatory)] [String]$solutionName,
        [Parameter(Mandatory)] [String]$pacPath
    )
    $cdsProjPath = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\$solutionName.cdsproj"

    # Legacy folder structure "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\{unpackedcomponents}"
    # New folder structure "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\src\{unpackedcomponents}"
    if(-not (Test-Path $cdsProjPath)){
        # Move unpacked files from legacy to new folder
        # While moving Destination path cannot be a subdirectory of the source
        # Hence copy files to temp location first and then to new folder location
        $sourceDirectory  = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\"
        $tempSolPackageDirectory  = "$artifactStagingDirectory\temp_SolutionPackage"
        Write-Host "Moving files to temp directory"
        Get-ChildItem -Path "$sourceDirectory" -Recurse | Move-Item -Destination "$tempSolPackageDirectory" -Force

        # Create new folder structure
        New-Item -ItemType "directory" -Path "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\src"

        # Move unpacked files from legacy to new folder
        # While moving Destination path cannot be a subdirectory of the source
        # Hence copy files to temp location first and then to new folder location
        $destinationDirectory = "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\src\"
        Write-Host "Moving files to $destinationDirectory directory"
        Get-ChildItem -Path "$tempSolPackageDirectory" -Recurse | Move-Item -Destination "$destinationDirectory" -Force

        # Generate .cdsproj file by triggering Clone
        $temp_clone_path = "$artifactStagingDirectory\temp_clone"
        $cloneCommand = "solution clone -n $solutionName -pca true -o $temp_clone_path -p Both"
        Write-Host "Clone Command - $pacPath\pac.exe $cloneCommand"
        Invoke-Expression -Command "$pacPath\pac.exe $cloneCommand"

        # Copy .cdsprojfile from temp to new folder structure
        $temp_cdsProjPath = "$artifactStagingDirectory\temp_clone\$solutionName\$solutionName.cdsproj"
        Write-Host "temp_cdsProjPath - $temp_cdsProjPath"
        if(Test-Path "$temp_cdsProjPath")
        {
            Copy-Item "$temp_cdsProjPath" -Destination "$buildSourceDirectory\$repo\$solutionName\SolutionPackage\$solutionName\"
            # Delete 
        }
        else{
            Write-Host "cdsproj file unavailble at temp path - $temp_cdsProjPath"
        }
    }
    else{
        Write-Host "Valid folder structure. No need of restructure"
    }
}