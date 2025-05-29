import { useState } from 'react';
import { X, FileText, Calendar, DollarSign, MapPin, User, Building, CreditCard, Download, Upload, TrendingUp, Edit, Trash2, Check, Eye } from 'lucide-react';

interface Programa {
  id: string;
  nombre: string;
  descripcion: string;
  horas_totales: number;
  modalidad: string;
  codigo_servicio: string;
}

interface Cliente {
  id: string;
  nombre_legal: string;
  nombre_fantasia: string;
  rut: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  nombre_representante: string;
  rut_representante?: string;
  fecha_escritura?: string;
  nombre_notario?: string;
  comuna_notaria?: string;
}

interface Cuota {
  id: string;
  contrato_id: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  monto_uf: number;
  pagada: boolean;
  created_at: string;
  factura_url?: string;
  factura_pagada?: boolean;
}

interface Contrato {
  id: string;
  numero_contrato: string;
  fecha_contrato: string;
  fecha_fin?: string;
  cliente_id: string;
  programa_id: string;
  precio_total_uf: number;
  tipo_moneda?: 'UF' | 'CLP';
  firmado?: boolean;
  estado?: 'pendiente' | 'activo';
  incluir_en_flujo?: boolean;
  contrato_url?: string;
  clientes: Cliente;
  programas: Programa;
  cuotas?: Cuota[];
}

interface ContractDetailsModalProps {
  contrato: Contrato;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (contrato: Contrato) => void;
  onDelete: (contrato: Contrato) => void;
  onToggleCashFlow: (contrato: Contrato) => void;
  onUploadContract: (contrato: Contrato, file: File) => void;
  onGeneratePDF: (contrato: Contrato) => void;
  onUploadInvoice?: (cuotaId: string, file: File) => Promise<void>;
  onTogglePaymentStatus?: (cuotaId: string, currentStatus: boolean) => Promise<void>;
}

