function Invoke-CanvasUnpackPack($packOrUnpack, $source, $destination) {
    if ($packOrUnpack -eq 'pack') {
        Write-Host "Packing $source to $destination"
        ..\PowerPlatformCLI\pac.exe canvas pack --sources $source --msapp $destination
    }
    else {
        if ($packOrUnpack -eq 'unpack') {
            Write-Host "Unpacking $source to $destination"
            ..\PowerPlatformCLI\pac.exe canvas unpack --msapp $source --sources $destination
        }
        else {
            throw "Invalid packOrUnpack parameter. Must be 'pack' or 'unpack'.";
        }
    }
}