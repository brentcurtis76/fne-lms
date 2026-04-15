import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Clock } from 'lucide-react';
import VimeoEmbed from './VimeoEmbed';
import { TUTORIALS, type TutorialSectionId } from '@/lib/tutorials/content';

interface HelpDrawerProps {
  sectionId: TutorialSectionId;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function HelpDrawer({ sectionId, open, onOpenChange }: HelpDrawerProps) {
  const section = TUTORIALS[sectionId];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ayuda — {section.title}</DialogTitle>
          <DialogDescription>Videos y guías para {section.title.toLowerCase()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              {section.overview.title}
              <span className="ml-2 text-xs text-gray-400">
                ({section.overview.durationMin} min)
              </span>
            </h3>
            <VimeoEmbed vimeoId={section.overview.vimeoId} title={section.overview.title} />
          </div>

          {section.deepDives.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Otros videos cortos</h3>
              <div className="space-y-2">
                {section.deepDives.map((dive, i) => (
                  <details key={i} className="group rounded-lg border border-gray-200">
                    <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <span>{dive.title}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {dive.durationMin} min
                      </span>
                    </summary>
                    <div className="px-4 pb-4">
                      <VimeoEmbed vimeoId={dive.vimeoId} title={dive.title} />
                      {dive.textSteps && dive.textSteps.length > 0 && (
                        <ol className="mt-3 list-decimal pl-5 text-sm text-gray-600 space-y-1">
                          {dive.textSteps.map((step, j) => (
                            <li key={j}>{step}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
