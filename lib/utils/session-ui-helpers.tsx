/**
 * Shared UI utilities for session displays
 * Single source of truth for session status styling (brand-aligned)
 *
 * Brand palette:
 *   primary: #0a0a0a (black)
 *   accent: #fbbf24 (yellow)
 *   accent_hover: #f59e0b
 *   grays: #1f1f1f, #6b7280
 *   error/cancel: red (semantic exception)
 */

import React from 'react';
import { MapPin, Monitor, Combine, Calendar } from 'lucide-react';
import { SessionStatus } from '../types/consultor-sessions.types';

/**
 * Badge class names for status pills (Tailwind).
 * Uses brand-neutral palette: gray, yellow/amber, dark, red.
 * No blue, green, or orange.
 */
export function getStatusBadge(status: SessionStatus): { label: string; className: string } {
  const badges: Record<SessionStatus, { label: string; className: string }> = {
    borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-700' },
    pendiente_aprobacion: { label: 'Pendiente Aprobación', className: 'bg-yellow-100 text-yellow-700' },
    programada: { label: 'Programada', className: 'bg-gray-200 text-gray-900' },
    en_progreso: { label: 'En Progreso', className: 'bg-amber-100 text-amber-700' },
    pendiente_informe: { label: 'Pendiente Informe', className: 'bg-yellow-50 text-amber-700' },
    completada: { label: 'Completada', className: 'bg-gray-800 text-white' },
    cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-700' },
  };

  return badges[status] || badges.borrador;
}

/**
 * Hex colors for calendar border indicators and chart elements.
 * Aligned to the same brand-neutral palette.
 */
export function getStatusColor(status: SessionStatus): string {
  const colors: Record<SessionStatus, string> = {
    borrador: '#6B7280',          // gray-500
    pendiente_aprobacion: '#F59E0B', // amber-500 (brand accent hover)
    programada: '#1f1f1f',        // brand_gray_dark
    en_progreso: '#F59E0B',       // amber-500
    pendiente_informe: '#D97706', // amber-600
    completada: '#0a0a0a',        // brand_primary
    cancelada: '#EF4444',         // red-500
  };

  return colors[status] || colors.borrador;
}

/**
 * Tailwind class names for series stats pills in the detail page.
 * Same brand-neutral palette as badges.
 */
export function getSeriesStatsPillClass(status: SessionStatus): string {
  const classes: Record<SessionStatus, string> = {
    borrador: 'bg-gray-100 text-gray-700',
    pendiente_aprobacion: 'bg-yellow-100 text-yellow-700',
    programada: 'bg-gray-200 text-gray-900',
    en_progreso: 'bg-amber-100 text-amber-700',
    pendiente_informe: 'bg-yellow-50 text-amber-700',
    completada: 'bg-gray-800 text-white',
    cancelada: 'bg-red-100 text-red-700',
  };

  return classes[status] || classes.borrador;
}

/**
 * getCancellationSubBadge — Returns a secondary badge for cancelled sessions
 * showing the ledger outcome (Penalizada / Devuelta) and admin override indicator.
 *
 * @param ledgerStatus  - 'penalizada' | 'devuelta' | null (null = no ledger entry yet)
 * @param adminOverride - true when an admin manually set the status
 * @returns React.ReactNode badge or null
 */
export function getCancellationSubBadge(
  ledgerStatus: 'penalizada' | 'devuelta' | null,
  adminOverride: boolean = false
): React.ReactNode {
  if (!ledgerStatus) return null;

  const isPenalizada = ledgerStatus === 'penalizada';
  const badgeClass = isPenalizada
    ? 'bg-red-100 text-red-700'
    : 'bg-green-50 text-green-700 border border-green-200';
  const label = isPenalizada ? 'Penalizada' : 'Devuelta';

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
        {label}
      </span>
      {adminOverride && (
        <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
          Admin
        </span>
      )}
    </span>
  );
}

export function formatTime(timeString: string): string {
  return timeString.substring(0, 5);
}

export function getModalityIcon(modality: string, sizeClass: string = 'w-4 h-4') {
  switch (modality) {
    case 'presencial':
      return <MapPin className={sizeClass} />;
    case 'online':
      return <Monitor className={sizeClass} />;
    case 'hibrida':
      return <Combine className={sizeClass} />;
    default:
      return <Calendar className={sizeClass} />;
  }
}
