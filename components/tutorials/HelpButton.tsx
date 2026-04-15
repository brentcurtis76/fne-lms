import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import HelpDrawer from './HelpDrawer';
import type { TutorialSectionId } from '@/lib/tutorials/content';

interface HelpButtonProps {
  sectionId: TutorialSectionId;
}

export default function HelpButton({ sectionId }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ayuda y tutoriales"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      <HelpDrawer sectionId={sectionId} open={open} onOpenChange={setOpen} />
    </>
  );
}
