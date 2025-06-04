/**
 * Messaging Utils - Minimal Implementation
 * Provides basic functions needed by messaging components
 * Using simple implementations to avoid complex Supabase queries
 */

import { THREAD_CATEGORIES, ThreadCategory } from '../types/messaging';

// Utility functions that components need
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'hace unos segundos';
  if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)} minutos`;
  if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)} horas`;
  if (diffInSeconds < 604800) return `hace ${Math.floor(diffInSeconds / 86400)} días`;
  
  return date.toLocaleDateString('es-CL');
}

export function getThreadCategoryConfig(category: ThreadCategory) {
  return THREAD_CATEGORIES.find(cat => cat.type === category) || THREAD_CATEGORIES[0];
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getReactionEmoji(reactionType: string): string {
  const reactions: Record<string, string> = {
    thumbs_up: '👍',
    heart: '❤️',
    lightbulb: '💡',
    celebration: '🎉',
    eyes: '👀',
    question: '❓'
  };
  return reactions[reactionType] || '👍';
}

export function getReactionLabel(reactionType: string): string {
  const labels: Record<string, string> = {
    thumbs_up: 'Me gusta',
    heart: 'Me encanta',
    lightbulb: 'Buena idea',
    celebration: 'Excelente',
    eyes: 'Interesante',
    question: 'Tengo dudas'
  };
  return labels[reactionType] || 'Reacción';
}

// Stub functions for components (will show placeholder messages)
export async function getThreadMessages(): Promise<any> {
  console.log('getThreadMessages: Función no implementada');
  return { messages: [] };
}

export async function createMessage(): Promise<any> {
  console.log('createMessage: Función no implementada');
  throw new Error('Función no implementada');
}

export async function editMessage(): Promise<any> {
  console.log('editMessage: Función no implementada');
  throw new Error('Función no implementada');
}

export async function deleteMessage(): Promise<any> {
  console.log('deleteMessage: Función no implementada');
  throw new Error('Función no implementada');
}

export async function toggleMessageReaction(): Promise<any> {
  console.log('toggleMessageReaction: Función no implementada');
  return { added: false };
}

export async function markMentionsAsRead(): Promise<any> {
  console.log('markMentionsAsRead: Función no implementada');
  return true;
}