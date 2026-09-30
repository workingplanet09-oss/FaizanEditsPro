<?php
/**
 * Project status machine — the single source of truth for labels, tone, client-facing copy and LEGAL TRANSITIONS.
 * The server enforces TRANSITIONS; the UI uses the same map to only offer valid next steps.
 * The tables live in data/statuses.json (exported from the previous version so the wording is identical).
 */
defined('FEP') or exit;

function status_data(string $name): array
{
    static $d = null;
    $d ??= json_decode((string)file_get_contents(FEP_ROOT . '/app/data/statuses.json'), true, 512, JSON_THROW_ON_ERROR);
    return $d[$name] ?? [];
}

function project_statuses(): array { return status_data('PROJECT_STATUSES'); }
function status_meta(string $status): array { return status_data('STATUS_META')[$status] ?? status_data('STATUS_META')['INQUIRY']; }
function transitions_from(string $status): array { return status_data('TRANSITIONS')[$status] ?? []; }
function can_transition(string $from, string $to): bool { return in_array($to, transitions_from($from), true); }
function production_started(): array { return status_data('PRODUCTION_STARTED'); }
function open_statuses(): array { return status_data('OPEN_STATUSES'); }
function active_production_statuses(): array { return status_data('ACTIVE_PRODUCTION'); }
function pipeline_stages(): array { return status_data('PIPELINE'); }
function client_steps(): array { return status_data('CLIENT_STEPS'); }

function client_step_index(string $status): int
{
    foreach (client_steps() as $i => $s) {
        if (in_array($status, $s['statuses'], true)) {
            return $i;
        }
    }
    return 0;
}

/** Label + tone lookups for the other enums (priority, task, revision, quote, invoice, contract, lead, temperature, client, retainer). */
function meta_for(string $kind, ?string $value): array
{
    $map = status_data(strtoupper($kind) . '_META');
    return $map[$value ?? ''] ?? ['label' => title_case(str_replace('_', ' ', strtolower((string)$value))), 'tone' => 'neutral'];
}
