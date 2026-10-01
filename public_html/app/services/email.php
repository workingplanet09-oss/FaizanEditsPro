<?php
/**
 * Email: templates → the email log (Admin → Emails) → delivery through the configured driver.
 *
 * Templates are plain text with a tiny, safe markup so admins can edit them without HTML:
 *   {{variable}}                 – replaced (values are inserted as text)
 *   [[Button label|https://…]]   – rendered as a button
 *   [link text](https://…)       – rendered as a link
 *   blank line                   – new paragraph
 * All text is HTML-escaped; only http(s), mailto and relative URLs are linkified.
 *
 * Drivers (config.php → email.driver): log · mail · smtp · resend · postmark · sendgrid.
 * Missing credentials never break the site: the message is kept in the log with a clear error and retried later.
 */
defined('FEP') or exit;

defined('FEP') or exit;

function fill_vars(string $tpl, array $vars): string
{
    return preg_replace_callback('/\{\{\s*([a-z0-9_]+)\s*\}\}/i', fn($m) => isset($vars[$m[1]]) ? (string)$vars[$m[1]] : '', $tpl) ?? $tpl;
}

function email_safe_url(string $u): string
{
    $u = trim($u);
    return preg_match('#^(https?://|/|mailto:)#i', $u) ? $u : '#';
}

function render_email_html(string $text, array $brand): string
{
    $out = '';
    foreach (preg_split('/\n{2,}/', trim($text)) ?: [] as $block) {
        if (preg_match('/^\[\[(.+?)\|(.+?)\]\]$/s', $block, $m)) {
            $out .= '<p style="margin:24px 0"><a href="' . e(email_safe_url($m[2])) . '" style="background:' . e($brand['accent']) . ';color:#0b0b0c;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">' . e($m[1]) . '</a></p>';
            continue;
        }
        $html = e($block);
        $html = preg_replace_callback('/\[([^\]]+)\]\(([^)]+)\)/', fn($m) => '<a href="' . e(email_safe_url(str_replace('&amp;', '&', $m[2]))) . '" style="color:' . e($brand['accent']) . '">' . $m[1] . '</a>', $html);
        $out .= '<p style="margin:0 0 16px;line-height:1.6">' . str_replace("\n", '<br>', $html) . '</p>';
    }
    $name = e($brand['name']);
    return '<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#151517"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="font-weight:800;font-size:18px;margin-bottom:24px;letter-spacing:-.01em">' . $name . '</div><div style="background:#fff;border-radius:16px;padding:28px 28px 12px;border:1px solid #e6e4dc">' . $out . '</div><div style="color:#8a8a8f;font-size:12px;margin-top:18px;line-height:1.5">You\'re receiving this because of activity on your ' . $name . ' account. Manage notification preferences in your portal settings.</div></div></body></html>';
}

function render_email_text(string $text): string
{
    $t = preg_replace('/\[\[(.+?)\|(.+?)\]\]/s', '$1: $2', $text);
    return trim(preg_replace('/\[([^\]]+)\]\(([^)]+)\)/', '$1 ($2)', $t) ?? $t);
}

/** Sign-in, invite and reset links carry a bearer token. Once delivered, the stored copy no longer needs it. */
function scrub_tokens(string $body): string
{
    return preg_replace('/([?&]token=)[A-Za-z0-9_-]{16,}/', '$1[removed]', $body) ?? $body;
}

/** Renders a template (or the fallback subject/body) into the email log and enqueues delivery. $in: workspaceId,toEmail,toUserId?,templateKey?,vars?,subject?,body?,metadata? */
function queue_email(array $in): ?array
{
    $s = get_settings($in['workspaceId'], ['business', 'theme']);
    $vars = array_merge(['business_name' => $s['business']['name'], 'support_email' => $s['business']['email']], $in['vars'] ?? []);
    $subject = $in['subject'] ?? '';
    $body = $in['body'] ?? '';
    if (!empty($in['templateKey'])) {
        $tpl = Db::first('email_templates', ['workspaceId' => $in['workspaceId'], 'key' => $in['templateKey']]);
        if ($tpl && !$tpl['enabled']) {
            return null; // admin switched this email off
        }
        if ($tpl) {
            $subject = $tpl['subject'];
            $body = $tpl['body'];
        }
    }
    if ($subject === '' || $body === '') {
        return null;
    }
    $log = Db::insert('email_logs', [
        'workspaceId' => $in['workspaceId'], 'toEmail' => $in['toEmail'], 'toUserId' => $in['toUserId'] ?? null,
        'subject' => fill_vars($subject, $vars), 'body' => fill_vars($body, $vars), 'templateKey' => $in['templateKey'] ?? null,
        'metadata' => array_merge($in['metadata'] ?? [], ['accent' => $s['theme']['accent'], 'brand' => $s['business']['name']]),
    ]);
    enqueue_job('email.send', ['emailLogId' => $log['id']]);
    return $log;
}

