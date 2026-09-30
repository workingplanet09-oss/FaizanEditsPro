<?php
/** RBAC catalogue (default permission keys and role map). The database holds the live mapping; this is the reference for the keys the code checks. */
defined('FEP') or exit;

const FEP_PERMISSIONS = [
    'admin:access' => 'Open the admin console',
    'editor:access' => 'Open the editor workspace',
    'leads:read' => 'View leads & CRM',
    'leads:write' => 'Edit leads, log activity, assign',
    'leads:convert' => 'Convert leads to clients',
    'clients:read' => 'View clients',
    'clients:write' => 'Create & edit clients',
    'projects:read_all' => 'View every project',
    'projects:read_assigned' => 'View assigned projects only',
    'projects:write' => 'Create & edit projects',
    'projects:transition' => 'Change project status',
    'projects:assign' => 'Assign editors & managers',
    'tasks:read' => 'View tasks',
    'tasks:write' => 'Create & edit tasks',
    'files:read' => 'View project files',
    'files:write' => 'Upload & manage files',
    'files:delete' => 'Delete files',
    'versions:upload' => 'Upload video versions',
    'versions:review' => 'Review versions internally',
    'revisions:manage' => 'Respond to & resolve revision feedback',
    'quotes:read' => 'View quotes',
    'quotes:write' => 'Create & send quotes',
    'contracts:read' => 'View contracts',
    'contracts:write' => 'Create & send contracts',
    'invoices:read' => 'View invoices',
    'invoices:write' => 'Create & send invoices',
    'payments:read' => 'View payments',
    'payments:write' => 'Record payments',
    'retainers:manage' => 'Manage retainers',
    'messages:read' => 'Read client messages',
    'messages:write' => 'Reply to clients',
    'notes:read' => 'Read internal notes',
    'notes:write' => 'Write internal notes',
    'cms:manage' => 'Edit website content (services, pricing, portfolio, blog, FAQs…)',
    'forms:manage' => 'Edit onboarding form builder',
    'automations:manage' => 'Edit automations & email templates',
    'team:manage' => 'Manage team members & roles',
    'settings:manage' => 'Change site & business settings',
    'analytics:read' => 'View analytics & reports',
    'profitability:read' => 'View internal profitability',
    'reports:export' => 'Export data & reports',
    'audit:read' => 'View the audit log',
    'time:track' => 'Track time on projects',
    'time:read_all' => 'See everyone\'s tracked time',
    'deliverables:override' => 'Override payment/approval gates',
];

const FEP_EDITOR_BASE = ['editor:access', 'projects:read_assigned', 'tasks:read', 'tasks:write', 'files:read', 'files:write', 'versions:upload', 'revisions:manage', 'messages:read', 'messages:write', 'notes:read', 'notes:write', 'time:track'];

