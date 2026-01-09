import { 
  FileText, 
  Video, 
  Image, 
  HelpCircle, 
  FolderDown, 
  ExternalLink,
  Users,
  BookOpen
} from 'lucide-react';

export interface BlockTypeConfig {
  type: string;
  label: string;
  subtitle: string;
  description: string;
  icon: any;
  iconColor: string;
  category: 'content' | 'media' | 'interactive' | 'resources';
}

export const BLOCK_TYPES: Record<string, BlockTypeConfig> = {
  'text': {
    type: 'text',
    label: 'Bloque de Texto',
    subtitle: 'Contenido con formato',
    description: 'Contenido de texto con formato rich text',
    icon: FileText,
    iconColor: 'text-blue-600',
    category: 'content'
  },
  'video': {
    type: 'video',
    label: 'Bloque de Video',
    subtitle: 'Video multimedia',
    description: 'Videos de YouTube, Vimeo o archivos locales',
    icon: Video,
    iconColor: 'text-amber-600',
    category: 'media'
  },
  'image': {
    type: 'image',
    label: 'Galería de Imágenes',
    subtitle: 'Carrusel de imágenes',
    description: 'Imágenes individuales o carruseles múltiples',
    icon: Image,
    iconColor: 'text-green-600',
    category: 'media'
  },
  'quiz': {
    type: 'quiz',
    label: 'Evaluación Interactiva',
    subtitle: 'Quiz de evaluación',
    description: 'Cuestionarios y evaluaciones con puntuación',
    icon: HelpCircle,
    iconColor: 'text-orange-600',
    category: 'interactive'
  },
  'download': {
    type: 'download',
    label: 'Archivos para Descargar',
    subtitle: 'Recursos descargables',
    description: 'Documentos, PDFs y archivos para descargar',
    icon: FolderDown,
    iconColor: 'text-slate-600',
    category: 'resources'
  },
  'external-links': {
    type: 'external-links',
    label: 'Enlaces Externos',
    subtitle: 'Recursos externos',
    description: 'Enlaces organizados a recursos web externos',
    icon: ExternalLink,
    iconColor: 'text-red-600',
    category: 'resources'
  },
  'group-assignment': {
    type: 'group-assignment',
    label: 'Tarea Grupal',
    subtitle: 'Asignación colaborativa',
    description: 'Tarea para grupos de estudiantes con entrega conjunta',
    icon: Users,
    iconColor: 'text-teal-600',
    category: 'interactive'
  },
  'bibliography': {
    type: 'bibliography',
    label: 'Bibliografía',
    subtitle: 'Referencias y recursos',
    description: 'Colección de PDFs y enlaces externos organizados',
    icon: BookOpen,
    iconColor: 'text-amber-600',
    category: 'resources'
  }
} as const;

export const getBlockConfig = (type: string): BlockTypeConfig => {
  return BLOCK_TYPES[type] || BLOCK_TYPES['text'];
};

export const getBlocksByCategory = () => {
  const categories = {
    content: [] as BlockTypeConfig[],
    media: [] as BlockTypeConfig[],
    interactive: [] as BlockTypeConfig[],
    resources: [] as BlockTypeConfig[]
  };

  Object.values(BLOCK_TYPES).forEach(block => {
    categories[block.category].push(block);
  });

  return categories;
};

// Helper function to get display title for a block
export const getBlockDisplayTitle = (type: string, customTitle?: string): string => {
  const config = getBlockConfig(type);
  return customTitle || config.label;
};

// Helper function to get subtitle for timeline
export const getBlockSubtitle = (block: any): string => {
  const config = getBlockConfig(block.type);
  
  switch (block.type) {
    case 'quiz':
      return `${block.payload?.questions?.length || 0} pregunta${(block.payload?.questions?.length || 0) !== 1 ? 's' : ''}`;
    case 'text':
      return block.payload?.content ? 'Contenido configurado' : 'Sin contenido';
    case 'video':
      return block.payload?.url ? 'Video configurado' : 'Sin video';
    case 'image':
      const imageCount = block.payload?.images?.length || 0;
      if (imageCount > 1) {
        return `${imageCount} imágenes`;
      } else if (block.payload?.src || imageCount > 0) {
        return 'Imagen configurada';
      } else {
        return 'Sin imagen';
      }
    case 'download':
      return `${block.payload?.files?.length || 0} archivo${(block.payload?.files?.length || 0) !== 1 ? 's' : ''}`;
    case 'external-links':
      return `${block.payload?.links?.length || 0} enlace${(block.payload?.links?.length || 0) !== 1 ? 's' : ''}`;
    case 'group-assignment':
      return `${block.payload?.groups?.length || 0} grupo${(block.payload?.groups?.length || 0) !== 1 ? 's' : ''}`;
    case 'bibliography':
      const itemCount = block.payload?.items?.length || 0;
      return `${itemCount} recurso${itemCount !== 1 ? 's' : ''}`;
    default:
      return config.subtitle;
  }
};