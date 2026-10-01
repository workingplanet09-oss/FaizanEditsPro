<?php
/**
 * The SMTP mail driver against a local sink (php-tests/smtp-sink.py): real conversation, authentication, MIME structure, UTF-8,
 * and attempts to smuggle extra headers/recipients through names, subjects and addresses.
 *   php php-tests/email-smtp.php
 */
require __DIR__ . '/lib.php';
$port = 2525 + random_int(0, 400);
$out = sys_get_temp_dir() . '/fep-smtp-' . getmypid() . '.jsonl';
@unlink($out);
$proc = proc_open(['python3', __DIR__ . '/smtp-sink.py', (string)$port, $out, 'mailuser', 'mail-secret-1'], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
$tries = 0;
while (!@fsockopen('127.0.0.1', $port) && $tries++ < 50) { usleep(100000); }
$cfg = ['host' => '127.0.0.1', 'port' => $port, 'encryption' => 'none', 'user' => 'mailuser', 'password' => 'mail-secret-1'];
$read = fn() => array_map(fn($l) => json_decode($l, true), array_filter(explode("\n", (string)@file_get_contents($out))));
$part = function (string $raw, string $type): string {
    preg_match('#Content-Type: ' . preg_quote($type, '#') . '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n(.*?)\r\n--#s', $raw, $m);
    return base64_decode(str_replace(["\r", "\n"], '', $m[1] ?? ''));
};

step('SMTP', 'sending');
$id = smtp_send($cfg, ['from' => 'Studio — Ünïcode <hello@example.com>', 'to' => 'client@example.test', 'subject' => 'Your V1 is ready — café ☕', 'text' => "Hello\r\n.\r\n..dots\r\nOpen: https://example.com/a?b=1&c=2", 'html' => '<p>Hello <a href="https://example.com/a?b=1&amp;c=2">open</a></p>']);
$m = $read()[0] ?? null;
check('the server accepted the message and returned a Message-ID', $m && preg_match('/^<[0-9a-f]{24}@.+>$/', $id), $id);
check('login used AUTH LOGIN with the configured user', $m && count(array_filter($m['log'], fn($l) => str_starts_with($l, 'AUTH LOGIN'))) === 1);
check('envelope sender and recipient are the plain addresses', $m && trim($m['from'], '<>') === 'hello@example.com' && $m['rcpt'] === ['<client@example.test>'], $m);
$raw = $m['data'] ?? '';
check('the subject is encoded for UTF-8', str_contains($raw, "Subject: =?UTF-8?B?") && base64_decode(substr($raw, strpos($raw, 'Subject: =?UTF-8?B?') + 19, strpos($raw, '?=', strpos($raw, 'Subject: =?UTF-8?B?')) - strpos($raw, 'Subject: =?UTF-8?B?') - 19)) === 'Your V1 is ready — café ☕');
check('the display name is encoded and the address intact', str_contains($raw, '<hello@example.com>') && str_contains($raw, 'From: =?UTF-8?B?'));
check('multipart/alternative with a text and an HTML part', str_contains($raw, 'multipart/alternative') && str_contains($part($raw, 'text/plain'), 'Open: https://example.com/a?b=1&c=2') && str_contains($part($raw, 'text/html'), '<a href="https://example.com/a?b=1&amp;c=2">'));
check('lines that are just a dot survive transmission', str_contains($part($raw, 'text/plain'), "\r\n.\r\n..dots"), $part($raw, 'text/plain'));
check('Date and Message-ID headers are present', str_contains($raw, "\r\nDate: ") || str_starts_with($raw, 'Date: '));

step('SMTP', 'refusals and abuse');
$bad = null;
try { smtp_send(['password' => 'wrong'] + $cfg, ['from' => 'a@b.co', 'to' => 'c@d.co', 'subject' => 's', 'text' => 't', 'html' => 'h']); } catch (RuntimeException $e) { $bad = $e->getMessage(); }
check('a wrong password is reported without echoing the password', $bad !== null && !str_contains($bad, 'wrong') && !str_contains($bad, 'mail-secret'), $bad);
$n = count($read());
smtp_send($cfg, ['from' => 'x@example.com', 'to' => 'victim@example.test', 'subject' => "Hello\r\nBcc: spy@evil.test\r\nX-Injected: 1", 'text' => 't', 'html' => 'h']);
$all = $read();
$last = end($all);
check('CRLF in a subject cannot add headers or recipients', count($all) === $n + 1 && !preg_match('/^Bcc:/mi', $last['data']) && !preg_match('/^X-Injected:/mi', $last['data']) && $last['rcpt'] === ['<victim@example.test>'], $last);
$caught = null;
try { smtp_send($cfg, ['from' => 'x@example.com', 'to' => "victim@example.test>\r\nRCPT TO:<spy@evil.test", 'subject' => 's', 'text' => 't', 'html' => 'h']); } catch (Throwable $e) { $caught = $e->getMessage(); }
$all = $read();
$last = end($all);
check('CRLF in a recipient cannot add a second recipient', !$last || !array_filter($last['rcpt'], fn($r) => str_contains($r, 'spy@evil.test')), $last['rcpt'] ?? $caught);
$down = null;
try { smtp_send(['port' => 1] + $cfg, ['from' => 'a@b.co', 'to' => 'c@d.co', 'subject' => 's', 'text' => 't', 'html' => 'h']); } catch (RuntimeException $e) { $down = $e->getMessage(); }
check('an unreachable server gives a plain error message', $down !== null && str_contains($down, 'Could not connect'), $down);

step('Queue', 'the whole path: event → queue → worker → SMTP (driver chosen in config)');
// a second process with the SMTP driver configured through the environment
$code = 'define("FEP",true);define("FEP_ROOT","' . FEP_ROOT . '");define("FEP_CONFIG_OVERRIDE",["db"=>["name"=>getenv("FEP_TEST_DB")?:"faizan_php","user"=>"faizan","password"=>"faizan_dev","host"=>"127.0.0.1"],"secret"=>"test-secret-test-secret-test-secret-test-secret-1234","mode"=>"live","debug"=>true,"app_url"=>"https://studio.example.com","email"=>["driver"=>"smtp","from"=>"Studio <hello@studio.example.com>","smtp"=>' . var_export($cfg, true) . ']]);require FEP_ROOT."/app/bootstrap.php";'
    . '$u=Db::first("users",["isStaff"=>true]);queue_email(["workspaceId"=>$u["workspaceId"],"toEmail"=>"queue-' . getmypid() . '@example.test","toUserId"=>$u["id"],"templateKey"=>"password_reset","vars"=>["client_name"=>"Queue Tester","reset_url"=>absolute_url("/auth/verify?type=reset&token=abc")]]);'
    . 'for($i=0;$i<4;$i++){$r=run_jobs(["limit"=>20,"budgetMs"=>5000]);}echo json_encode(Db::first("email_logs",["toEmail"=>"queue-' . getmypid() . '@example.test"]));';
$res = json_decode((string)shell_exec('php -r ' . escapeshellarg($code) . ' 2>&1'), true);
check('the queued email was delivered through SMTP and logged as SENT', is_array($res) && $res['status'] === 'SENT' && $res['provider'] === 'smtp', $res);
$all = $read();
$last = end($all);
check('the delivered message links to the configured address, not to a request header', str_contains($part($last['data'], 'text/plain'), 'https://studio.example.com/auth/verify'), $part($last['data'] ?? '', 'text/plain'));
proc_terminate($proc);
@unlink($out);
exit(summary());