/** Default role definitions. permissions '*' = everything; 'except' lists exclusions. */
function role_defs(): array
{
    $all = array_keys(FEP_PERMISSIONS);
    return [
        ['key' => 'super_admin', 'name' => 'Super Admin', 'description' => 'Manages everything, including team and roles.', 'rank' => 100, 'isStaff' => true, 'permissions' => $all],
        ['key' => 'admin', 'name' => 'Admin', 'description' => 'Runs the studio day to day.', 'rank' => 90, 'isStaff' => true, 'permissions' => array_values(array_diff($all, ['team:manage']))],
        ['key' => 'project_manager', 'name' => 'Project Manager', 'description' => 'Owns projects, clients and delivery.', 'rank' => 70, 'isStaff' => true, 'permissions' => ['admin:access', 'editor:access', 'leads:read', 'leads:write', 'leads:convert', 'clients:read', 'clients:write', 'projects:read_all', 'projects:write', 'projects:transition', 'projects:assign', 'tasks:read', 'tasks:write', 'files:read', 'files:write', 'files:delete', 'versions:upload', 'versions:review', 'revisions:manage', 'quotes:read', 'quotes:write', 'contracts:read', 'contracts:write', 'invoices:read', 'messages:read', 'messages:write', 'notes:read', 'notes:write', 'analytics:read', 'time:track', 'time:read_all']],
        ['key' => 'senior_editor', 'name' => 'Senior Editor', 'description' => "Leads edits and reviews others' work.", 'rank' => 60, 'isStaff' => true, 'permissions' => [...FEP_EDITOR_BASE, 'versions:review', 'files:delete']],
        ['key' => 'editor', 'name' => 'Editor', 'description' => 'Edits assigned projects.', 'rank' => 50, 'isStaff' => true, 'permissions' => FEP_EDITOR_BASE],
        ['key' => 'motion_designer', 'name' => 'Motion Designer', 'description' => 'Motion graphics & animation.', 'rank' => 50, 'isStaff' => true, 'permissions' => FEP_EDITOR_BASE],
        ['key' => 'reviewer', 'name' => 'Reviewer', 'description' => 'Quality-checks drafts before they reach the client.', 'rank' => 40, 'isStaff' => true, 'permissions' => ['editor:access', 'projects:read_assigned', 'tasks:read', 'files:read', 'versions:review', 'revisions:manage', 'messages:read', 'notes:read', 'notes:write']],
        ['key' => 'finance', 'name' => 'Finance', 'description' => 'Invoices, payments and revenue reporting.', 'rank' => 55, 'isStaff' => true, 'permissions' => ['admin:access', 'clients:read', 'quotes:read', 'contracts:read', 'invoices:read', 'invoices:write', 'payments:read', 'payments:write', 'retainers:manage', 'analytics:read', 'profitability:read', 'reports:export', 'notes:read', 'notes:write']],
        ['key' => 'support', 'name' => 'Support', 'description' => 'Answers client questions.', 'rank' => 45, 'isStaff' => true, 'permissions' => ['admin:access', 'leads:read', 'clients:read', 'projects:read_all', 'tasks:read', 'messages:read', 'messages:write', 'notes:read', 'notes:write', 'files:read']],
        ['key' => 'client', 'name' => 'Client', 'description' => 'Portal user. No access to internal areas.', 'rank' => 0, 'isStaff' => false, 'permissions' => []],
    ];
}

/** Where should a freshly signed-in user land? */
function home_for_roles(array $roleKeys, array $perms): string
{
    $has = fn(string $p) => in_array($p, $perms, true) || isset($perms[$p]);
    if ($has('admin:access')) {
        return '/admin';
    }
    if ($has('editor:access')) {
        return '/editor';
    }
    return '/dashboard';
}

/**
 * Notification and email links are written once, usually for one audience (/admin/projects/…). This re-targets such a link at the
 * area the recipient actually lives in (/dashboard/projects/… for a client, /editor/projects/… for an editor), and sends them to
 * their home page when the section doesn't exist there (finance, CRM, settings…) instead of to a dead end.
 */
function localize_link(?string $link, string $home): ?string
{
    if (!$link) {
        return null;
    }
    if (!preg_match('#^(/(?:admin|editor|dashboard))(?:/([^/?\#]*))?(.*)$#', $link, $m) || $m[1] === $home) {
        return $link;
    }
    $sections = ['/admin' => '*', '/editor' => ['projects', 'tasks', 'revisions', 'files', 'account'], '/dashboard' => ['projects', 'quotes', 'contracts', 'invoices', 'retainers', 'files', 'messages', 'settings']];
    $allowed = $sections[$home] ?? [];
    $section = $m[2] ?? '';
    if ($allowed === '*' || ($section !== '' && is_array($allowed) && in_array($section, $allowed, true))) {
        return $home . '/' . $section . $m[3];
    }
    return $home;
}

/** Organization-level (client company) permissions — separate from staff RBAC. */
const FEP_ORG_ROLE_ACTIONS = [
    'OWNER' => ['view', 'upload', 'message', 'manage_projects', 'approve', 'billing', 'manage_members'],
    'MANAGER' => ['view', 'upload', 'message', 'manage_projects', 'approve'],
    'BILLING' => ['view', 'billing', 'message'],
    'ASSISTANT' => ['view', 'upload', 'message'],
    'MEMBER' => ['view', 'message'],
];

function org_role_can(string $role, string $action): bool
{
    return in_array($action, FEP_ORG_ROLE_ACTIONS[$role] ?? [], true);
}
