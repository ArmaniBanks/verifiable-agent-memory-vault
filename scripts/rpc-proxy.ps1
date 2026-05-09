param(
  [string]$ListenPrefix = "http://127.0.0.1:18545/",
  [string]$TargetUrl = "https://evmrpc.0g.ai"
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($ListenPrefix)
$listener.Start()
Write-Host "0G RPC proxy listening on $ListenPrefix -> $TargetUrl"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $reader = New-Object System.IO.StreamReader($context.Request.InputStream, $context.Request.ContentEncoding)
      $body = $reader.ReadToEnd()
      $reader.Close()

      $response = Invoke-WebRequest -Uri $TargetUrl -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($response.Content)

      $context.Response.StatusCode = [int]$response.StatusCode
      $context.Response.ContentType = "application/json"
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $message = '{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"RPC proxy error"}}'
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($message)
      $context.Response.StatusCode = 502
      $context.Response.ContentType = "application/json"
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally {
      $context.Response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}

