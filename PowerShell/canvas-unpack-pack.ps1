function Invoke-CanvasUnpackPack {
    param (
        [Parameter(Mandatory)] [String]$packOrUnpack,
        [Parameter(Mandatory)] [String]$source,
        [Parameter(Mandatory)] [String]$destination
    )
    Write-Information "Loading Assemblies"
    Get-ChildItem -Path "..\PowerAppsLanguageTooling\" -Recurse -Filter *.dll |
    ForEach-Object {
        [System.Reflection.Assembly]::LoadFrom($_.FullName)
    }
    if ($packOrUnpack -eq 'pack') {
        Write-Information "Packing $source to $destination"
        $results = [Microsoft.PowerPlatform.Formulas.Tools.CanvasDocument]::LoadFromSources($source)
        if($results.HasErrors) {
            throw $results.Item2.ToString();
            return
        } else {
            Write-Information $results.Item2.ToString()
        }
        $saveResults = $results.Item1.SaveToMsApp($destination)
        if($saveResults.HasErrors) {
            throw $saveResults.ToString();
            return
        }
        else {
            Write-Information $saveResults.ToString()
        }
    }
    else {
        if ($packOrUnpack -eq 'unpack') {
            Write-Information "Unpacking $source to $destination"
            $results = [Microsoft.PowerPlatform.Formulas.Tools.CanvasDocument]::LoadFromMsapp($source)
            if($results.HasErrors) {
                throw $results.Item2.ToString();
                return
            } else {
                Write-Information $results.Item2.ToString()
            }
    
            $saveResults = $results.Item1.SaveToSources($destination)
            if($saveResults.HasErrors) {
                throw $saveResults.ToString();
                return
            }
            else {
                Write-Information $saveResults.ToString()
            }
        }
        else {
            throw "Invalid packOrUnpack parameter. Must be 'pack' or 'unpack'.";
        }
    }
}