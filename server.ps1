$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8001/")
$listener.Start()
Write-Host "Server started at http://localhost:8001"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    
    $localPath = $request.Url.LocalPath
    if ($localPath -eq "/") {
        $localPath = "/index.html"
    }
    
    $filePath = Join-Path "E:\trae app\nexus-localization-toolkit" $localPath.TrimStart("/")
    
    if (Test-Path $filePath -PathType Leaf) {
        $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = switch ($extension) {
            ".html" { "text/html" }
            ".css" { "text/css" }
            ".js" { "application/javascript" }
            ".json" { "application/json" }
            ".svg" { "image/svg+xml" }
            default { "application/octet-stream" }
        }
        
        $response.ContentType = $contentType
        
        try {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $response.StatusCode = 500
        }
    } else {
        $response.StatusCode = 404
    }
    
    $response.Close()
}