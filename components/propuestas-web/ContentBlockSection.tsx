import Image from 'next/image';
import type { SnapshotContentBlock } from '@/lib/propuestas-web/snapshot';

interface ContentBlockSectionProps {
  block: SnapshotContentBlock;
  variant: 'dark' | 'light';
}

export default function ContentBlockSection({ block, variant }: ContentBlockSectionProps) {
  const isDark = variant === 'dark';
  const bgClass = isDark ? 'bg-[#0a0a0a]' : 'bg-white';
  const textClass = isDark ? 'text-white' : 'text-[#0a0a0a]';
  const secondaryClass = isDark ? 'text-white/70' : 'text-gray-600';
  const headingClass = isDark ? 'text-white' : 'text-[#0a0a0a]';
  const listDotClass = isDark ? 'bg-[#fbbf24]' : 'bg-[#0a0a0a]';

  return (
    <section className={`${bgClass} ${textClass} py-16 px-4 sm:px-6 lg:px-8`}>
      <div className="max-w-5xl mx-auto">
        <h2 className={`text-3xl sm:text-4xl font-bold ${headingClass} mb-8`}>
          {block.titulo}
        </h2>

        <div className="space-y-6">
          {block.contenido.sections.map((section, idx) => {
            switch (section.type) {
              case 'heading':
                return (
                  <h3
                    key={idx}
                    className={`${
                      section.level === 3 ? 'text-xl' : 'text-2xl'
                    } font-bold ${headingClass} mt-8`}
                  >
                    {section.text}
                  </h3>
                );

              case 'paragraph':
                return (
                  <p key={idx} className={`${secondaryClass} leading-relaxed text-lg`}>
                    {section.text}
                  </p>
                );

              case 'list':
                return (
                  <ul key={idx} className="space-y-3">
                    {section.items?.map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className={`w-2 h-2 ${listDotClass} rounded-full mt-2.5 flex-shrink-0`}
                        />
                        <span className={`${secondaryClass} leading-relaxed`}>{item}</span>
                      </li>
                    ))}
                  </ul>
                );

              case 'image':
                return section.path ? (
                  <div key={idx} className="relative w-full h-64 sm:h-80 rounded-2xl overflow-hidden my-8">
                    <Image
                      src={section.path}
                      alt={section.text || block.titulo}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : null;

              default:
                return null;
            }
          })}
        </div>

        {block.imagenes && block.imagenes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
            {block.imagenes.map((img) => (
              <div key={img.key} className="relative h-56 rounded-2xl overflow-hidden">
                <Image src={img.path} alt={img.alt} fill className="object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
