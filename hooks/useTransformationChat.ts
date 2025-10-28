import { useCallback, useEffect, useMemo, useState } from 'react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface TransformationChatState {
  loading: boolean;
  sending: boolean;
  error: string | null;
  messages: Message[];
  summary?: {
    last_user_message?: string;
    last_assistant_message?: string;
    suggested_level?: number | null;
    rationale?: string | null;
    updated_at?: string;
  };
  suggestedLevel?: number | null;
  assessmentStatus: 'in_progress' | 'completed';
  llmUsage?: {
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number | null;
  };
}

interface UseTransformationChatOptions {
  assessmentId: string;
  rubricItemId: string;
  initialMessages?: Message[];
  initialSummary?: TransformationChatState['summary'];
}

export function useTransformationChat({
  assessmentId,
  rubricItemId,
  initialMessages = [],
  initialSummary,
}: UseTransformationChatOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [summary, setSummary] = useState<TransformationChatState['summary']>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [suggestedLevel, setSuggestedLevel] = useState<number | null>(initialSummary?.suggested_level ?? null);
  const [assessmentStatus, setAssessmentStatus] = useState<'in_progress' | 'completed'>('in_progress');
  const [llmUsage, setLlmUsage] = useState<TransformationChatState['llmUsage']>();
  const loading = false;

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setSummary(initialSummary);
    setSuggestedLevel(initialSummary?.suggested_level ?? null);
  }, [initialSummary]);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;
      if (!assessmentId || !rubricItemId) {
        setError('Selecciona una dimensión válida antes de enviar mensajes.');
        return;
      }

      setSending(true);
      setError(null);

      try {
        const response = await fetch('/api/transformation/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessmentId,
            rubricItemId,
            userMessage,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? 'No se pudo procesar la interacción.');
        }

        const body = await response.json();

        if (Array.isArray(body.conversationSnapshot)) {
          setMessages(
            body.conversationSnapshot.map((msg: Message) => ({
              role: msg.role,
              content: msg.content,
              created_at: msg.created_at,
            }))
          );
        } else {
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: body.assistantMessage },
          ]);
        }

        setSuggestedLevel(body.suggestedLevel ?? body.summary?.suggested_level ?? null);
        setAssessmentStatus(body.updatedAssessment?.status ?? 'in_progress');
        setLlmUsage(body.llmUsage);

        if (body.summary) {
          setSummary(body.summary);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido al enviar el mensaje.';
        setError(message);
      } finally {
        setSending(false);
      }
    },
    [assessmentId, rubricItemId]
  );

  const confirmLevel = useCallback(
    async (level: number) => {
      if (!assessmentId || !rubricItemId) {
        setError('Selecciona una dimensión válida antes de registrar el nivel.');
        return;
      }
      setSending(true);
      setError(null);

      try {
        const response = await fetch('/api/transformation/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessmentId,
            rubricItemId,
            userMessage: `Confirmamos el nivel ${level}.`,
            forceLevel: level,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? 'No se pudo confirmar el nivel.');
        }

        const body = await response.json();
        setSuggestedLevel(body.suggestedLevel ?? level);
        setAssessmentStatus(body.assessmentStatus ?? 'in_progress');
        if (body.summary) {
          setSummary(body.summary);
        }
        if (Array.isArray(body.conversationSnapshot)) {
          setMessages(
            body.conversationSnapshot.map((msg: Message) => ({
              role: msg.role,
              content: msg.content,
              created_at: msg.created_at,
            }))
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido al confirmar el nivel.';
        setError(message);
      } finally {
        setSending(false);
      }
    },
    [assessmentId, rubricItemId]
  );

  const state: TransformationChatState = useMemo(
    () => ({
      loading,
      sending,
      error,
      messages,
      summary,
      suggestedLevel,
      assessmentStatus,
      llmUsage,
    }),
    [loading, sending, error, messages, summary, suggestedLevel, assessmentStatus, llmUsage]
  );

  const hydrate = useCallback(
    ({
      messages: nextMessages,
      summary: nextSummary,
      suggestedLevel: nextSuggestedLevel,
      assessmentStatus: nextAssessmentStatus,
    }: {
      messages: Message[];
      summary?: TransformationChatState['summary'];
      suggestedLevel?: number | null;
      assessmentStatus?: 'in_progress' | 'completed';
    }) => {
      setMessages(nextMessages);
      setSummary(nextSummary);
      setSuggestedLevel(nextSuggestedLevel ?? nextSummary?.suggested_level ?? null);
      if (nextAssessmentStatus) {
        setAssessmentStatus(nextAssessmentStatus);
      }
    },
    []
  );

  return {
    state,
    sendMessage,
    confirmLevel,
    hydrate,
  };
}
