<?php
/** In-app notifications and their email counterpart, honouring each user's preferences. */
defined('FEP') or exit;

const FEP_NOTIFICATION_CATEGORIES = ['PROJECT', 'MESSAGE', 'PAYMENT', 'REVIEW', 'SYSTEM'];

/** The portal a staff/client user lives in (used to point every notification link at somewhere they can actually open). */
function home_for_user_id(string $userId, bool $isStaff): string
{
    if (!$isStaff) {
        return '/dashboard';
    }
    $roles = Db::col('SELECT r.`key` FROM `user_roles` ur JOIN `roles` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = ?', [$userId]);
    $perms = Db::col('SELECT DISTINCT p.`key` FROM `user_roles` ur JOIN `role_permissions` rp ON rp.`roleId` = ur.`roleId` JOIN `permissions` p ON p.`id` = rp.`permissionId` WHERE ur.`userId` = ?', [$userId]);
    return home_for_roles($roles, $perms);
}

/**
 * Creates in-app notifications and/or queues emails per recipient, honouring each user's notification preferences for the category.
 * $in: workspaceId, userIds, category, type, title, message?, link? (app-relative), inApp?, email?, emailTemplate?, emailVars?, exclude?
 */
function notify(array $in): int
{
    $ids = array_values(array_diff(array_unique(array_filter($in['userIds'])), $in['exclude'] ?? []));
    if (!$ids) {
        return 0;
    }
    [$ph, $p] = Db::in($ids);
    $users = Db::hydrateAll('users', Db::rows("SELECT * FROM `users` WHERE `id` IN {$ph} AND `status` <> 'SUSPENDED'", $p));
    $prefs = [];
    foreach (Db::rows("SELECT * FROM `notification_preferences` WHERE `userId` IN {$ph} AND `category` = ?", [...$p, $in['category']]) as $r) {
        $prefs[$r['userId']] = $r;
    }
    $wantInApp = $in['inApp'] ?? true;
    $wantEmail = $in['email'] ?? false;
    $count = 0;
    foreach ($users as $u) {
        $pref = $prefs[$u['id']] ?? null;
        // the link is written for one audience; point it at the portal this recipient actually uses
        $home = home_for_user_id($u['id'], (bool)$u['isStaff']);
        $link = localize_link($in['link'] ?? null, $home);
        if ($wantInApp && ($pref ? (bool)$pref['inApp'] : true)) {
            Db::insert('notifications', [
                'workspaceId' => $in['workspaceId'], 'userId' => $u['id'], 'category' => $in['category'], 'type' => $in['type'],
                'title' => $in['title'], 'message' => $in['message'] ?? null, 'link' => $link, 'isDemo' => (bool)$u['isDemo'],
            ], false);
            $count++;
        }
        if ($wantEmail && ($pref ? (bool)$pref['email'] : true)) {
            queue_email([
                'workspaceId' => $in['workspaceId'], 'toEmail' => $u['email'], 'toUserId' => $u['id'],
                'templateKey' => $in['emailTemplate'] ?? 'notification',
                'vars' => array_merge([
                    'user_name' => $u['name'], 'client_name' => $u['name'], 'title' => $in['title'],
                    'message' => $in['message'] ?? '', 'action_url' => $link ? absolute_url($link) : '',
                ], $in['emailVars'] ?? []),
                'subject' => $in['title'],
                'body' => ($in['message'] ?? $in['title']) . "\n\n[[Open in portal|" . ($link ? absolute_url($link) : absolute_url($home)) . ']]',
            ]);
            $count++;
        }
    }
    return $count;
}

function list_notifications(Actor $a, array $opts = []): array
{
    ['page' => $page, 'pageSize' => $pageSize, 'skip' => $skip, 'take' => $take] = page_args($opts, 20, 50);
    $where = ['sql' => '`userId` = ?' . (!empty($opts['category']) ? ' AND `category` = ?' : '') . (!empty($opts['unreadOnly']) ? ' AND `readAt` IS NULL' : ''), 'params' => array_values(array_filter([$a->userId, $opts['category'] ?? null], fn($x) => $x !== null))];
    $items = Db::find('notifications', $where, ['order' => '`createdAt` DESC', 'limit' => $take, 'offset' => $skip]);
    return paged($items, Db::count('notifications', $where), $page, $pageSize) + ['unread' => unread_count($a)];
}

function unread_count(Actor $a): int
{
    return Db::count('notifications', ['userId' => $a->userId, 'readAt' => null]);
}

function mark_read(Actor $a, string $id): array
{
    return ['updated' => Db::update('notifications', ['sql' => '`id` = ? AND `userId` = ? AND `readAt` IS NULL', 'params' => [$id, $a->userId]], ['readAt' => db_dt()])];
}

function mark_all_read(Actor $a, ?string $category = null): array
{
    return ['updated' => Db::update('notifications', ['sql' => '`userId` = ? AND `readAt` IS NULL' . ($category ? ' AND `category` = ?' : ''), 'params' => array_values(array_filter([$a->userId, $category], fn($x) => $x !== null))], ['readAt' => db_dt()])];
}

function get_preferences(Actor $a): array
{
    $by = [];
    foreach (Db::find('notification_preferences', ['userId' => $a->userId]) as $r) {
        $by[$r['category']] = $r;
    }
    return array_map(fn($c) => ['category' => $c, 'inApp' => $by[$c]['inApp'] ?? true, 'email' => $by[$c]['email'] ?? true], FEP_NOTIFICATION_CATEGORIES);
}

function set_preferences(Actor $a, array $prefs): array
{
    foreach ($prefs as $p) {
        if (!in_array($p['category'], FEP_NOTIFICATION_CATEGORIES, true)) {
            throw new AppError('BAD_REQUEST', "Unknown category {$p['category']}");
        }
        Db::upsert('notification_preferences', ['userId' => $a->userId, 'category' => $p['category'], 'inApp' => (bool)$p['inApp'], 'email' => (bool)$p['email']], ['inApp' => (bool)$p['inApp'], 'email' => (bool)$p['email']]);
    }
    return get_preferences($a);
}
