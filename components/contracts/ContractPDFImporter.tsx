import React, { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, XCircle, Loader, X, Eye, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface ExtractedData {
  contract: {
    numero_contrato: string;
    fecha_contrato: string;
    fecha_fin?: string;
    confidence: number;
  };
  client: {
    nombre_legal: string;
    nombre_fantasia?: string;
    rut: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
    nombre_representante?: string;
    rut_representante?: string;
    confidence: number;
  };
  financial: {
    precio_total: number;
    moneda: 'UF' | 'CLP';
    confidence: number;
  };
  payment_schedule?: Array<{
    numero_cuota: number;
    fecha_vencimiento: string;
    monto: number;
    confidence: number;
  }>;
  overall_confidence: number;
}

interface ValidationError {
  field: string;
  message: string;
  value?: string;
}

interface ContractPDFImporterProps {
  onExtract: (data: ExtractedData) => void;
  onCancel: () => void;
  existingClientId?: string;
}

export default function ContractPDFImporter({ 
  onExtract, 
  onCancel, 
  existingClientId 
}: ContractPDFImporterProps) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [existingClient, setExistingClient] = useState<any>(null);
  const [requiresReview, setRequiresReview] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handleFileUpload(file);
    } else {
      toast.error('Por favor, seleccione un archivo PDF');
    }
  }, []);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Upload and extract PDF
  const handleFileUpload = async (file: File) => {
    // Validate file
    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('El archivo es demasiado grande (máximo 10MB)');
      return;
    }

    setPdfFile(file);
    setPdfPreviewUrl(URL.createObjectURL(file));
    setPageNumber(1); // Reset to first page
    setNumPages(null);
    setUploading(true);
    
    // Show extraction immediately and keep it visible
    setExtracting(true);
    
    // Add a small delay to ensure the animation is visible
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = reader.result?.toString().split(',')[1];
          
          if (!base64) {
            throw new Error('Failed to read file');
          }

        // Try real API first, fall back to mock if API key not configured
        let response = await fetch('/api/contracts/extract-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pdfBase64: base64,
            fileName: file.name
          }),
        });

        let result;
        
        // Check if API key is not configured
        if (response.status === 500) {
          const errorData = await response.json();
          if (errorData.error?.includes('API de Claude')) {
            console.log('Claude API not configured, using mock extraction mode...');
            
            // Use mock endpoint instead
            const mockResponse = await fetch('/api/contracts/extract-pdf-mock', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                pdfBase64: base64,
                fileName: file.name
              }),
            });
            
            result = await mockResponse.json();
            
            if (!mockResponse.ok) {
              throw new Error(result.error || 'Error al procesar el PDF en modo mock');
            }
            
            // Show mock data notice
            toast(result.message || 'Usando datos de prueba - Configure API key para extracción real', {
              icon: 'ℹ️',
              duration: 4000,
            });
          } else {
            // Other error, throw it
            throw new Error(errorData.error || 'Error al procesar el PDF');
          }
        } else {
          // Response from real API
          result = await response.json();
          
          if (!response.ok) {
            throw new Error(result.error || 'Error al procesar el PDF');
          }
        }

        // Set extracted data
        setExtractedData(result.extracted);
        setValidationErrors(result.validationErrors || []);
        setExistingClient(result.existingClient);
        setRequiresReview(result.requiresReview);
        
        // Turn off extraction loading AFTER data is set
        setExtracting(false);

        // Show confidence warning if needed
        if (result.extracted.overall_confidence < 0.7) {
          toast('Confianza baja en la extracción - Por favor revise los datos', {
            icon: '⚠️',
            duration: 4000
          });
        } else if (result.extracted.overall_confidence > 0.9) {
          toast.success('Extracción completada con alta confianza');
        } else {
          toast.success('Extracción completada - Revise los datos antes de confirmar');
        }
        } catch (error) {
          console.error('Error in extraction:', error);
          toast.error(error instanceof Error ? error.message : 'Error al procesar el PDF');
          setExtracting(false);
        }
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error extracting PDF:', error);
      toast.error(error instanceof Error ? error.message : 'Error al extraer datos del PDF');
      setExtracting(false);
    } finally {
      setUploading(false);
      // Don't set extracting to false here - it should be done in the reader.onloadend
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Get confidence icon
  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle size={16} className="text-green-600" />;
    if (confidence >= 0.6) return <AlertCircle size={16} className="text-yellow-600" />;
    return <XCircle size={16} className="text-red-600" />;
  };

  // Handle field editing
  const handleFieldEdit = (path: string, value: any) => {
    if (!extractedData) return;

    const newData = { ...extractedData };
    const pathParts = path.split('.');
    let current: any = newData;

    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]];
    }

    current[pathParts[pathParts.length - 1]] = value;
    setExtractedData(newData);
    setEditingField(null);
  };

  // Handle confirmation
  const handleConfirm = () => {
    if (!extractedData) return;

    // Final validation
    if (validationErrors.length > 0 && !window.confirm('Hay errores de validación. ¿Desea continuar de todos modos?')) {
      return;
    }

    // Ensure required fields have defaults before passing to parent
    const today = new Date().toISOString().split('T')[0];
    const processedData = {
      ...extractedData,
      client: {
        ...extractedData.client,
        // Set defaults for required fields if they're missing
        nombre_fantasia: extractedData.client.nombre_fantasia || extractedData.client.nombre_legal,
        rut_representante: extractedData.client.rut_representante || '11.111.111-1',
        fecha_escritura: today // Always use today's date for fecha_escritura
      }
    };

    onExtract(processedData);
    toast.success('Datos importados exitosamente');
  };

  // Render field with confidence indicator
  const renderField = (label: string, value: any, confidence: number, path: string, required = false) => {
    const isEditing = editingField === path;
    const hasError = validationErrors.some(e => e.field === path);

    return (
      <div className={`p-3 rounded-lg border ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(confidence)}`}>
              {Math.round(confidence * 100)}%
            </span>
            {getConfidenceIcon(confidence)}
            <button
              onClick={() => setEditingField(path)}
              className="p-1 hover:bg-gray-100 rounded"
              title="Editar"
            >
              <Edit2 size={14} />
            </button>
          </div>
        </div>
        
        {isEditing ? (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleFieldEdit(path, e.target.value)}
            onBlur={() => setEditingField(null)}
            onKeyPress={(e) => e.key === 'Enter' && setEditingField(null)}
            className="w-full px-2 py-1 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <div className="text-gray-900">{value || '-'}</div>
        )}
        
        {hasError && (
          <div className="mt-1 text-xs text-red-600">
            {validationErrors.find(e => e.field === path)?.message}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Importar Contrato desde PDF</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-8rem)]">
          {/* Left side - PDF Upload/Preview */}
          <div className="w-1/2 border-r border-gray-200 p-6 overflow-y-auto">
            {!pdfFile ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors"
              >
                <Upload size={48} className="text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Arrastra un PDF aquí o haz clic para seleccionar
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Máximo 10MB • Solo archivos PDF
                </p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Seleccionar archivo
                  </span>
                </label>
              </div>
            ) : (
              <div className="h-full flex flex-col relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <FileText size={24} className="text-blue-600 mr-2" />
                    <span className="font-medium">{pdfFile.name}</span>
                  </div>
                  <button
                    onClick={() => {
                      setPdfFile(null);
                      setPdfPreviewUrl(null);
                      setExtractedData(null);
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    Cambiar archivo
                  </button>
                </div>
                
                {/* PDF Preview - Always shown when file is selected */}
                <div className="flex-1 flex flex-col">
                  <div className="bg-gray-100 rounded-lg flex-1 overflow-auto relative">
                    <Document
                      file={pdfPreviewUrl}
                      onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                      className="flex justify-center"
                    >
                      <Page 
                        pageNumber={pageNumber} 
                        width={400}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                  </div>
                  
                  {numPages && numPages > 1 && (
                    <div className="flex items-center justify-center mt-4 space-x-4">
                      <button
                        onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                        disabled={pageNumber <= 1 || extracting}
                        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <span className="text-sm text-gray-600">
                        Página {pageNumber} de {numPages}
                      </span>
                      <button
                        onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                        disabled={pageNumber >= numPages || extracting}
                        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right side - Extracted Data */}
          <div className="w-1/2 p-6 overflow-y-auto">
            {!extractedData ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  {extracting ? (
                    <div className="flex flex-col items-center justify-center max-w-md">
                      <div className="relative mb-6">
                        <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-200 border-t-blue-600"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <FileText className="text-blue-600 animate-pulse" size={32} />
                        </div>
                      </div>
                      <p className="text-gray-900 font-bold text-xl mb-4">Extrayendo información...</p>
                      <div className="space-y-3 text-center mb-6">
                        <div className="flex items-center justify-center space-x-2">
                          <span className="text-green-500 text-lg">✓</span>
                          <p className="text-gray-700 text-sm">PDF cargado correctamente</p>
                        </div>
                        <div className="flex items-center justify-center space-x-2">
                          <span className="text-green-500 text-lg">✓</span>
                          <p className="text-gray-700 text-sm">Procesando texto del documento</p>
                        </div>
                        <div className="flex items-center justify-center space-x-2 animate-pulse">
                          <Loader className="text-blue-600 animate-spin" size={16} />
                          <p className="text-gray-700 text-sm font-medium">Identificando datos del contrato...</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-lg border border-blue-200">
                        <p className="text-blue-800 text-sm font-semibold">
                          Claude AI está analizando su documento
                        </p>
                      </div>
                      <p className="text-gray-500 text-xs mt-4">
                        Esto puede tomar entre 3-5 segundos
                      </p>
                    </div>
                  ) : (
                    <>
                      <FileText size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">
                        Seleccione un PDF para extraer la información del contrato
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall confidence */}
                <div className={`p-4 rounded-lg ${getConfidenceColor(extractedData.overall_confidence)}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Confianza general de extracción</span>
                    <span className="text-2xl font-bold">
                      {Math.round(extractedData.overall_confidence * 100)}%
                    </span>
                  </div>
                </div>

                {/* Existing client alert */}
                {existingClient && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start">
                      <AlertCircle className="text-blue-600 mr-2 flex-shrink-0" size={20} />
                      <div>
                        <p className="font-medium text-blue-900">Cliente existente encontrado</p>
                        <p className="text-blue-700 text-sm mt-1">
                          Se encontró el cliente "{existingClient.nombre_legal}" con el mismo RUT.
                          Los datos del cliente se usarán automáticamente.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contract Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Información del Contrato</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {renderField('Número de Contrato', extractedData.contract.numero_contrato, 
                      extractedData.contract.confidence, 'contract.numero_contrato', true)}
                    {renderField('Fecha del Contrato', extractedData.contract.fecha_contrato, 
                      extractedData.contract.confidence, 'contract.fecha_contrato', true)}
                    {renderField('Fecha de Término', extractedData.contract.fecha_fin, 
                      extractedData.contract.confidence, 'contract.fecha_fin')}
                  </div>
                </div>

                {/* Client Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Información del Cliente</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {renderField('Razón Social', extractedData.client.nombre_legal, 
                      extractedData.client.confidence, 'client.nombre_legal', true)}
                    {renderField('RUT', extractedData.client.rut, 
                      extractedData.client.confidence, 'client.rut', true)}
                    {renderField('Dirección', extractedData.client.direccion, 
                      extractedData.client.confidence, 'client.direccion')}
                    {renderField('Comuna', extractedData.client.comuna, 
                      extractedData.client.confidence, 'client.comuna')}
                    {renderField('Ciudad', extractedData.client.ciudad, 
                      extractedData.client.confidence, 'client.ciudad')}
                    {renderField('Representante Legal', extractedData.client.nombre_representante, 
                      extractedData.client.confidence, 'client.nombre_representante')}
                    {renderField('RUT Representante', extractedData.client.rut_representante, 
                      extractedData.client.confidence, 'client.rut_representante')}
                  </div>
                </div>

                {/* Financial Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Información Financiera</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {renderField('Precio Total', extractedData.financial.precio_total, 
                      extractedData.financial.confidence, 'financial.precio_total', true)}
                    {renderField('Moneda', extractedData.financial.moneda, 
                      extractedData.financial.confidence, 'financial.moneda', true)}
                  </div>
                </div>

                {/* Payment Schedule */}
                {extractedData.payment_schedule && extractedData.payment_schedule.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Calendario de Pagos ({extractedData.payment_schedule.length} cuotas)
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-sm text-gray-600">
                            <th className="pb-2">N°</th>
                            <th className="pb-2">Vencimiento</th>
                            <th className="pb-2">Monto</th>
                            <th className="pb-2">Confianza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extractedData.payment_schedule.map((payment, index) => (
                            <tr key={index} className="border-t border-gray-200">
                              <td className="py-2">{payment.numero_cuota}</td>
                              <td className="py-2">{payment.fecha_vencimiento}</td>
                              <td className="py-2">
                                {extractedData.financial.moneda} {payment.monto.toLocaleString('es-CL')}
                              </td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${getConfidenceColor(payment.confidence)}`}>
                                  {Math.round(payment.confidence * 100)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start">
                      <XCircle className="text-red-600 mr-2 flex-shrink-0" size={20} />
                      <div>
                        <p className="font-medium text-red-900">Errores de validación</p>
                        <ul className="list-disc list-inside text-red-700 text-sm mt-2">
                          {validationErrors.map((error, index) => (
                            <li key={index}>{error.message}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div>
            {extractedData && requiresReview && (
              <p className="text-sm text-yellow-600">
                ⚠️ Se requiere revisión manual de los datos extraídos
              </p>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!extractedData || extracting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Confirmar e Importar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
