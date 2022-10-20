# Testable outside of agent
function Get-SpnToken {
    [OutputType([String])]
    param (
        [Parameter(Mandatory)] [String]$tenantId,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$dataverseHost,
        [Parameter(Mandatory)] [String]$aadHost
    )
    $body = @{client_id = $clientId; client_secret = $clientSecret; grant_type = "client_credentials"; scope = "https://$dataverseHost/.default"; }
    $OAuthReq = Invoke-RestMethod -Method Post -Uri "https://$aadHost/$tenantId/oauth2/v2.0/token" -Body $body

    return $OAuthReq.access_token
}

function Get-HostFromUrl {
    [OutputType([String])]
    param (
        [Parameter(Mandatory)] [String]$url
    )
    $options = [System.StringSplitOptions]::RemoveEmptyEntries
    return $url.Split("://", $options)[1].Split("/")[0]
}

# Convenient inside of agent
function Set-SpnTokenVariableWithinAgent {    
    [OutputType([void])]
    param (
        [Parameter(Mandatory)] [String]$tenantId,
        [Parameter(Mandatory)] [String]$clientId,
        [Parameter(Mandatory)] [String]$clientSecret,
        [Parameter(Mandatory)] [String]$serviceConnection,
        [Parameter(Mandatory)] [String]$aadHost
    )
    $dataverseHost = Get-HostFromUrl $serviceConnection
      
    $spnToken = Get-SpnToken $tenantId $clientId $clientSecret $dataverseHost $aadHost

    Write-Host "##vso[task.setvariable variable=SpnToken;issecret=true]$spnToken"
}

function Set-DefaultHeaders {
    [OutputType([System.Collections.Generic.Dictionary[string, string]])]
    param (
        [Parameter(Mandatory)] [String]$token
    )
    $headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
    $headers.Add("Authorization", "Bearer $token")
    $headers.Add("Content-Type", "application/json")
    return $headers
}

function Set-RequestUrl {
    [OutputType([String])]
    param (
        [Parameter(Mandatory)] [String]$dataverseHost,
        [Parameter(Mandatory)] [String]$requestUrlRemainder
    )
    $requestUrl = "https://$dataverseHost/api/data/v9.2/$requestUrlRemainder"
    return $requestUrl    
}

function Invoke-DataverseHttpGet {
    param (
        [Parameter(Mandatory)] [String]$token,
        [Parameter(Mandatory)] [String]$dataverseHost,
        [Parameter(Mandatory)] [String]$requestUrlRemainder
    )
    $headers = Set-DefaultHeaders $token
    $requestUrl = Set-RequestUrl $dataverseHost $requestUrlRemainder
    $response = Invoke-RestMethod $requestUrl -Method 'GET' -Headers $headers
    return $response
}

function Invoke-DataverseHttpPost {
    param (
        [Parameter(Mandatory)] [String]$token,
        [Parameter(Mandatory)] [String]$dataverseHost,
        [Parameter(Mandatory)] [String]$requestUrlRemainder,
        [Parameter(Mandatory)] [String]$body
    )
    $headers = Set-DefaultHeaders $token
    $requestUrl = Set-RequestUrl $dataverseHost $requestUrlRemainder
    $response = Invoke-RestMethod $requestUrl -Method 'POST' -Headers $headers -Body $body
    return $response
}

function Invoke-DataverseHttpPatch {
    param (
        [Parameter(Mandatory)] [String]$token,
        [Parameter(Mandatory)] [String]$dataverseHost,
        [Parameter(Mandatory)] [String]$requestUrlRemainder,
        [Parameter(Mandatory)] [String]$body,
        [Parameter()] [string]$etag = "*"
    )
    $headers = Set-DefaultHeaders $token
    $headers.Add("If-Match", $etag)
    $headers.Add("Prefer", "return=representation")
    $requestUrl = Set-RequestUrl $dataverseHost $requestUrlRemainder
    $response = Invoke-RestMethod $requestUrl -Method 'PATCH' -Headers $headers -Body $body
    return $response
}