export default function ContractDetailsModal({
  contrato,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleCashFlow,
  onUploadContract,
  onGeneratePDF,
  onUploadInvoice,
  onTogglePaymentStatus
}: ContractDetailsModalProps) {
  const [uploadingContract, setUploadingContract] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL');
  };

  const formatCurrency = (amount: number) => {
    const currency = contrato.tipo_moneda || (amount > 1000 ? 'CLP' : 'UF');
    if (currency === 'UF') {
      return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`;
    } else {
      return `$${amount.toLocaleString('es-CL')}`;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadingContract(true);
      try {
        await onUploadContract(contrato, file);
      } finally {
        setUploadingContract(false);
      }
    }
  };

  const handleInvoiceUpload = async (cuotaId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onUploadInvoice) {
      setUploadingInvoice(cuotaId);
      try {
        await onUploadInvoice(cuotaId, file);
      } finally {
        setUploadingInvoice(null);
      }
    }
  };

  const handlePaymentToggle = async (cuotaId: string, currentStatus: boolean) => {
    if (onTogglePaymentStatus) {
      try {
        await onTogglePaymentStatus(cuotaId, currentStatus);
      } catch (error) {
        console.error('Error toggling payment status:', error);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-brand_blue text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{contrato.numero_contrato}</h2>
              <p className="text-blue-100">Detalles del Contrato</p>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:text-blue-200 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Contract Status and Actions */}
          <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                contrato.estado === 'activo' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {contrato.estado === 'activo' ? 'Activo' : 'Pendiente'}
              </span>
              
              <button
                onClick={() => onToggleCashFlow(contrato)}
                className={`flex items-center space-x-2 text-sm px-3 py-1 rounded-full transition-colors ${
                  contrato.incluir_en_flujo 
                    ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <TrendingUp size={14} />
                <span>{contrato.incluir_en_flujo ? 'En Flujo de Caja' : 'Fuera de Flujo'}</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => onEdit(contrato)}
                className="flex items-center space-x-2 px-4 py-2 bg-brand_yellow text-brand_blue rounded-lg hover:bg-yellow-400 transition-colors"
              >
                <Edit size={16} />
                <span>Editar</span>
              </button>
              
              <button
                onClick={() => onGeneratePDF(contrato)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download size={16} />
                <span>PDF</span>
              </button>
              
              <button
                onClick={() => onDelete(contrato)}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 size={16} />
                <span>Eliminar</span>
              </button>
            </div>
          </div>

          {/* Contract Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Contract Info */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Información del Contrato</h3>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <FileText className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Número de Contrato</p>
                    <p className="font-medium">{contrato.numero_contrato}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Calendar className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Fecha de Contrato</p>
                    <p className="font-medium">{formatDate(contrato.fecha_contrato)}</p>
                  </div>
                </div>

                {contrato.fecha_fin && (
                  <div className="flex items-center space-x-3">
                    <Calendar className="text-brand_blue" size={20} />
                    <div>
                      <p className="text-sm text-gray-600">Fecha de Fin</p>
                      <p className="font-medium">{formatDate(contrato.fecha_fin)}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <DollarSign className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Valor Total</p>
                    <p className="font-medium text-lg">{formatCurrency(contrato.precio_total_uf)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Client Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Información del Cliente</h3>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Building className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Nombre Legal</p>
                    <p className="font-medium">{contrato.clientes.nombre_legal}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Building className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Nombre Fantasía</p>
                    <p className="font-medium">{contrato.clientes.nombre_fantasia}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <CreditCard className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">RUT</p>
                    <p className="font-medium">{contrato.clientes.rut}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <MapPin className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Dirección</p>
                    <p className="font-medium">{contrato.clientes.direccion}</p>
                    <p className="text-sm text-gray-500">{contrato.clientes.comuna}, {contrato.clientes.ciudad}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <User className="text-brand_blue" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Representante</p>
                    <p className="font-medium">{contrato.clientes.nombre_representante}</p>
                    {contrato.clientes.rut_representante && (
                      <p className="text-sm text-gray-500">RUT: {contrato.clientes.rut_representante}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Program Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Información del Programa</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Nombre del Programa</p>
                  <p className="font-medium">{contrato.programas.nombre}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Código de Servicio</p>
                  <p className="font-medium">{contrato.programas.codigo_servicio}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Modalidad</p>
                  <p className="font-medium">{contrato.programas.modalidad}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Horas Totales</p>
                  <p className="font-medium">{contrato.programas.horas_totales} horas</p>
                </div>
              </div>
              {contrato.programas.descripcion && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600">Descripción</p>
                  <p className="text-sm">{contrato.programas.descripcion}</p>
                </div>
              )}
            </div>
          </div>

          {/* Payment Schedule */}
          {contrato.cuotas && contrato.cuotas.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">
                Cronograma de Pagos ({contrato.cuotas.length} cuotas)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_blue">Cuota</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_blue">Fecha Vencimiento</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_blue">Monto</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_blue">Estado</th>
                      <th className="border border-gray-200 px-4 py-3 text-center font-semibold text-brand_blue">Factura</th>
                      <th className="border border-gray-200 px-4 py-3 text-center font-semibold text-brand_blue">Pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrato.cuotas.map((cuota) => (
                      <tr key={cuota.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-4 py-3 font-medium">Cuota {cuota.numero_cuota}</td>
                        <td className="border border-gray-200 px-4 py-3">{formatDate(cuota.fecha_vencimiento)}</td>
                        <td className="border border-gray-200 px-4 py-3 font-semibold text-brand_blue">{formatCurrency(cuota.monto_uf)}</td>
                        <td className="border border-gray-200 px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            cuota.pagada 
                              ? 'bg-green-100 text-green-800' 
                              : new Date(cuota.fecha_vencimiento) < new Date()
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {cuota.pagada 
                              ? 'Pagada' 
                              : new Date(cuota.fecha_vencimiento) < new Date()
                              ? 'Vencida'
                              : 'Pendiente'
                            }
                          </span>
                        </td>
                        <td className="border border-gray-200 px-4 py-3 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            {cuota.factura_url ? (
                              <div className="flex items-center space-x-2">
                                {/* File name display */}
                                <div className="text-xs text-gray-600 max-w-20 truncate" title={cuota.factura_url.split('/').pop()}>
                                  {cuota.factura_url.split('/').pop()?.split('_').slice(-1)[0] || 'Factura'}
                                </div>
                                {/* View button */}
                                <a 
                                  href={cuota.factura_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="Ver factura"
                                >
                                  <Eye className="text-blue-600" size={14} />
                                </a>
                                {/* Download button */}
                                <a 
                                  href={cuota.factura_url} 
                                  download
                                  className="flex items-center justify-center w-7 h-7 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                                  title="Descargar factura"
                                >
                                  <Download className="text-green-600" size={14} />
                                </a>
                              </div>
                            ) : (
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  onChange={(e) => handleInvoiceUpload(cuota.id, e)}
                                  className="hidden"
                                />
                                <div className="flex items-center justify-center w-8 h-8 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                     title="Subir factura">
                                  {uploadingInvoice === cuota.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                  ) : (
                                    <Upload className="text-blue-600" size={16} />
                                  )}
                                </div>
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="border border-gray-200 px-4 py-3 text-center">
                          <button
                            onClick={() => handlePaymentToggle(cuota.id, cuota.factura_pagada || false)}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                              cuota.factura_pagada
                                ? 'bg-green-100 hover:bg-green-200 text-green-600'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-400'
                            }`}
                            title={cuota.factura_pagada ? 'Marcar como no pagado' : 'Marcar como pagado'}
                          >
                            <Check size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Contract Upload Section */}
          {contrato.estado !== 'activo' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_blue border-b pb-2">Subir Contrato Firmado</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800 mb-4">
                  El contrato está pendiente. Sube el documento firmado para activar el contrato.
                </p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="flex items-center justify-center space-x-3 w-full p-4 border-2 border-dashed border-yellow-300 rounded-lg hover:border-yellow-400 transition-colors">
                    {uploadingContract ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div>
                    ) : (
                      <Upload className="text-yellow-600" size={24} />
                    )}
                    <span className="font-medium text-yellow-800">
                      {uploadingContract ? 'Subiendo...' : 'Subir Contrato Firmado'}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}