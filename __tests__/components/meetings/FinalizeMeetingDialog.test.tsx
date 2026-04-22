// @vitest-environment jsdom
import React from 'react';
import { render, act, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock TipTapEditor to avoid jsdom editor wiring and keep tests deterministic.
// The dialog imports from '../../src/components/TipTapEditor'; from this file
// that resolves to '../../../src/components/TipTapEditor'.
vi.mock('../../../src/components/TipTapEditor', () => ({
  __esModule: true,
  default: ({ placeholder }: any) => (
    <div data-testid={`tiptap-${placeholder ?? 'none'}`} />
  ),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { FinalizeMeetingDialog } from '../../../components/meetings/FinalizeMeetingDialog';

type FetchStub = (url: string, init?: any) => Promise<Response>;

const installFetch = (handler: FetchStub) => {
  // @ts-expect-error override global fetch for test
  global.fetch = vi.fn((url: any, init?: any) =>
    handler(String(url), init),
  );
};

const jsonResponse = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const baseProps = {
  open: true as const,
  meetingId: 'mtg-1',
  meetingTitle: 'Reunión de prueba',
};

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const recipientsHandler =
  (count = 3): FetchStub =>
  async (url) => {
    if (url.includes('/recipients')) {
      return jsonResponse({ data: { count } });
    }
    return jsonResponse({}, 200);
  };

const getFinalizeButton = (container: HTMLElement) => {
  // The confirmation button's label is "Finalizar y enviar" (or "Enviando…"
  // while submitting). Query the portal-rendered dialog content via body.
  const root = container.ownerDocument?.body ?? document.body;
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const btn = buttons.find((b) => /Finalizar y enviar/i.test(b.textContent ?? ''));
  if (!btn) throw new Error('Finalize button not found');
  return btn;
};

describe('FinalizeMeetingDialog', () => {
  it('renders community and attended radios with community selected by default', async () => {
    installFetch(recipientsHandler());
    const onOpenChange = vi.fn();

    render(
      <FinalizeMeetingDialog {...baseProps} onOpenChange={onOpenChange} />,
    );

    const root = document.body;
    const community = root.querySelector(
      'input[type="radio"][value="community"]',
    ) as HTMLInputElement;
    const attended = root.querySelector(
      'input[type="radio"][value="attended"]',
    ) as HTMLInputElement;

    expect(community).toBeTruthy();
    expect(attended).toBeTruthy();
    expect(community.checked).toBe(true);
    expect(attended.checked).toBe(false);
  });

  it('selecting "attended" updates the selection', async () => {
    installFetch(recipientsHandler());
    const onOpenChange = vi.fn();

    render(
      <FinalizeMeetingDialog {...baseProps} onOpenChange={onOpenChange} />,
    );

    const root = document.body;
    const attended = root.querySelector(
      'input[type="radio"][value="attended"]',
    ) as HTMLInputElement;

    await act(async () => {
      fireEvent.click(attended);
    });

    const community = root.querySelector(
      'input[type="radio"][value="community"]',
    ) as HTMLInputElement;
    expect(attended.checked).toBe(true);
    expect(community.checked).toBe(false);
  });

  it('POSTs to /api/meetings/:id/finalize with { audience, facilitator_message_doc: undefined } when the editor is empty', async () => {
    const calls: Array<{ url: string; init?: any }> = [];
    // @ts-expect-error override global fetch for test
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes('/recipients')) {
        return jsonResponse({ data: { count: 5 } });
      }
      return jsonResponse({ data: { recipients_count: 5 } }, 200);
    });

    const onOpenChange = vi.fn();
    const onFinalized = vi.fn();

    const { container } = render(
      <FinalizeMeetingDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        onFinalized={onFinalized}
      />,
    );

    await waitFor(() => {
      expect(getFinalizeButton(container)).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(getFinalizeButton(container));
    });

    const postCall = calls.find(
      (c) => c.url === '/api/meetings/mtg-1/finalize' && c.init?.method === 'POST',
    );
    expect(postCall).toBeDefined();

    const body = JSON.parse(postCall!.init.body);
    expect(body).toEqual({ audience: 'community' });
    // JSON.stringify drops keys whose value is `undefined`, which is the
    // contract for an empty editor on the wire.
    expect(Object.prototype.hasOwnProperty.call(body, 'facilitator_message_doc')).toBe(false);
  });

  it('on 200 response, calls onFinalized, closes the dialog, and triggers toast.success', async () => {
    const payload = { data: { recipients_count: 7, meeting_id: 'mtg-1' } };
    installFetch(async (url) => {
      if (url.includes('/recipients')) return jsonResponse({ data: { count: 7 } });
      return jsonResponse(payload, 200);
    });

    const onOpenChange = vi.fn();
    const onFinalized = vi.fn();

    const { container } = render(
      <FinalizeMeetingDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        onFinalized={onFinalized}
      />,
    );

    await waitFor(() => {
      expect(getFinalizeButton(container)).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(getFinalizeButton(container));
    });

    await waitFor(() => {
      expect(onFinalized).toHaveBeenCalledTimes(1);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('on 409 with code "meeting_not_draft", triggers toast.error', async () => {
    installFetch(async (url) => {
      if (url.includes('/recipients')) return jsonResponse({ data: { count: 2 } });
      return jsonResponse(
        { code: 'meeting_not_draft', error: 'La reunión ya no está en borrador' },
        409,
      );
    });

    const onOpenChange = vi.fn();
    const onFinalized = vi.fn();

    const { container } = render(
      <FinalizeMeetingDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        onFinalized={onFinalized}
      />,
    );

    await waitFor(() => {
      expect(getFinalizeButton(container)).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(getFinalizeButton(container));
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledTimes(1);
    });
    expect(toastSuccess).not.toHaveBeenCalled();
    // Conflict path leaves the dialog open (no programmatic close).
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('on generic 500 response, triggers toast.error and does not close the dialog', async () => {
    installFetch(async (url) => {
      if (url.includes('/recipients')) return jsonResponse({ data: { count: 4 } });
      return jsonResponse({ error: 'boom' }, 500);
    });

    const onOpenChange = vi.fn();
    const onFinalized = vi.fn();

    const { container } = render(
      <FinalizeMeetingDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        onFinalized={onFinalized}
      />,
    );

    await waitFor(() => {
      expect(getFinalizeButton(container)).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(getFinalizeButton(container));
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledTimes(1);
    });
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onFinalized).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
