import React from 'react';
import { Settings2 } from 'lucide-react';
import {
  ExistingRole,
  TRACTOR_STATUS_LABELS,
  TractorSignupRole,
  TractorSignupStatus,
  formatExistingRoles,
} from '../../lib/tractorSignups';

export interface TractorSignup {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  school_id: number;
  school_name: string;
  birth_date: string;
  profession: string;
  role: TractorSignupRole;
  role_label: string;
  status: TractorSignupStatus;
  status_label: string;
  created_at: string;
  updated_at: string | null;
  granted_at: string | null;
  is_existing_user: boolean;
  existing_user_id: string | null;
  existing_name: string | null;
  existing_email: string | null;
  existing_status: string | null;
  existing_roles: ExistingRole[];
  linked_user_id: string | null;
}

export function RoleBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TractorSignupStatus }) {
  const classes: Record<TractorSignupStatus, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-800',
    granted: 'border-green-200 bg-green-50 text-green-700',
    dismissed: 'border-gray-200 bg-gray-50 text-gray-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${classes[status]}`}
    >
      {TRACTOR_STATUS_LABELS[status]}
    </span>
  );
}

export function ExistingUserBadge({ row }: { row: TractorSignup }) {
  if (!row.is_existing_user) {
    return (
      <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700">
        No
      </span>
    );
  }
  const roles = formatExistingRoles(row.existing_roles);
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
        Sí
      </span>
      <div className="max-w-[200px] text-xs text-gray-500">{roles || 'Sin roles activos'}</div>
    </div>
  );
}

/**
 * Compact card used on small screens in place of the wide desktop table.
 * Shows the essentials and defers everything else (and all actions) to the
 * manage dialog opened via `onManage`.
 */
export function TractorSignupCard({
  row,
  onManage,
  busy,
}: {
  row: TractorSignup;
  onManage: (row: TractorSignup) => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-gray-900">{row.full_name || '—'}</div>
          <div className="truncate text-xs text-gray-500">{row.email}</div>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-xs uppercase tracking-wide text-gray-500">Colegio</dt>
          <dd className="text-right text-gray-800">{row.school_name}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-xs uppercase tracking-wide text-gray-500">Rol</dt>
          <dd>
            <RoleBadge>{row.role_label}</RoleBadge>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-xs uppercase tracking-wide text-gray-500">¿Ya es usuario?</dt>
          <dd className="text-right">
            <ExistingUserBadge row={row} />
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => onManage(row)}
        disabled={busy}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
        Gestionar
      </button>
    </div>
  );
}
