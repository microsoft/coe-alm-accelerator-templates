<#
This function returns an encoded text.
#>
function Get-Encoded-Text
{
    param (
        [Parameter(Mandatory)] [String]$originalText
    )

    Write-Host "OriginalText - $originalText"
    # Encode the text using Base64
    $encodedBytes = [System.Text.Encoding]::UTF8.GetBytes($originalText)
    $encodedText = [System.Convert]::ToBase64String($encodedBytes)

    Write-Host "EncodedText - $encodedText"
    return $encodedText
}

<#
This function returns a decoded text.
#>
function Get-Decoded-Text
{
    param (
        [Parameter(Mandatory)] [String]$encodedText
    )

    Write-Host "EncodedText - $encodedText"
    # Decode the Base64 encoded text
    $decodedBytes = [System.Convert]::FromBase64String($encodedText)
    $decodedText = [System.Text.Encoding]::UTF8.GetString($decodedBytes)

    Write-Host "DecodedText - $decodedText"
    return $decodedText
}

<#
This function checks if repetative 'Names' mentioned in 'UserSettings'.
If yes, returns the index
#>
function Get-IndicesOfNodesWithValue {
    param (
        [string]$jsonString,
        [string]$searchName,
        [string]$searchValue
    )

    try {
        Write-Host "Inside Get-IndicesOfNodesWithValue"
        Write-Host "JsonString - $jsonString"
        Write-Host "SearchName - $searchName"
        Write-Host "SearchValue - $searchValue"
        $jsonArray = ConvertFrom-Json $jsonString
        $matchingIndex = -1

        $nameMatches = @()

        for ($i = 0; $i -lt $jsonArray.Count; $i++) {
            if ($jsonArray[$i].Name -eq $searchName) {
                $nameMatches += ($i + 1)
            }
        }

        Write-Host "nameMatches count - $($nameMatches.Count)"
        if ($nameMatches.Count -gt 1) {
            for ($j = 0; $j -lt $nameMatches.Count; $j++) {
                $index = $nameMatches[$j] - 1
                Write-Host "jsonArray[index].Value - $($jsonArray[$index].Value)"
                Write-Host "searchValue - $searchValue"
                if ($jsonArray[$index].Value -eq $searchValue) {
                    Write-Host "Matched found for SearchValue - $searchValue"
                    $matchingIndex = ($j + 1)
                    break
                }
            }
        }

        return $matchingIndex
    }
    catch {
        Write-Host "Error parsing JSON: $_"
        return -1
    }
}

<#
Sometimes GUID contains underscore (incase of multiple share with teams scenario).
This function trims and validates the GUID.
#>
function Validate-And-Clean-Guid {
    param (
        [string]$inputGuid
    )

    try {
        # Use a regular expression to match the GUID pattern
        if ($inputGuid -match '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
            return $Matches[1]
        } else {
            Write-Host "Invalid GUID format: $inputGuid"
            return $null
        }
    } catch {
        Write-Host "An error occurred during GUID validation: $_"
        return $null
    }
}