function email_config(): array
{
    return (array)cfg('email', []) + ['driver' => 'log', 'from' => 'Studio <hello@example.com>', 'api_key' => '', 'smtp' => []];
}

/** Job handler: actually delivers a queued email through the configured driver. */
function deliver_email(string $emailLogId): void
{
    $log = Db::first('email_logs', ['id' => $emailLogId]);
    if (!$log || $log['status'] === 'SENT') {
        return;
    }
    $meta = $log['metadata'] ?? [];
    $brand = ['name' => $meta['brand'] ?? 'Studio', 'accent' => $meta['accent'] ?? '#FF5B2E'];
    try {
        $res = send_via_driver(['from' => email_config()['from'], 'to' => $log['toEmail'], 'subject' => $log['subject'], 'html' => render_email_html($log['body'], $brand), 'text' => render_email_text($log['body'])]);
        // The `log` driver has no real inbox — the log IS the inbox in demo/trial mode — so it keeps the full body.
        $update = ['status' => 'SENT', 'provider' => $res['provider'], 'providerMessageId' => $res['id'] ?? null, 'sentAt' => db_dt(), 'error' => null];
        if ($res['provider'] !== 'log') {
            $update['body'] = scrub_tokens($log['body']);
        }
        Db::update('email_logs', ['id' => $log['id']], $update);
    } catch (Throwable $e) {
        Db::update('email_logs', ['id' => $log['id']], ['status' => 'FAILED', 'error' => mb_substr($e->getMessage(), 0, 500)]);
        throw $e; // let the queue retry with backoff
    }
}

/** @return array{provider:string,id?:?string} */
function send_via_driver(array $m): array
{
    $c = email_config();
    $driver = (string)$c['driver'];
    if ($driver === 'log') {
        return ['provider' => 'log'];
    }
    if ($driver === 'mail') {
        [$fromName, $fromAddr] = parse_mailbox($m['from']);
        $boundary = 'b' . bin2hex(random_bytes(8));
        $headers = "From: " . mail_header_addr($fromName, $fromAddr) . "\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"{$boundary}\"";
        $body = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($m['text'])) . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($m['html'])) . "--{$boundary}--";
        if (!@mail($m['to'], '=?UTF-8?B?' . base64_encode($m['subject']) . '?=', $body, $headers, '-f' . $fromAddr)) {
            throw new RuntimeException('PHP mail() refused the message. Use the smtp driver or check the hosting mail settings.');
        }
        return ['provider' => 'mail'];
    }
    if ($driver === 'smtp') {
        return ['provider' => 'smtp', 'id' => smtp_send((array)$c['smtp'], $m)];
    }
    $key = (string)$c['api_key'];
    if ($key === '') {
        throw new AppError('NOT_CONFIGURED', "Email driver “{$driver}” needs email.api_key in config.php");
    }
    if ($driver === 'resend') {
        $r = http_request('POST', 'https://api.resend.com/emails', ['authorization' => "Bearer {$key}", 'content-type' => 'application/json'], json_enc(['from' => $m['from'], 'to' => [$m['to']], 'subject' => $m['subject'], 'html' => $m['html'], 'text' => $m['text']]), 20);
        $j = json_dec($r['body'], []);
        if ($r['status'] < 200 || $r['status'] >= 300) {
            throw new RuntimeException("Resend error {$r['status']}: " . ($j['message'] ?? 'unknown'));
        }
        return ['provider' => 'resend', 'id' => $j['id'] ?? null];
    }
    if ($driver === 'postmark') {
        $r = http_request('POST', 'https://api.postmarkapp.com/email', ['X-Postmark-Server-Token' => $key, 'content-type' => 'application/json', 'accept' => 'application/json'], json_enc(['From' => $m['from'], 'To' => $m['to'], 'Subject' => $m['subject'], 'HtmlBody' => $m['html'], 'TextBody' => $m['text'], 'MessageStream' => 'outbound']), 20);
        $j = json_dec($r['body'], []);
        if ($r['status'] < 200 || $r['status'] >= 300) {
            throw new RuntimeException("Postmark error {$r['status']}: " . ($j['Message'] ?? 'unknown'));
        }
        return ['provider' => 'postmark', 'id' => $j['MessageID'] ?? null];
    }
    if ($driver === 'sendgrid') {
        [$name, $addr] = parse_mailbox($m['from']);
        $r = http_request('POST', 'https://api.sendgrid.com/v3/mail/send', ['authorization' => "Bearer {$key}", 'content-type' => 'application/json'], json_enc([
            'personalizations' => [['to' => [['email' => $m['to']]]]], 'from' => $name !== '' ? ['name' => $name, 'email' => $addr] : ['email' => $addr],
            'subject' => $m['subject'], 'content' => [['type' => 'text/plain', 'value' => $m['text']], ['type' => 'text/html', 'value' => $m['html']]],
        ]), 20);
        if ($r['status'] < 200 || $r['status'] >= 300) {
            throw new RuntimeException("SendGrid error {$r['status']}: " . mb_substr($r['body'], 0, 200));
        }
        return ['provider' => 'sendgrid', 'id' => $r['headers']['x-message-id'] ?? null];
    }
    throw new AppError('NOT_CONFIGURED', "Unknown email driver “{$driver}”");
}

