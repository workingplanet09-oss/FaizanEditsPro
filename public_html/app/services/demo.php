<?php
/**
 * Sample ("demo") data: load it once on an empty site, remove it completely at any time.
 * Removal deletes every row flagged isDemo plus the records that only exist because someone explored with a sample account
 * (a quote sent to a sample client, a payment made on a sample invoice…). Real data is never touched.
 */
defined('FEP') or exit;

const FEP_DEMO_DOMAIN = '@demo.faizaneditspro.test';

/** Children first, people last; a row that is still referenced is retried in a later pass. */
const FEP_DEMO_TABLES = ['activity_logs', 'notifications', 'messages', 'video_comments', 'revision_requests', 'video_versions', 'payments', 'invoices', 'contracts', 'quotes', 'meetings', 'retainers', 'assets', 'projects', 'testimonials', 'case_studies', 'portfolio_projects', 'blog_posts', 'pricing_plans', 'contact_submissions', 'leads', 'clients', 'organizations', 'users'];

/** @return array<string,int> what was removed, by kind */
function clear_demo_data(): array
{
    $counts = [];
    $add = function (string $label, int $n) use (&$counts) {
        if ($n > 0) {
            $counts[$label] = ($counts[$label] ?? 0) + $n;
        }
    };
    $ids = fn(string $sql, array $p = []) => array_column(Db::rows($sql, $p), 'id');
    $in = function (array $values): array {
        $values = $values ?: ['__none__'];
        return Db::in($values);
    };

    // 1) stored files first (the bundled sample media is never deleted — storage()->remove() ignores it)
    foreach (Db::rows('SELECT a.`storageKey`, a.`thumbnailKey` FROM `assets` a LEFT JOIN `projects` p ON p.`id` = a.`projectId` LEFT JOIN `clients` c ON c.`id` = a.`clientId` WHERE a.`isDemo` = 1 OR p.`isDemo` = 1 OR c.`isDemo` = 1') as $a) {
        storage()->remove($a['storageKey']);
        if ($a['thumbnailKey']) {
            storage()->remove($a['thumbnailKey']);
        }
    }

    // 2) remember what is about to go — including records created for sample clients while exploring
    $demoUsers = Db::rows('SELECT `id`, `email` FROM `users` WHERE `isDemo` = 1');
    $userIds = array_column($demoUsers, 'id');
    $emails = array_column($demoUsers, 'email');
    Db::exec('DELETE FROM `audit_logs` WHERE `actorId` IN ' . $in($userIds)[0], $in($userIds)[1]);
    $clientIds = $ids('SELECT `id` FROM `clients` WHERE `isDemo` = 1');
    $leadIds = $ids('SELECT `id` FROM `leads` WHERE `isDemo` = 1');
    $orgIds = $ids('SELECT `id` FROM `organizations` WHERE `isDemo` = 1');
    [$cPh, $cP] = $in($clientIds);
    $projectIds = $ids("SELECT `id` FROM `projects` WHERE `isDemo` = 1 OR `clientId` IN {$cPh}", $cP);
    [$pPh, $pP] = $in($projectIds);
    $invoiceIds = $ids("SELECT `id` FROM `invoices` WHERE `isDemo` = 1 OR `clientId` IN {$cPh} OR `projectId` IN {$pPh}", [...$cP, ...$pP]);
    $quoteIds = $ids("SELECT `id` FROM `quotes` WHERE `isDemo` = 1 OR `clientId` IN {$cPh} OR `projectId` IN {$pPh}", [...$cP, ...$pP]);
    $contractIds = $ids("SELECT `id` FROM `contracts` WHERE `isDemo` = 1 OR `clientId` IN {$cPh} OR `projectId` IN {$pPh}", [...$cP, ...$pP]);
    [$iPh, $iP] = $in($invoiceIds);
    $paymentIds = $ids("SELECT `id` FROM `payments` WHERE `isDemo` = 1 OR `invoiceId` IN {$iPh}", $iP);
    $authors = array_column(Db::rows('SELECT `name` FROM `testimonials` WHERE `isDemo` = 1'), 'name');
    $emailLogIds = $ids('SELECT `id` FROM `email_logs` WHERE `toEmail` LIKE ?' . ($emails ? ' OR `toEmail` IN ' . $in($emails)[0] : ''), ['%' . FEP_DEMO_DOMAIN, ...($emails ? $in($emails)[1] : [])]);
    $audited = ['client' => $clientIds, 'lead' => $leadIds, 'organization' => $orgIds, 'project' => $projectIds, 'invoice' => $invoiceIds, 'quote' => $quoteIds, 'contract' => $contractIds, 'payment' => $paymentIds, 'user' => $userIds];

    // 3) history written by sample people that carries no flag of its own: found from the schema itself, so new tables are covered
    $pdo = Db::pdo();
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    if ($userIds) {
        [$uPh, $uP] = $in($userIds);
        $add('tasks', Db::exec("DELETE FROM `tasks` WHERE `createdById` IN {$uPh}", $uP));
        $refs = Db::rows("SELECT k.`TABLE_NAME` AS t, k.`COLUMN_NAME` AS c FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
            WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'users' AND r.DELETE_RULE IN ('RESTRICT','NO ACTION')");
        for ($pass = 0; $pass < 3; $pass++) {
            foreach ($refs as $r) {
                try {
                    $add($r['t'], Db::exec('DELETE FROM `' . $r['t'] . '` WHERE `' . $r['c'] . "` IN {$uPh}", $uP));
                } catch (Throwable) {
                }
            }
        }
    }

    // 4) every table that carries the flag, in dependency order; a row that is still referenced waits for a later pass
    $pending = FEP_DEMO_TABLES;
    for ($pass = 0; $pass < 8 && $pending; $pass++) {
        $next = [];
        foreach ($pending as $t) {
            try {
                $add($t, Db::exec("DELETE FROM `{$t}` WHERE `isDemo` = 1"));
            } catch (PDOException $e) {
                if (str_contains($e->getMessage(), '1451') || str_contains($e->getMessage(), 'foreign key')) {
                    $next[] = $t;
                } else {
                    throw $e;
                }
            }
        }
        if (count($next) === count($pending) && $pass > 0) {
            app_log('clear_demo: could not remove ' . implode(', ', $next) . ' because real data still references them');
            break;
        }
        $pending = $next;
    }

    // rows the sample file added to reference/content tables (no flag of their own), listed by the generator
    $manifest = json_decode((string)@file_get_contents(FEP_ROOT . '/app/data/demo-manifest.json'), true) ?: [];
    foreach ($manifest as $table => $rowIds) {
        if (!preg_match('/^[a-z_]+$/', $table) || !$rowIds) {
            continue;
        }
        [$mPh, $mP] = Db::in($rowIds);
        try {
            $add($table, Db::exec("DELETE FROM `{$table}` WHERE `id` IN {$mPh}", $mP));
        } catch (Throwable $e) {
            app_log("clear_demo: {$table}: " . $e->getMessage());
        }
    }

    // 5) history about the removed records, so a cleared site doesn't show payments or sign-ins for things that no longer exist
    $hist = 0;
    foreach ($audited as $type => $list) {
        if ($list) {
            [$ph, $p] = $in($list);
            $hist += Db::exec("DELETE FROM `audit_logs` WHERE `entityType` = ? AND `entityId` IN {$ph}", [$type, ...$p]);
        }
    }
    $allRemoved = array_merge($projectIds, $leadIds, $clientIds, $invoiceIds, $quoteIds, $contractIds, $paymentIds);
    [$rPh, $rP] = $in(array_merge($clientIds, $leadIds, $projectIds));
    [$ePh, $eP] = $in(array_merge($invoiceIds, $quoteIds, $contractIds, $paymentIds));
    $hist += Db::exec("DELETE FROM `activity_logs` WHERE `clientId` IN {$cPh} OR `leadId` IN " . $in($leadIds)[0] . " OR `projectId` IN {$pPh} OR `entityId` IN {$ePh}", [...$cP, ...$in($leadIds)[1], ...$pP, ...$eP]);
    $add('history rows', $hist);

    // notifications in real inboxes and queued jobs whose links carry the removed ids
    $like = function (string $col, array $list): array {
        if (!$list) {
            return ['0 = 1', []];
        }
        return ['(' . implode(' OR ', array_fill(0, count($list), "{$col} LIKE ?")) . ')', array_map(fn($id) => "%{$id}%", $list)];
    };
    [$sql, $p] = $like('`link`', $allRemoved);
    $add('notifications about removed records', Db::exec("DELETE FROM `notifications` WHERE {$sql}", $p));
    if ($authors) {
        $conds = implode(' OR ', array_fill(0, count($authors), '`title` LIKE ?'));
        $add('notifications about removed records', Db::exec("DELETE FROM `notifications` WHERE `type` = 'testimonial.submitted' AND ({$conds})", array_map(fn($n) => "%{$n}%", $authors)));
    }
    [$sql, $p] = $like('CAST(`payload` AS CHAR)', array_merge($allRemoved, $emailLogIds));
    $add('jobs about removed records', Db::exec("DELETE FROM `jobs` WHERE {$sql} OR CAST(`payload` AS CHAR) LIKE ?", [...$p, '%' . FEP_DEMO_DOMAIN . '%']));

    // records that point at the removed ones only by id (no foreign keys); rows whose target is already gone go too
    $leadsLeft = Db::count('leads');
    $projectsLeft = Db::count('projects');
    $invoicesLeft = Db::count('invoices');
    $add('standalone tasks', Db::exec('DELETE FROM `tasks` WHERE `projectId` IS NULL AND `createdById` IS NULL'));
    [$ldPh, $ldP] = $in(array_merge($leadIds, $projectIds));
    $add('onboarding answers', Db::exec("DELETE r FROM `onboarding_responses` r WHERE r.`subjectId` IN {$ldPh}
        OR (r.`subjectType` = 'LEAD' AND NOT EXISTS (SELECT 1 FROM `leads` x WHERE x.`id` = r.`subjectId`))
        OR (r.`subjectType` = 'PROJECT' AND NOT EXISTS (SELECT 1 FROM `projects` x WHERE x.`id` = r.`subjectId`))", $ldP));
    [$uPh2, $uP2] = $in($userIds);
    $add('onboarding drafts', Db::exec("DELETE d FROM `onboarding_drafts` d WHERE d.`userId` IN {$uPh2} OR d.`subjectId` IN {$ldPh}
        OR (d.`subjectType` = 'LEAD' AND NOT EXISTS (SELECT 1 FROM `leads` x WHERE x.`id` = d.`subjectId`))
        OR (d.`subjectType` = 'PROJECT' AND NOT EXISTS (SELECT 1 FROM `projects` x WHERE x.`id` = d.`subjectId`))
        OR (d.`subjectType` IS NULL AND d.`submittedAt` IS NOT NULL AND ? = 1)", [...$uP2, ...$ldP, $leadsLeft === 0 ? 1 : 0]));
    $add('testimonial links', Db::exec("DELETE t FROM `testimonial_requests` t WHERE t.`projectId` IN {$pPh} OR t.`clientId` IN {$cPh}
        OR (t.`projectId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `projects` x WHERE x.`id` = t.`projectId`))", [...$pP, ...$cP]));
    [$emPh, $emP] = $in($emails);
    $add('sign-in links', Db::exec("DELETE a FROM `auth_tokens` a WHERE a.`userId` IN {$uPh2} OR a.`email` LIKE ? OR a.`email` IN {$emPh}
        OR (a.`userId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `users` u WHERE u.`id` = a.`userId`))", [...$uP2, '%' . FEP_DEMO_DOMAIN, ...$emP]));
    [$arPh, $arP] = $in(array_merge($projectIds, $leadIds, $invoiceIds));
    $add('automation runs', Db::exec("DELETE r FROM `automation_runs` r WHERE r.`entityId` IN {$arPh}
        OR (r.`entityId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `projects` x WHERE x.`id` = r.`entityId`) AND NOT EXISTS (SELECT 1 FROM `leads` x WHERE x.`id` = r.`entityId`) AND NOT EXISTS (SELECT 1 FROM `invoices` x WHERE x.`id` = r.`entityId`))
        OR ? = 1", [...$arP, ($leadsLeft + $projectsLeft + $invoicesLeft === 0) ? 1 : 0]));

    // numbering starts again at the beginning once no real document of that kind is left
    foreach (['invoice' => 'invoices', 'quote' => 'quotes', 'contract' => 'contracts', 'project' => 'projects', 'lead-%' => 'leads'] as $key => $table) {
        if (Db::count($table) === 0) {
            Db::exec('DELETE FROM `counters` WHERE `key` LIKE ?', [$key]);
        }
    }

    // emails generated for sample addresses
    $add('emails', Db::exec('DELETE FROM `email_logs` WHERE `toEmail` LIKE ?' . ($emails ? " OR `toEmail` IN {$emPh}" : ''), ['%' . FEP_DEMO_DOMAIN, ...($emails ? $emP : [])]));
    Db::exec('DELETE FROM `audit_logs` WHERE `message` LIKE ?', ['%' . FEP_DEMO_DOMAIN . '%']);
    invalidate_settings();
    return $counts;
}
