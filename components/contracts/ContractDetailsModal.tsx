import React, { useState, useEffect } from 'react';
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
  nombre_encargado_proyecto?: string;
  telefono_encargado_proyecto?: string;
  email_encargado_proyecto?: string;
  nombre_contacto_administrativo?: string;
  telefono_contacto_administrativo?: string;
  email_contacto_administrativo?: string;
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
  factura_filename?: string;
  factura_size?: number;
  factura_type?: string;
  factura_uploaded_at?: string;
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
  es_manual?: boolean;
  descripcion_manual?: string;
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
  onDeleteInvoice?: (cuotaId: string) => Promise<void>;
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
  onTogglePaymentStatus,
  onDeleteInvoice
}: ContractDetailsModalProps) {
  const [uploadingContract, setUploadingContract] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<string | null>(null);
  const [hiddenInvoices, setHiddenInvoices] = useState<Set<string>>(new Set());

  // Handle Escape key to close modal - MUST be before early return
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Clear hidden invoices when modal closes or contract changes
  useEffect(() => {
    if (!isOpen || !contrato) {
      setHiddenInvoices(new Set());
      setDeletingInvoice(null);
      setDeleteInvoiceId(null);
    }
  }, [isOpen, contrato?.id]);

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    // Parse date string manually to avoid timezone conversion issues
    const parts = dateString.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // months are 0-indexed
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).toLocaleDateString('es-CL');
    }
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

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (type?: string) => {
    if (!type) return '📄';
    if (type.includes('pdf')) return '📑';
    if (type.includes('image')) return '🖼️';
    return '📄';
  };

  const formatUploadDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
      }
      return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return `Hace ${diffDays} días`;
    } else {
      return date.toLocaleDateString('es-CL');
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

  const handleInvoiceDelete = async (cuotaId: string) => {
    setDeleteInvoiceId(cuotaId);
  };

  const confirmInvoiceDelete = async () => {
    if (onDeleteInvoice && deleteInvoiceId) {
      setDeletingInvoice(deleteInvoiceId);
      // Optimistic update - hide the invoice immediately
      setHiddenInvoices(prev => new Set(prev).add(deleteInvoiceId));
      setDeleteInvoiceId(null);
      
      try {
        await onDeleteInvoice(deleteInvoiceId);
      } catch (error) {
        console.error('Error deleting invoice:', error);
        // Revert optimistic update on error
        setHiddenInvoices(prev => {
          const newSet = new Set(prev);
          newSet.delete(deleteInvoiceId);
          return newSet;
        });
      } finally {
        setDeletingInvoice(null);
      }
    }
  };

  // Handle clicking outside the modal to close it
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking on the backdrop itself, not on the modal content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-brand_primary text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{contrato.numero_contrato}</h2>
              <p className="text-gray-300">Detalles del Contrato</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-brand_accent transition-colors"
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
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {contrato.estado === 'activo' ? 'Activo' : 'Pendiente'}
              </span>
              
              <button
                onClick={() => onToggleCashFlow(contrato)}
                className={`flex items-center space-x-2 text-sm px-3 py-1 rounded-full transition-colors ${
                  contrato.incluir_en_flujo
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
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
                className="flex items-center space-x-2 px-4 py-2 bg-brand_yellow text-brand_primary rounded-lg hover:bg-yellow-400 transition-colors"
              >
                <Edit size={16} />
                <span>Editar</span>
              </button>
              
              <button
                onClick={() => onGeneratePDF(contrato)}
                className="flex items-center space-x-2 px-4 py-2 bg-brand_primary text-white rounded-lg hover:bg-gray-800 transition-colors"
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
              <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">Información del Contrato</h3>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <FileText className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Número de Contrato</p>
                    <p className="font-medium">{contrato.numero_contrato}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Calendar className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Fecha de Contrato</p>
                    <p className="font-medium">{formatDate(contrato.fecha_contrato)}</p>
                  </div>
                </div>

                {contrato.fecha_fin && (
                  <div className="flex items-center space-x-3">
                    <Calendar className="text-brand_primary" size={20} />
                    <div>
                      <p className="text-sm text-gray-600">Fecha de Fin</p>
                      <p className="font-medium">{formatDate(contrato.fecha_fin)}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <DollarSign className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Valor Total</p>
                    <p className="font-medium text-lg">{formatCurrency(contrato.precio_total_uf)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Client Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">Información del Cliente</h3>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Building className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Nombre Legal</p>
                    <p className="font-medium">{contrato.clientes.nombre_legal}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Building className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Nombre Fantasía</p>
                    <p className="font-medium">{contrato.clientes.nombre_fantasia}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <CreditCard className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">RUT</p>
                    <p className="font-medium">{contrato.clientes.rut}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <MapPin className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Dirección</p>
                    <p className="font-medium">{contrato.clientes.direccion}</p>
                    <p className="text-sm text-gray-500">{contrato.clientes.comuna}, {contrato.clientes.ciudad}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <User className="text-brand_primary" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Representante</p>
                    <p className="font-medium">{contrato.clientes.nombre_representante}</p>
                    {contrato.clientes.rut_representante && (
                      <p className="text-sm text-gray-500">RUT: {contrato.clientes.rut_representante}</p>
                    )}
                  </div>
                </div>

                {/* Encargado del Proyecto Section */}
                {(contrato.clientes.nombre_encargado_proyecto || 
                  contrato.clientes.telefono_encargado_proyecto || 
                  contrato.clientes.email_encargado_proyecto) && (
                  <div className="border-t pt-3 mt-3">
                    <h4 className="text-sm font-semibold text-brand_primary mb-2">Encargado del Proyecto</h4>
                    
                    {contrato.clientes.nombre_encargado_proyecto && (
                      <div className="flex items-center space-x-3 mb-2">
                        <User className="text-brand_primary" size={18} />
                        <div>
                          <p className="text-xs text-gray-600">Nombre</p>
                          <p className="font-medium text-sm">{contrato.clientes.nombre_encargado_proyecto}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                      {contrato.clientes.telefono_encargado_proyecto && (
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 flex items-center justify-center">
                            <span className="text-brand_primary text-xs">📞</span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Teléfono</p>
                            <p className="text-sm font-medium">{contrato.clientes.telefono_encargado_proyecto}</p>
                          </div>
                        </div>
                      )}

                      {contrato.clientes.email_encargado_proyecto && (
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 flex items-center justify-center">
                            <span className="text-brand_primary text-xs">📧</span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Email</p>
                            <p className="text-sm font-medium">{contrato.clientes.email_encargado_proyecto}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Contacto Administrativo Section */}
                {(contrato.clientes.nombre_contacto_administrativo || 
                  contrato.clientes.telefono_contacto_administrativo || 
                  contrato.clientes.email_contacto_administrativo) && (
                  <div className="border-t pt-3 mt-3">
                    <h4 className="text-sm font-semibold text-brand_primary mb-2">Contacto Administrativo</h4>
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3">
                      <p className="text-xs text-yellow-800">
                        📧 <strong>Contacto para facturación:</strong> A esta persona se enviarán las facturas y documentos administrativos
                      </p>
                    </div>
                    
                    {contrato.clientes.nombre_contacto_administrativo && (
                      <div className="flex items-center space-x-3 mb-2">
                        <User className="text-brand_primary" size={18} />
                        <div>
                          <p className="text-xs text-gray-600">Nombre</p>
                          <p className="font-medium text-sm">{contrato.clientes.nombre_contacto_administrativo}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                      {contrato.clientes.telefono_contacto_administrativo && (
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 flex items-center justify-center">
                            <span className="text-brand_primary text-xs">📞</span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Teléfono</p>
                            <p className="text-sm font-medium">{contrato.clientes.telefono_contacto_administrativo}</p>
                          </div>
                        </div>
                      )}

                      {contrato.clientes.email_contacto_administrativo && (
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 flex items-center justify-center">
                            <span className="text-brand_primary text-xs">📧</span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Email de Facturación</p>
                            <p className="text-sm font-medium">{contrato.clientes.email_contacto_administrativo}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Program Information */}
          {contrato.es_manual ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">Información del Contrato</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Tipo de Contrato</p>
                  <p className="font-medium">Contrato Manual</p>
                </div>
                {contrato.descripcion_manual && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600">Descripción</p>
                    <p className="text-sm">{contrato.descripcion_manual}</p>
                  </div>
                )}
              </div>
            </div>
          ) : contrato.programas ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">Información del Programa</h3>
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
          ) : null}

          {/* Payment Schedule */}
          {contrato.cuotas && contrato.cuotas.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">
                Cronograma de Pagos ({contrato.cuotas.length} cuotas)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_primary">Cuota</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_primary">Fecha Vencimiento</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_primary">Monto</th>
                      <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-brand_primary">Estado</th>
                      <th className="border border-gray-200 px-4 py-3 text-center font-semibold text-brand_primary">Factura</th>
                      <th className="border border-gray-200 px-4 py-3 text-center font-semibold text-brand_primary">Pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrato.cuotas.map((cuota) => (
                      <tr key={cuota.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-4 py-3 font-medium">Cuota {cuota.numero_cuota}</td>
                        <td className="border border-gray-200 px-4 py-3">{formatDate(cuota.fecha_vencimiento)}</td>
                        <td className="border border-gray-200 px-4 py-3 font-semibold text-brand_primary">{formatCurrency(cuota.monto_uf)}</td>
                        <td className="border border-gray-200 px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            cuota.pagada
                              ? 'bg-amber-100 text-amber-800'
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
                            {cuota.factura_url && !hiddenInvoices.has(cuota.id) ? (
                              <div className="flex items-center space-x-2">
                                {/* Enhanced file display */}
                                <div className="flex flex-col items-start">
                                  <div className="flex items-center space-x-1">
                                    <span className="text-sm">{getFileIcon(cuota.factura_type)}</span>
                                    <div className="text-xs font-medium text-gray-700 max-w-32 truncate" 
                                         title={cuota.factura_filename || cuota.factura_url.split('/').pop()}>
                                      {cuota.factura_filename || cuota.factura_url.split('/').pop()?.split('_').slice(-1)[0] || 'Factura'}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2 mt-0.5">
                                    {cuota.factura_size && (
                                      <span className="text-xs text-gray-500">{formatFileSize(cuota.factura_size)}</span>
                                    )}
                                    {cuota.factura_uploaded_at && (
                                      <span className="text-xs text-gray-500">• {formatUploadDate(cuota.factura_uploaded_at)}</span>
                                    )}
                                  </div>
                                </div>
                                {/* View button */}
                                <a
                                  href={cuota.factura_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center w-7 h-7 bg-brand_beige hover:bg-amber-50 rounded-lg transition-colors"
                                  title="Ver factura"
                                >
                                  <Eye className="text-brand_primary" size={14} />
                                </a>
                                {/* Download button */}
                                <a
                                  href={cuota.factura_url}
                                  download
                                  className="flex items-center justify-center w-7 h-7 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                                  title="Descargar factura"
                                >
                                  <Download className="text-brand_accent" size={14} />
                                </a>
                                {/* Delete button */}
                                <button
                                  onClick={() => handleInvoiceDelete(cuota.id)}
                                  disabled={deletingInvoice === cuota.id}
                                  className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                                    deletingInvoice === cuota.id 
                                      ? 'bg-gray-100 cursor-not-allowed' 
                                      : 'bg-red-50 hover:bg-red-100'
                                  }`}
                                  title="Eliminar factura"
                                >
                                  {deletingInvoice === cuota.id ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                                  ) : (
                                    <Trash2 className="text-red-600" size={14} />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  onChange={(e) => handleInvoiceUpload(cuota.id, e)}
                                  className="hidden"
                                />
                                <div className="flex items-center justify-center w-8 h-8 bg-brand_beige hover:bg-amber-50 rounded-lg transition-colors"
                                     title="Subir factura">
                                  {uploadingInvoice === cuota.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_primary"></div>
                                  ) : (
                                    <Upload className="text-brand_primary" size={16} />
                                  )}
                                </div>
                              </label>
                            )}
                          </div>
                        </td>
                        <td className="border border-gray-200 px-4 py-3 text-center">
                          <button
                            onClick={() => handlePaymentToggle(cuota.id, cuota.pagada || false)}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                              cuota.pagada
                                ? 'bg-amber-100 hover:bg-amber-200 text-brand_accent'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-400'
                            }`}
                            title={cuota.pagada ? 'Marcar como no pagado' : 'Marcar como pagado'}
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
              <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">Subir Contrato Firmado</h3>
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

      {/* Invoice Delete Confirmation Modal */}
      {deleteInvoiceId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="text-red-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Eliminar Factura</h3>
                  <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700">
                  ¿Está seguro de que desea eliminar esta factura?
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  La factura será eliminada permanentemente del sistema.
                </p>
              </div>
              
              <div className="flex space-x-3 justify-end">
                <button
                  onClick={() => setDeleteInvoiceId(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmInvoiceDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Eliminar Factura
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