/** "Studio <hello@x.com>" → ['Studio', 'hello@x.com'] */
function parse_mailbox(string $s): array
{
    if (preg_match('/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/', $s, $m)) {
        return [trim($m[1]), trim($m[2])];
    }
    return ['', trim($s)];
}

function mail_header_addr(string $name, string $addr): string
{
    $addr = str_replace(["\r", "\n"], '', $addr);
    return $name !== '' ? '=?UTF-8?B?' . base64_encode(str_replace(["\r", "\n"], '', $name)) . "?= <{$addr}>" : $addr;
}

/** Sends one message over SMTP (implicit TLS on 465, STARTTLS on 587, or plain). Returns the Message-ID. */
function smtp_send(array $cfg, array $m): string
{
    $host = (string)($cfg['host'] ?? 'localhost');
    $port = (int)($cfg['port'] ?? 465);
    $enc = strtolower((string)($cfg['encryption'] ?? 'ssl'));
    $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $errno = 0;
    $errstr = '';
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]]));
    if (!$fp) {
        throw new RuntimeException("Could not connect to the mail server ({$host}:{$port}).");
    }
    stream_set_timeout($fp, 20);
    $read = function () use ($fp): array {
        $lines = '';
        $code = 0;
        while (($line = fgets($fp, 1024)) !== false) {
            $lines .= $line;
            if (preg_match('/^(\d{3})([ -])/', $line, $mm)) {
                $code = (int)$mm[1];
                if ($mm[2] === ' ') {
                    break;
                }
            }
        }
        return [$code, $lines];
    };
    $cmd = function (string $line, array $expect) use ($fp, $read): string {
        fwrite($fp, $line . "\r\n");
        [$code, $resp] = $read();
        if (!in_array($code, $expect, true)) {
            throw new RuntimeException('Mail server replied: ' . trim(mb_substr($resp, 0, 200)));
        }
        return $resp;
    };
    try {
        [$code] = $read();
        if ($code !== 220) {
            throw new RuntimeException('Mail server did not greet us.');
        }
        $helo = preg_replace('/[^a-z0-9.\-]/i', '', (string)parse_url(app_url(), PHP_URL_HOST)) ?: 'localhost';
        $cmd("EHLO {$helo}", [250]);
        if ($enc === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Could not start TLS with the mail server.');
            }
            $cmd("EHLO {$helo}", [250]);
        }
        if (!empty($cfg['user'])) {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode((string)$cfg['user']), [334]);
            $cmd(base64_encode((string)($cfg['password'] ?? '')), [235]);
        }
        [$fromName, $fromAddr] = parse_mailbox($m['from']);
        [, $toAddr] = parse_mailbox($m['to']);
        $cmd("MAIL FROM:<{$fromAddr}>", [250]);
        $cmd("RCPT TO:<{$toAddr}>", [250, 251]);
        $cmd('DATA', [354]);
        $boundary = 'b' . bin2hex(random_bytes(8));
        $msgId = '<' . bin2hex(random_bytes(12)) . '@' . $helo . '>';
        $data = "Date: " . gmdate('r') . "\r\nFrom: " . mail_header_addr($fromName, $fromAddr) . "\r\nTo: {$toAddr}\r\nSubject: =?UTF-8?B?" . base64_encode(str_replace(["\r", "\n"], ' ', $m['subject'])) . "?=\r\nMessage-ID: {$msgId}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n\r\n"
            . "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($m['text']))
            . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($m['html']))
            . "--{$boundary}--\r\n";
        fwrite($fp, $data . "\r\n.\r\n");
        [$code, $resp] = $read();
        if ($code !== 250) {
            throw new RuntimeException('Mail server rejected the message: ' . trim(mb_substr($resp, 0, 200)));
        }
        @fwrite($fp, "QUIT\r\n");
        return $msgId;
    } finally {
        @fclose($fp);
    }
}
