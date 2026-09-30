<?php
/** Admin console: leads & CRM, clients, contact submissions. */
defined('FEP') or exit;

// ── leads ──
staff_get('admin', '/admin/leads', 'leads:read', 'Leads & CRM', 'admin/leads', function (Actor $a, Ctx $c) {
    $section = in_array($c->query['section'] ?? '', ['prospects', 'lost', 'converted', 'all'], true) ? $c->query['section'] : 'leads';
    $f = [];
    foreach (['q', 'temperature', 'source', 'assignedTo', 'status', 'sort'] as $k) {
        $f[$k] = q_str($c, $k);
    }
    return [
        'section' => $section, 'f' => $f, 'counts' => lead_counts($a),
        'res' => list_leads($a, array_filter($f) + ['section' => $section, 'page' => page_num($c->query['page'] ?? 1)]),
        'sources' => Db::rows('SELECT `key`, `label` FROM `lead_sources` ORDER BY `label` ASC'),
        'staff' => $a->can('projects:assign') ? list_assignable($a) : [],
    ];
});

staff_get('admin', '/admin/leads/{id}', 'leads:read', 'Lead', 'admin/lead', function (Actor $a, Ctx $c) {
    $id = $c->params['id'];
    $lead = get_lead($a, $id);
    return [
        '_title' => $lead['name'], 'lead' => $lead,
        'notes' => $a->can('notes:read') ? list_notes($a, 'LEAD', $id) : [],
        'staff' => $a->can('projects:assign') ? list_assignable($a) : [],
    ];
});

// ── clients ──
staff_get('admin', '/admin/clients', 'clients:read', 'Clients', 'admin/clients', function (Actor $a, Ctx $c) {
    $section = in_array($c->query['section'] ?? '', ['prospects', 'retainers', 'inactive', 'all'], true) ? $c->query['section'] : 'active';
    $q = q_str($c, 'q');
    $sort = q_str($c, 'sort');
    return ['section' => $section, 'q' => $q, 'sort' => $sort, 'res' => list_clients($a, array_filter(['section' => $section === 'all' ? null : $section, 'q' => $q, 'sort' => $sort]) + ['page' => page_num($c->query['page'] ?? 1)])];
});

staff_get('admin', '/admin/clients/new', 'clients:write', 'New client', 'admin/client-new', fn() => []);

staff_get('admin', '/admin/clients/{id}', 'clients:read', 'Client', 'admin/client', function (Actor $a, Ctx $c) {
    $id = $c->params['id'];
    $cl = get_client_or_throw($a, $id);
    $tab = in_array($c->query['tab'] ?? '', ['projects', 'billing', 'files', 'messages', 'notes'], true) ? $c->query['tab'] : 'overview';
    $canProjects = $a->canAny(['projects:read_all', 'projects:read_assigned']);
    $v = [
        '_title' => $cl['companyName'], 'c' => $cl, 'tab' => $tab, 'life' => client_lifetime($id),
        'staff' => $a->can('projects:assign') ? list_assignable($a) : [],
        'projects' => $canProjects ? list_projects_staff($a, ['clientId' => $id, 'pageSize' => 50]) : ['items' => [], 'total' => 0],
    ];
    switch ($tab) {
        case 'overview':
            $v['checklist'] = onboarding_checklist($a, $id);
            break;
        case 'billing':
            $v['invoices'] = $a->can('invoices:read') ? list_invoices($a, ['clientId' => $id, 'pageSize' => 50])['items'] : [];
            $v['quotes'] = $a->can('quotes:read') ? list_quotes($a, ['clientId' => $id, 'pageSize' => 50])['items'] : [];
            try {
                $v['retainers'] = list_retainers($a, ['clientId' => $id]);
            } catch (Throwable) {
                $v['retainers'] = [];
            }
            break;
        case 'files':
            $v += ['kit' => get_brand_kit($a, $id), 'assets' => list_brand_assets($a, $id)];
            break;
        case 'messages':
            $v['messages'] = list_messages($a, ['clientId' => $id, 'markRead' => true]);
            break;
        case 'notes':
            $v['notes'] = $a->can('notes:read') ? list_notes($a, 'CLIENT', $id) : [];
            break;
    }
    return $v;
});

// ── website contact submissions ──
staff_get('admin', '/admin/submissions', ['cms:manage', 'leads:read'], 'Submissions', 'admin/submissions', function (Actor $a, Ctx $c) {
    $tab = in_array($c->query['tab'] ?? '', ['yes', 'all'], true) ? $c->query['tab'] : 'no';
    return ['tab' => $tab, 'res' => list_contact_submissions($a, ['handled' => $tab === 'all' ? null : $tab, 'page' => page_num($c->query['page'] ?? 1)])];
});
