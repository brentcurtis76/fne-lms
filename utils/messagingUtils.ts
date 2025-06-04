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
export async function getThreadMessages(threadId: string, filters: any = {}): Promise<any> {
  console.log('getThreadMessages: Función no implementada', threadId, filters);
  return { messages: [] };
}

export async function createMessage(messageData: any, userId: string): Promise<any> {
  console.log('createMessage: Función no implementada', messageData, userId);
  throw new Error('Función no implementada');
}

export async function editMessage(messageId: string, editData: any, userId: string): Promise<any> {
  console.log('editMessage: Función no implementada', messageId, editData, userId);
  throw new Error('Función no implementada');
}

export async function deleteMessage(messageId: string, userId: string): Promise<any> {
  console.log('deleteMessage: Función no implementada', messageId, userId);
  throw new Error('Función no implementada');
}

export async function toggleMessageReaction(messageId: string, reactionType: string, userId: string): Promise<any> {
  console.log('toggleMessageReaction: Función no implementada', messageId, reactionType, userId);
  return { added: false };
}

export async function markMentionsAsRead(userId: string, messageIds: string[]): Promise<any> {
  console.log('markMentionsAsRead: Función no implementada', userId, messageIds);
  return true;
}

// Additional functions needed by MessageComposer
export function validateMessage(messageData: any): any {
  const content = messageData.content || '';
  const attachments = messageData.attachments || [];
  
  return {
    is_valid: content.trim().length > 0 || attachments.length > 0,
    errors: [],
    warnings: [],
    content_length: content.length,
    mention_count: 0,
    attachment_count: attachments.length
  };
}

export function extractMentionsFromContent(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

export function isValidAttachment(file: File): boolean {
  const maxSize = 50 * 1024 * 1024; // 50MB
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain'
  ];
  
  return file.size <= maxSize && allowedTypes.includes(file.type);
}