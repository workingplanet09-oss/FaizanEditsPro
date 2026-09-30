<?php
/** Minimal outbound HTTP client (cURL when available, PHP streams otherwise). Used for email/payment/OAuth providers. */
defined('FEP') or exit;

/** @return array{status:int,body:string,headers:array<string,string>} ; status 0 = could not connect */
function http_request(string $method, string $url, array $headers = [], ?string $body = null, int $timeoutSec = 15): array
{
    $hdrs = [];
    foreach ($headers as $k => $v) {
        $hdrs[] = "{$k}: {$v}";
    }
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $respHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $hdrs,
            CURLOPT_TIMEOUT => $timeoutSec,
            CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSec),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$respHeaders) {
                if (str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $respHeaders[strtolower(trim($k))] = trim($v);
                }
                return strlen($line);
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $out = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ['status' => $out === false ? 0 : $status, 'body' => $out === false ? '' : (string)$out, 'headers' => $respHeaders];
    }
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $hdrs), 'content' => $body ?? '', 'timeout' => $timeoutSec, 'ignore_errors' => true, 'follow_location' => 0], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $out = @file_get_contents($url, false, $ctx);
    $status = 0;
    $respHeaders = [];
    foreach ($http_response_header ?? [] as $i => $line) {
        if ($i === 0 && preg_match('#HTTP/\S+\s+(\d+)#', $line, $m)) {
            $status = (int)$m[1];
        } elseif (str_contains($line, ':')) {
            [$k, $v] = explode(':', $line, 2);
            $respHeaders[strtolower(trim($k))] = trim($v);
        }
    }
    return ['status' => $out === false ? 0 : $status, 'body' => $out === false ? '' : $out, 'headers' => $respHeaders];
}
