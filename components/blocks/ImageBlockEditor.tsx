import React, { useState } from 'react';
import { ImageBlock, CarouselImage } from '@/types/blocks';
import { Button } from '@/components/ui/button';
import { Upload, X, Plus } from 'lucide-react';
import { uploadFile } from '@/utils/storage';
import BlockEditorWrapper from './BlockEditorWrapper';
import { getBlockConfig } from '@/config/blockTypes';

interface ImageBlockEditorProps {
  block: ImageBlock;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, field: keyof ImageBlock['payload'], value: any) => void;
  onUpload: (id: string, file: File) => void;
  onTitleChange: (id: string, title: string) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

const ImageBlockEditor: React.FC<ImageBlockEditorProps> = ({
  block,
  onSave,
  onDelete,
  onUpdate,
  onUpload,
  onTitleChange,
  isCollapsed,
  toggleCollapse,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Initialize images array from block payload
  const initializeImages = (): CarouselImage[] => {
    if (block.payload.images && block.payload.images.length > 0) {
      return block.payload.images;
    }
    // Backward compatibility: convert single image to array
    if (block.payload.src) {
      return [{
        id: Date.now().toString(),
        src: block.payload.src,
        alt: block.payload.alt || '',
        caption: block.payload.caption || ''
      }];
    }
    return [];
  };

  const [images, setImages] = useState<CarouselImage[]>(initializeImages());

  const updateBlockImages = (newImages: CarouselImage[]) => {
    setImages(newImages);
    // Update the block payload
    const updatedPayload = {
      ...block.payload,
      images: newImages
    };
    // Update through the parent component
    Object.keys(updatedPayload).forEach(key => {
      if (key !== 'images') {
        onUpdate(block.id, key as any, updatedPayload[key]);
      }
    });
    // Handle images array separately
    onUpdate(block.id, 'images' as any, newImages);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const newImages: CarouselImage[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExtension = file.name.split('.').pop();
        const fileName = `images/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
        
        const { url, error } = await uploadFile(file, fileName);
        
        if (error) {
          console.error('Upload error:', error);
          setUploadError(`Error uploading ${file.name}: ${error.message}`);
          continue;
        }
        
        if (url) {
          newImages.push({
            id: `${Date.now()}-${i}`,
            src: url,
            alt: file.name.split('.')[0],
            caption: ''
          });
        }
      }
      
      if (newImages.length > 0) {
        const updatedImages = [...images, ...newImages];
        updateBlockImages(updatedImages);
      }
    } catch (error) {
      setUploadError('Failed to upload images');
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (imageId: string) => {
    const updatedImages = images.filter(img => img.id !== imageId);
    updateBlockImages(updatedImages);
  };

  const updateImage = (imageId: string, field: keyof CarouselImage, value: string) => {
    const updatedImages = images.map(img => 
      img.id === imageId ? { ...img, [field]: value } : img
    );
    updateBlockImages(updatedImages);
  };

  const addImageByUrl = () => {
    const newImage: CarouselImage = {
      id: Date.now().toString(),
      src: '',
      alt: '',
      caption: ''
    };
    updateBlockImages([...images, newImage]);
  };

  const blockConfig = getBlockConfig('image');
  const subtitle = images.length > 0 
    ? `${images.length} imagen${images.length !== 1 ? 'es' : ''}` 
    : 'Sin imágenes';

  return (
    <BlockEditorWrapper
      title={blockConfig.label}
      subtitle={block.payload.title || subtitle}
      isCollapsed={isCollapsed}
      onToggleCollapse={toggleCollapse}
      onDelete={() => onDelete(block.id)}
      onSave={() => onSave(block.id)}
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Título del bloque
        </label>
        <input
          type="text"
          value={block.payload.title || ''}
          onChange={(e) => onTitleChange(block.id, e.target.value)}
          placeholder="Título del bloque"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
        />
      </div>

      {/* Upload Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Agregar imágenes
          </label>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={addImageByUrl}
            className="flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Agregar por URL
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            disabled={isUploading}
            className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {isUploading && (
            <div className="flex items-center gap-1 text-blue-600">
              <Upload className="w-4 h-4 animate-pulse" />
              <span className="text-sm">Subiendo...</span>
            </div>
          )}
        </div>
        {uploadError && (
          <p className="text-sm text-red-600">{uploadError}</p>
        )}
      </div>

      {/* Images List */}
      <div className="space-y-3">
        {images.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-gray-500">No hay imágenes. Sube archivos o agrega URLs.</p>
          </div>
        ) : (
          images.map((image, index) => (
            <div key={image.id} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-start gap-3">
                {image.src && (
                  <img
                    src={image.src}
                    alt={image.alt || `Imagen ${index + 1}`}
                    className="w-20 h-20 object-cover rounded shadow-sm flex-shrink-0"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Imagen {index + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeImage(image.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <input
                    type="text"
                    value={image.src}
                    onChange={(e) => updateImage(image.id, 'src', e.target.value)}
                    placeholder="URL de la imagen"
                    className="w-full p-2 border rounded text-sm"
                  />
                  <input
                    type="text"
                    value={image.alt || ''}
                    onChange={(e) => updateImage(image.id, 'alt', e.target.value)}
                    placeholder="Texto alternativo"
                    className="w-full p-2 border rounded text-sm"
                  />
                  <input
                    type="text"
                    value={image.caption || ''}
                    onChange={(e) => updateImage(image.id, 'caption', e.target.value)}
                    placeholder="Pie de foto"
                    className="w-full p-2 border rounded text-sm"
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </BlockEditorWrapper>
  );
};

export default ImageBlockEditor;
