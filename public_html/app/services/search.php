<?php
/** Permission-scoped global search: each entity type is only searched if the actor may read it. */
defined('FEP') or exit;

const FEP_SEARCH_KINDS = ['client', 'lead', 'project', 'invoice', 'quote', 'contract', 'file', 'message'];

function global_search(Actor $actor, string $q, ?array $kinds = null, int $perKind = 6): array
{
    $term = trim($q);
    if (mb_strlen($term) < 2 || !$actor->isStaff) {
        return [];
    }
    $want = fn(string $k) => !$kinds || in_array($k, $kinds, true);
    $like = like_pattern($term);
    $limit = max(1, min(20, $perKind));
    $hits = [];
    $lower = fn($s) => strtolower(str_replace('_', ' ', (string)$s));
    $home = $actor->can('admin:access') ? '/admin' : '/editor';

    if ($want('client') && $actor->can('clients:read')) {
        [$s, $p] = scope_client($actor, 'c');
        foreach (Db::rows("SELECT c.`id`, c.`companyName`, c.`name`, c.`email` FROM `clients` c WHERE {$s} AND (c.`name` LIKE ? OR c.`companyName` LIKE ? OR c.`email` LIKE ?) ORDER BY c.`updatedAt` DESC LIMIT {$limit}", [...$p, $like, $like, $like]) as $c) {
            $hits[] = ['kind' => 'client', 'id' => $c['id'], 'title' => $c['companyName'], 'subtitle' => "{$c['name']} · {$c['email']}", 'href' => "/admin/clients/{$c['id']}"];
        }
    }
    if ($want('lead') && $actor->can('leads:read')) {
        [$s, $p] = scope_lead($actor, 'l');
        foreach (Db::rows("SELECT l.`id`, l.`company`, l.`name`, l.`requestCode`, l.`status` FROM `leads` l WHERE {$s} AND (l.`name` LIKE ? OR l.`company` LIKE ? OR l.`email` LIKE ? OR l.`requestCode` LIKE ?) ORDER BY l.`createdAt` DESC LIMIT {$limit}", [...$p, $like, $like, $like, $like]) as $l) {
            $hits[] = ['kind' => 'lead', 'id' => $l['id'], 'title' => $l['company'] ?: $l['name'], 'subtitle' => "{$l['requestCode']} · " . $lower($l['status']), 'href' => "/admin/leads/{$l['id']}"];
        }
    }
    if ($want('project')) {
        [$s, $p] = scope_project($actor, 'p');
        foreach (Db::rows("SELECT p.`id`, p.`name`, p.`code`, c.`companyName` FROM `projects` p JOIN `clients` c ON c.`id` = p.`clientId` WHERE {$s} AND (p.`name` LIKE ? OR p.`code` LIKE ? OR c.`companyName` LIKE ?) ORDER BY p.`updatedAt` DESC LIMIT {$limit}", [...$p, $like, $like, $like]) as $r) {
            $hits[] = ['kind' => 'project', 'id' => $r['id'], 'title' => $r['name'], 'subtitle' => "{$r['code']} · {$r['companyName']}", 'href' => "{$home}/projects/{$r['id']}"];
        }
    }
    if ($want('invoice') && $actor->can('invoices:read')) {
        [$s, $p] = scope_invoice($actor, 'i');
        foreach (Db::rows("SELECT i.`id`, i.`number`, i.`status`, c.`companyName` FROM `invoices` i JOIN `clients` c ON c.`id` = i.`clientId` WHERE {$s} AND (i.`number` LIKE ? OR c.`companyName` LIKE ?) ORDER BY i.`createdAt` DESC LIMIT {$limit}", [...$p, $like, $like]) as $r) {
            $hits[] = ['kind' => 'invoice', 'id' => $r['id'], 'title' => "Invoice {$r['number']}", 'subtitle' => "{$r['companyName']} · " . $lower($r['status']), 'href' => "/admin/invoices/{$r['id']}"];
        }
    }
    if ($want('quote') && $actor->can('quotes:read')) {
        [$s, $p] = scope_quote($actor, 'q');
        foreach (Db::rows("SELECT q.`id`, q.`number`, q.`status`, c.`companyName` FROM `quotes` q JOIN `clients` c ON c.`id` = q.`clientId` WHERE {$s} AND (q.`number` LIKE ? OR q.`title` LIKE ? OR c.`companyName` LIKE ?) ORDER BY q.`createdAt` DESC LIMIT {$limit}", [...$p, $like, $like, $like]) as $r) {
            $hits[] = ['kind' => 'quote', 'id' => $r['id'], 'title' => "Quote {$r['number']}", 'subtitle' => "{$r['companyName']} · " . strtolower($r['status']), 'href' => "/admin/quotes/{$r['id']}"];
        }
    }
    if ($want('contract') && $actor->can('contracts:read')) {
        [$s, $p] = scope_contract($actor, 'ct');
        foreach (Db::rows("SELECT ct.`id`, ct.`number`, ct.`status`, c.`companyName` FROM `contracts` ct JOIN `clients` c ON c.`id` = ct.`clientId` WHERE {$s} AND (ct.`number` LIKE ? OR ct.`title` LIKE ? OR c.`companyName` LIKE ?) ORDER BY ct.`createdAt` DESC LIMIT {$limit}", [...$p, $like, $like, $like]) as $r) {
            $hits[] = ['kind' => 'contract', 'id' => $r['id'], 'title' => "Contract {$r['number']}", 'subtitle' => "{$r['companyName']} · " . strtolower($r['status']), 'href' => "/admin/contracts/{$r['id']}"];
        }
    }
    if ($want('file') && $actor->can('files:read')) {
        [$s, $p] = scope_asset($actor, 'a');
        foreach (Db::rows("SELECT a.`id`, a.`displayName`, a.`projectId`, pr.`name` AS pname FROM `assets` a JOIN `projects` pr ON pr.`id` = a.`projectId` WHERE {$s} AND a.`displayName` LIKE ? ORDER BY a.`createdAt` DESC LIMIT {$limit}", [...$p, $like]) as $r) {
            $hits[] = ['kind' => 'file', 'id' => $r['id'], 'title' => $r['displayName'], 'subtitle' => $r['pname'] ?? '', 'href' => "{$home}/projects/{$r['projectId']}?tab=files"];
        }
    }
    if ($want('message') && $actor->can('messages:read')) {
        [$s, $p] = scope_message($actor, 'm');
        foreach (Db::rows("SELECT m.`id`, m.`body`, m.`projectId`, u.`name` AS sname, pr.`name` AS pname FROM `messages` m JOIN `users` u ON u.`id` = m.`senderId` LEFT JOIN `projects` pr ON pr.`id` = m.`projectId` WHERE {$s} AND m.`body` LIKE ? ORDER BY m.`createdAt` DESC LIMIT {$limit}", [...$p, $like]) as $r) {
            $hits[] = ['kind' => 'message', 'id' => $r['id'], 'title' => mb_substr($r['body'], 0, 80), 'subtitle' => $r['sname'] . ($r['pname'] ? " · {$r['pname']}" : ''), 'href' => $r['projectId'] ? "/admin/projects/{$r['projectId']}?tab=messages" : '/admin/messages'];
        }
    }
    return $hits;
}
