/**
 * Shared UI utilities for session displays
 * Extracted to avoid duplication across admin and consultant views
 */

import React from 'react';
import { MapPin, Monitor, Combine, Calendar } from 'lucide-react';
import { SessionStatus } from '../types/consultor-sessions.types';

export function getStatusBadge(status: SessionStatus): { label: string; className: string } {
  const badges: Record<SessionStatus, { label: string; className: string }> = {
    borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-800' },
    pendiente_aprobacion: { label: 'Pendiente Aprobación', className: 'bg-yellow-100 text-yellow-800' },
    programada: { label: 'Programada', className: 'bg-blue-100 text-blue-800' },
    en_progreso: { label: 'En Progreso', className: 'bg-amber-100 text-amber-800' },
    pendiente_informe: { label: 'Pendiente Informe', className: 'bg-orange-100 text-orange-800' },
    completada: { label: 'Completada', className: 'bg-green-100 text-green-800' },
    cancelada: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
  };

  return badges[status] || badges.borrador;
}

export function getStatusColor(status: SessionStatus): string {
  const colors: Record<SessionStatus, string> = {
    borrador: '#6B7280',
    pendiente_aprobacion: '#F59E0B',
    programada: '#3B82F6',
    en_progreso: '#F59E0B',
    pendiente_informe: '#F97316',
    completada: '#10B981',
    cancelada: '#EF4444',
  };

  return colors[status] || colors.borrador;
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
