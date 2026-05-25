import type { SupabaseClient } from '@supabase/supabase-js';

export interface FormSubmissionData {
  id?: string;
  submission_date: string;
  form_type: string;
  recipient_email: string;
  sender_email: string;
  sender_name: string;
  created_at?: string;
}

export async function trackFormSubmission(
  supabase: SupabaseClient,
  data: {
    senderEmail: string;
    senderName: string;
    formType?: string;
  }
): Promise<{ count: number; warning: boolean; message?: string }> {
  try {
    // Record the submission
    const { error: insertError } = await supabase
      .from('form_submissions')
      .insert({
        submission_date: new Date().toISOString(),
        form_type: data.formType || 'contact',
        recipient_email: 'info@nuevaeducacion.org',
        sender_email: data.senderEmail,
        sender_name: data.senderName
      });

    if (insertError) {
      console.error('Error tracking form submission:', insertError);
    }

    // Get count for current month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: submissions, error: countError } = await supabase
      .from('form_submissions')
      .select('id')
      .gte('submission_date', firstDayOfMonth)
      .lte('submission_date', lastDayOfMonth);

    if (countError) {
      console.error('Error counting submissions:', countError);
      return { count: 0, warning: false };
    }

    const count = submissions?.length || 0;

    // Check if we need to send a warning
    let warning = false;
    let message = undefined;

    if (count >= 50) {
      warning = true;
      message = '🚨 LÍMITE ALCANZADO: Has alcanzado el límite de 50 emails gratuitos de Formspree este mes. Los próximos formularios no se enviarán. Por favor, actualiza tu plan en https://formspree.io';
    } else if (count >= 45) {
      warning = true;
      message = `⚠️ ADVERTENCIA: Has usado ${count} de 50 emails gratuitos de Formspree este mes. Quedan solo ${50 - count} envíos. Considera actualizar tu plan pronto en https://formspree.io`;
    } else if (count >= 40) {
      message = `📊 Has usado ${count} de 50 emails gratuitos de Formspree este mes.`;
    }

    // If warning triggered, send admin notification
    if (warning && count === 45) {
      // Only send notification when EXACTLY hitting 45 to avoid spam
      await sendAdminNotification(count);
    }

    return { count, warning, message };
  } catch (error) {
    console.error('Error in form submission tracker:', error);
    return { count: 0, warning: false };
  }
}

async function sendAdminNotification(count: number) {
  try {
    // Send a special admin notification via Formspree
    const response = await fetch(process.env.FORMSPREE_ENDPOINT!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: 'system@nuevaeducacion.org',
        name: 'Sistema FNE',
        _subject: '⚠️ ALERTA: Límite de Formspree Próximo (45/50)',
        message: `
ALERTA AUTOMÁTICA DEL SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Has alcanzado 45 de 50 emails gratuitos de Formspree este mes.

Quedan solo 5 envíos disponibles antes de que el formulario de contacto deje de funcionar.

ACCIÓN RECOMENDADA:
→ Actualiza tu plan de Formspree en: https://formspree.io/forms/mblkwada/settings/billing
→ El plan Gold ($8/mes) incluye 1000 envíos mensuales

ESTADÍSTICAS DEL MES:
• Emails enviados: ${count}
• Emails restantes: ${50 - count}
• Fecha de reinicio: Día 1 del próximo mes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este es un mensaje automático del sistema de monitoreo.
        `
      })
    });

    if (response.ok) {
      console.log('✅ Admin notification sent for Formspree limit warning');
    }
  } catch (error) {
    console.error('Error sending admin notification:', error);
  }
}

// Get monthly statistics
export async function getMonthlyFormStats(supabase: SupabaseClient) {
  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: submissions, error } = await supabase
      .from('form_submissions')
      .select('*')
      .gte('submission_date', firstDayOfMonth)
      .lte('submission_date', lastDayOfMonth)
      .order('submission_date', { ascending: false });

    if (error) {
      console.error('Error getting form stats:', error);
      return null;
    }

    return {
      total: submissions?.length || 0,
      remaining: 50 - (submissions?.length || 0),
      percentage: ((submissions?.length || 0) / 50) * 100,
      submissions: submissions || [],
      resetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('es-CL')
    };
  } catch (error) {
    console.error('Error getting monthly stats:', error);
    return null;
  }
}
