import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useState, useEffect } from 'react';

import { Plus, Trash2, Save, FileText, Calendar, DollarSign, Download, Building, Upload } from 'lucide-react';
import { openDocumentPreview, renderDocumentPreview } from '@/lib/contract-document';
import { toast } from 'react-hot-toast';
import { generateContractFromTemplate } from '@/lib/contract-template';
import { reconcileCuotas, attachExistingCuotaIds } from '@/lib/utils/reconcileCuotas';
import { buildClientRow } from '@/lib/contracts/client-row';
import { splitEvenly, sumsMatch, difference, decimalsFor, hasCurrencyPrecision, precisionMessage } from '@/lib/contracts/cuotas-math';
import { parseEsClDetailed } from '@/lib/money/parse-es-cl';
import { formatRut, validateRut } from '@/utils/rutValidation';
import { rutSpellings, oldestClient } from '@/lib/contracts/rut-spellings';

interface Programa {
  id: string;
  nombre: string;
  descripcion: string;
  horas_totales: number;
  modalidad: string;
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
  school_id?: number | null; // Changed to number to match schools table
  created_at?: string | null; // decides the oldest of duplicate rows (send-back 3)
}

interface School {
  id: number; // Changed from string to number
  name: string;
  code?: string | null;
  address?: string | null;
  region?: string | null;
  has_generations: boolean;
  cliente_id?: string | null;
}

interface CuotaForm {
  id?: string; // Present when editing an existing cuota row
  numero_cuota: number;
  fecha_vencimiento: string;
  monto: number; // Keep as monto in form, but save as monto_uf to database
  montoText: string; // what the admin typed, read by parseEsCl (N171)
}

interface ClienteFormState {
  nombre_legal: string;
  nombre_fantasia: string;
  rut: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  nombre_representante: string;
  rut_representante: string;
  fecha_escritura: string;
  nombre_notario: string;
  comuna_notaria: string;
  nombre_encargado_proyecto: string;
  telefono_encargado_proyecto: string;
  email_encargado_proyecto: string;
  nombre_contacto_administrativo: string;
  telefono_contacto_administrativo: string;
  email_contacto_administrativo: string;
}

interface ContractFormState {
  numero_contrato: string;
  fecha_contrato: string;
  fecha_fin: string;
  programa_id: string;
  precio_total_uf: number;
  precio_total_text: string; // what the admin typed, read by parseEsCl (N171)
  tipo_moneda: 'UF' | 'CLP';
  descripcion_manual?: string;
  cliente_id?: string;
  contrato_url?: string;
  horas_contratadas: string; // text of the «Horas contratadas» field; '' = no value (GES-2.2)
}

// Amounts are typed the Chilean way and read by lib/money/parse-es-cl.ts (N171).
// The value kept is read with room for any decimals, so that an amount with more
// decimals than its currency still reaches the decimals check (precisionMessage)
// instead of being taken as zero; the currency's own reading decides the problem.
// In a field that takes decimals (UF), a text that could mean three decimals or
// thousands («49.995», «1.200») is refused as ambiguous, never guessed (send-back 1);
// in pesos it can only be thousands («15.990» → 15990). DECIDED (lead, send-back 2):
// UF amounts: a single dot with three digits is refused; pesos: it is thousands.
const LOOSE_DECIMALS = 10;
type AmountProblem = 'precision' | 'unreadable' | 'ambiguous' | null;

const readAmount = (text: string, currency: string): { value: number; problem: AmountProblem } => {
  if (text.trim() === '') return { value: 0, problem: null };
  const currencyDecimals = decimalsFor(currency);
  const loose = parseEsClDetailed(text, { decimals: LOOSE_DECIMALS });
  if (currencyDecimals > 0 && loose.problem === 'ambiguous') return { value: 0, problem: 'ambiguous' };
  const strict = parseEsClDetailed(text, { decimals: currencyDecimals });
  if (strict.value !== null) return { value: strict.value, problem: null };
  return loose.value !== null ? { value: loose.value, problem: 'precision' } : { value: 0, problem: 'unreadable' };
};

// «Monto ambiguo»: both readings, with the person's own digits (send-back 1)
const ambiguousMessage = (text: string): string => {
  const typed = text.replace(/\s+/g, '').replace(/^(\$|UF)/i, '');
  return `Monto ambiguo: escriba ${typed.replace('.', ',')} si son decimales o ${typed.replace('.', '')} si son miles.`;
};

// The text shown for an amount the form sets itself (loaded, computed, imported):
// read back by readAmount to the same number.
const amountText = (amount: number): string => {
  if (!Number.isFinite(amount)) return '';
  const text = String(amount);
  return hasCurrencyPrecision(amount, 2) ? text : text.replace('.', ',');
};

const unreadableMessage = (target: { cuota: number } | 'total'): string => {
  const subject = target === 'total' ? 'el precio total' : `el monto de la cuota ${target.cuota}`;
  return `No se entiende ${subject}. Escríbalo con punto de miles y coma decimal, por ejemplo 1.200,50.`;
};

// A client's RUT is formatted as typed and checked with utils/rutValidation.ts (GES-3.11)
const RUT_INVALID_MESSAGE = 'El RUT del cliente no es válido. Revise los números y el dígito verificador.';
// An imported contract's new client: the escritura date is asked for, never made up (GES-3.6)
const ASK_ESCRITURA_DATE_MESSAGE = 'El PDF no indica la fecha de la escritura pública. Escríbala para crear el cliente.';

// The client fields the form may complete, named for the sentence above (send-back 3)
const CLIENT_FIELD_NAMES: Partial<Record<keyof ClienteFormState, string>> = {
  nombre_legal: 'el nombre legal',
  nombre_fantasia: 'el nombre de fantasía',
  rut: 'el RUT',
  direccion: 'la dirección',
  comuna: 'la comuna',
  ciudad: 'la ciudad',
  nombre_representante: 'el representante legal',
  nombre_contacto_administrativo: 'el nombre del contacto administrativo',
  email_contacto_administrativo: 'el email de facturación',
};

const DUPLICATE_DRAFT_NUMBER_MESSAGE = 'Ya existe un contrato con este número. Por favor use un número diferente.';

// «Horas contratadas»: optional, 0 to 999999.99, at most two decimals (GES-2.2)
const HORAS_CONTRATADAS_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;

interface LicitacionFormData {
  cliente_id: string;
  programa_id: string;
  precio_total_uf?: number | null;
  tipo_moneda?: 'UF' | 'CLP';
  fecha_adjudicacion?: string | null;
  condiciones_pago?: string | null;
  monto_minimo?: number;
  monto_maximo?: number;
}

interface ContractFormProps {
  programas: Programa[];
  clientes: Cliente[];
  editingContract?: any; // Contract being edited
  preSelectedClientId?: string;
  extractedData?: any; // Data extracted from PDF
  licitacionId?: string; // Phase 5: link from licitacion
  licitacionData?: LicitacionFormData; // Phase 5: pre-populated data from licitacion
  // Phase 5: passes new contratoId. A tender's save that reuses the tender's
  // existing contract passes `reuse` (send-back 1 of F20d); other callers ignore it.
  onSuccess: (contratoId?: string, reuse?: { reused: true; withoutCuotas: boolean }) => void;
  onCancel: () => void;
}

// The programme's hours as the field's text, or null when it has none (send-back 3)
const hoursOfProgramme = (programas: Programa[], programaId: string): string | null => {
  const programa = programas.find(p => p.id === programaId);
  return programa && programa.horas_totales != null ? String(programa.horas_totales) : null;
};

export default function ContractForm({ programas, clientes, editingContract, preSelectedClientId, extractedData, licitacionId, licitacionData, onSuccess, onCancel }: ContractFormProps) {
  const supabase = useSupabaseClient();
  // Form states
  const [loading, setLoading] = useState(false);
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  const [step, setStep] = useState<'cliente' | 'contrato' | 'cuotas'>('cliente');
  const [esManual, setEsManual] = useState(false); // New state for manual contracts
  
  // Client form
  const [selectedClienteId, setSelectedClienteId] = useState(preSelectedClientId || '');
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | ''>('');
  const [showNewSchoolForm, setShowNewSchoolForm] = useState(false);
  const [newSchoolForm, setNewSchoolForm] = useState({
    name: '',
    code: '',
    address: '',
    region: '',
    has_generations: true
  });
  const [clienteForm, setClienteForm] = useState<ClienteFormState>({
    nombre_legal: '',
    nombre_fantasia: '',
    rut: '',
    direccion: '',
    comuna: '',
    ciudad: '',
    nombre_representante: '',
    rut_representante: '',
    fecha_escritura: '',
    nombre_notario: '',
    comuna_notaria: '',
    nombre_encargado_proyecto: '',
    telefono_encargado_proyecto: '',
    email_encargado_proyecto: '',
    nombre_contacto_administrativo: '',
    telefono_contacto_administrativo: '',
    email_contacto_administrativo: ''
  });
  
  // Contract form
  const [contractForm, setContractForm] = useState<ContractFormState>({
    numero_contrato: '',
    fecha_contrato: new Date().toISOString().split('T')[0],
    fecha_fin: '',
    programa_id: '',
    precio_total_uf: 0,
    precio_total_text: '0',
    tipo_moneda: 'UF',
    descripcion_manual: '',
    cliente_id: '',
    contrato_url: '',
    horas_contratadas: ''
  });
  // Whether the edited contract already has a distribution of hours; the field is
  // locked unless the read answered 'none' (GES-2.2)
  const [hourAllocationState, setHourAllocationState] = useState<'none' | 'checking' | 'has' | 'error'>(
    editingContract ? 'checking' : 'none'
  );
  
  // Installments form
  const [cuotas, setCuotas] = useState<CuotaForm[]>([
    { numero_cuota: 1, fecha_vencimiento: '', monto: 0, montoText: '0' }
  ]);

  // Fetch schools on component mount
  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error('Error fetching schools:', error);
    }
  };

  // Handle pre-selected client
  useEffect(() => {
    if (preSelectedClientId && clientes.length > 0) {
      const selectedClient = clientes.find(c => c.id === preSelectedClientId);
      if (selectedClient) {
        setSelectedClienteId(preSelectedClientId);
        setSelectedSchoolId(selectedClient.school_id || '');
        setClienteForm({
          nombre_legal: selectedClient.nombre_legal || '',
          nombre_fantasia: selectedClient.nombre_fantasia || '',
          rut: selectedClient.rut || '',
          direccion: selectedClient.direccion || '',
          comuna: selectedClient.comuna || '',
          ciudad: selectedClient.ciudad || '',
          nombre_representante: selectedClient.nombre_representante || '',
          rut_representante: selectedClient.rut_representante || '',
          fecha_escritura: selectedClient.fecha_escritura || '',
          nombre_notario: selectedClient.nombre_notario || '',
          comuna_notaria: selectedClient.comuna_notaria || '',
          nombre_encargado_proyecto: selectedClient.nombre_encargado_proyecto || '',
          telefono_encargado_proyecto: selectedClient.telefono_encargado_proyecto || '',
          email_encargado_proyecto: selectedClient.email_encargado_proyecto || '',
          nombre_contacto_administrativo: selectedClient.nombre_contacto_administrativo || '',
          telefono_contacto_administrativo: selectedClient.telefono_contacto_administrativo || '',
          email_contacto_administrativo: selectedClient.email_contacto_administrativo || ''
        });
      }
    }
  }, [preSelectedClientId, clientes]);

  // Populate form with extracted PDF data
  useEffect(() => {
    if (extractedData) {
      // Set form to manual mode since we're importing a PDF
      setEsManual(true);
      
      // Populate contract form
      setContractForm({
        numero_contrato: extractedData.contract?.numero_contrato || '',
        fecha_contrato: extractedData.contract?.fecha_contrato || new Date().toISOString().split('T')[0],
        fecha_fin: extractedData.contract?.fecha_fin || '',
        programa_id: '', // Will be selected manually or kept empty for manual contracts
        precio_total_uf: extractedData.financial?.precio_total || 0,
        precio_total_text: amountText(extractedData.financial?.precio_total || 0),
        tipo_moneda: extractedData.financial?.moneda || 'UF',
        descripcion_manual: `Contrato importado desde PDF - ${extractedData.contract?.numero_contrato || 'Sin número'}`,
        contrato_url: extractedData.contrato_url || '',
        horas_contratadas: ''
      });
      
      // Populate client form
      // Use defaults for required fields; the escritura date is not made up (GES-3.6)
      setClienteForm({
        nombre_legal: extractedData.client?.nombre_legal || '',
        nombre_fantasia: extractedData.client?.nombre_fantasia || extractedData.client?.nombre_legal || '',
        rut: formatRut(extractedData.client?.rut || ''),
        direccion: extractedData.client?.direccion || '',
        comuna: extractedData.client?.comuna || '',
        ciudad: extractedData.client?.ciudad || '',
        nombre_representante: extractedData.client?.nombre_representante || '',
        rut_representante: extractedData.client?.rut_representante || '11.111.111-1',
        fecha_escritura: extractedData.client?.fecha_escritura || '',
        nombre_notario: extractedData.client?.nombre_notario || 'Notario Público',
        comuna_notaria: extractedData.client?.comuna_notaria || '',
        nombre_encargado_proyecto: '',
        telefono_encargado_proyecto: '',
        email_encargado_proyecto: '',
        nombre_contacto_administrativo: extractedData.client?.nombre_contacto || '',
        telefono_contacto_administrativo: '',
        email_contacto_administrativo: extractedData.client?.email_contacto || ''
      });
      
      // Populate payment schedule if available
      if (extractedData.payment_schedule && extractedData.payment_schedule.length > 0) {
        setCuotas(extractedData.payment_schedule.map((payment: any) => ({
          numero_cuota: payment.numero_cuota,
          fecha_vencimiento: payment.fecha_vencimiento,
          monto: payment.monto,
          montoText: amountText(Number(payment.monto) || 0)
        })));
      }
      
      // Check if client exists by RUT, however the stored value is written (GES-3.11)
      if (extractedData.client?.rut) {
        const spellings = rutSpellings(extractedData.client.rut);
        // The oldest such row, as every lookup by RUT chooses it (send-back 3)
        const existingClient = oldestClient(clientes.filter(c => spellings.includes(c.rut)));
        if (existingClient) {
          setSelectedClienteId(existingClient.id);
          // Update form with existing client data
          setClienteForm({
            nombre_legal: existingClient.nombre_legal || '',
            nombre_fantasia: existingClient.nombre_fantasia || '',
            rut: existingClient.rut || '',
            direccion: existingClient.direccion || '',
            comuna: existingClient.comuna || '',
            ciudad: existingClient.ciudad || '',
            nombre_representante: existingClient.nombre_representante || '',
            rut_representante: existingClient.rut_representante || '',
            fecha_escritura: existingClient.fecha_escritura || '',
            nombre_notario: existingClient.nombre_notario || '',
            comuna_notaria: existingClient.comuna_notaria || '',
            nombre_encargado_proyecto: existingClient.nombre_encargado_proyecto || '',
            telefono_encargado_proyecto: existingClient.telefono_encargado_proyecto || '',
            email_encargado_proyecto: existingClient.email_encargado_proyecto || '',
            nombre_contacto_administrativo: existingClient.nombre_contacto_administrativo || '',
            telefono_contacto_administrativo: existingClient.telefono_contacto_administrativo || '',
            email_contacto_administrativo: existingClient.email_contacto_administrativo || ''
          });
        }
      }
    }
  }, [extractedData, clientes]);

  // Populate form when editing
  useEffect(() => {
    if (editingContract) {
      // Populate client form
      setClienteForm({
        nombre_legal: editingContract.clientes.nombre_legal || '',
        nombre_fantasia: editingContract.clientes.nombre_fantasia || '',
        rut: editingContract.clientes.rut || '',
        direccion: editingContract.clientes.direccion || '',
        comuna: editingContract.clientes.comuna || '',
        ciudad: editingContract.clientes.ciudad || '',
        nombre_representante: editingContract.clientes.nombre_representante || '',
        rut_representante: editingContract.clientes.rut_representante || '',
        fecha_escritura: editingContract.clientes.fecha_escritura || '',
        nombre_notario: editingContract.clientes.nombre_notario || '',
        comuna_notaria: editingContract.clientes.comuna_notaria || '',
        nombre_encargado_proyecto: editingContract.clientes.nombre_encargado_proyecto || '',
        telefono_encargado_proyecto: editingContract.clientes.telefono_encargado_proyecto || '',
        email_encargado_proyecto: editingContract.clientes.email_encargado_proyecto || '',
        nombre_contacto_administrativo: editingContract.clientes.nombre_contacto_administrativo || '',
        telefono_contacto_administrativo: editingContract.clientes.telefono_contacto_administrativo || '',
        email_contacto_administrativo: editingContract.clientes.email_contacto_administrativo || ''
      });
      
      // Populate contract form
      setContractForm({
        numero_contrato: editingContract.numero_contrato || '',
        fecha_contrato: editingContract.fecha_contrato || '',
        fecha_fin: editingContract.fecha_fin || '',
        programa_id: editingContract.programa_id || '',
        precio_total_uf: editingContract.precio_total_uf || 0,
        precio_total_text: amountText(editingContract.precio_total_uf || 0),
        tipo_moneda: editingContract.tipo_moneda || 'UF',
        descripcion_manual: editingContract.descripcion_manual || '',
        cliente_id: editingContract.cliente_id || '',
        contrato_url: editingContract.contrato_url || '',
        horas_contratadas: editingContract.horas_contratadas != null ? String(editingContract.horas_contratadas) : ''
      });
      
      // Set selected client
      setSelectedClienteId(editingContract.cliente_id || '');
      // Keep the client's school link on save (GES-3.1)
      setSelectedSchoolId(editingContract.clientes?.school_id ?? '');
      // A manual or imported contract opens as manual (GES-2.8)
      setEsManual(!!editingContract.es_manual);
      
      // Populate installments
      if (editingContract.cuotas && editingContract.cuotas.length > 0) {
        const cuotasData = editingContract.cuotas.map((cuota: any) => ({
          id: cuota.id,
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento,
          monto: cuota.monto_uf || 0,
          montoText: amountText(cuota.monto_uf || 0)
        }));
        setCuotas(cuotasData);
      }
    }
  }, [editingContract]);

  // Populate form from licitacion data (Phase 5)
  useEffect(() => {
    if (!licitacionData || editingContract) return;

    // Pre-populate contract form fields from licitacion
    setContractForm(prev => ({
      ...prev,
      precio_total_uf: licitacionData.precio_total_uf ?? prev.precio_total_uf,
      precio_total_text: licitacionData.precio_total_uf != null ? amountText(licitacionData.precio_total_uf) : prev.precio_total_text,
      tipo_moneda: licitacionData.tipo_moneda ?? prev.tipo_moneda,
      fecha_contrato: licitacionData.fecha_adjudicacion ?? prev.fecha_contrato,
      programa_id: licitacionData.programa_id ?? prev.programa_id,
    }));

    // Pre-select client (non-editable when from licitacion)
    if (licitacionData.cliente_id) {
      const selectedCliente = clientes.find(c => c.id === licitacionData.cliente_id);
      if (selectedCliente) {
        setSelectedClienteId(licitacionData.cliente_id);
        setSelectedSchoolId(selectedCliente.school_id || '');
        setClienteForm({
          nombre_legal: selectedCliente.nombre_legal || '',
          nombre_fantasia: selectedCliente.nombre_fantasia || '',
          rut: selectedCliente.rut || '',
          direccion: selectedCliente.direccion || '',
          comuna: selectedCliente.comuna || '',
          ciudad: selectedCliente.ciudad || '',
          nombre_representante: selectedCliente.nombre_representante || '',
          rut_representante: selectedCliente.rut_representante || '',
          fecha_escritura: selectedCliente.fecha_escritura || '',
          nombre_notario: selectedCliente.nombre_notario || '',
          comuna_notaria: selectedCliente.comuna_notaria || '',
          nombre_encargado_proyecto: selectedCliente.nombre_encargado_proyecto || '',
          telefono_encargado_proyecto: selectedCliente.telefono_encargado_proyecto || '',
          email_encargado_proyecto: selectedCliente.email_encargado_proyecto || '',
          nombre_contacto_administrativo: selectedCliente.nombre_contacto_administrativo || '',
          telefono_contacto_administrativo: selectedCliente.telefono_contacto_administrativo || '',
          email_contacto_administrativo: selectedCliente.email_contacto_administrativo || '',
        });
      }
    }

    // Price warning: if precio_total_uf is outside monto_minimo/monto_maximo range
    if (
      licitacionData.precio_total_uf != null &&
      licitacionData.monto_minimo != null &&
      licitacionData.monto_maximo != null
    ) {
      const precio = licitacionData.precio_total_uf;
      const min = licitacionData.monto_minimo;
      const max = licitacionData.monto_maximo;
      if (precio < min || precio > max) {
        toast(
          `Advertencia: el precio adjudicado (${precio} ${licitacionData.tipo_moneda || 'UF'}) esta fuera del rango de la licitacion (${min}–${max} ${licitacionData.tipo_moneda || 'UF'})`,
          { icon: '⚠️', duration: 6000 }
        );
      }
    }
  }, [licitacionData, clientes, editingContract]);

  // «Horas contratadas» rule (send-back 3, no memory): choosing a programme gives the
  // field that programme's hours, whatever it held; a programme without hours (or no
  // programme) leaves it as it is. Loading a contract never fills it; a locked field
  // never changes. The licitación's programme of a NEW contract counts as a choice;
  // it is applied once the programmes are known (they arrive from the page).
  const licitacionProgramaId = licitacionData?.programa_id;
  useEffect(() => {
    if (!licitacionProgramaId || editingContract) return;
    const horas = hoursOfProgramme(programas, licitacionProgramaId);
    if (horas !== null) setContractForm(prev => ({ ...prev, horas_contratadas: horas }));
  }, [licitacionProgramaId, programas, editingContract]);

  // Whether a contract already has a distribution of hours: its total must equal
  // horas_contratadas, so the column is then not written. Used by edit mode and by
  // the draft path when it updates a draft found by its number (send-back 1).
  const readHourAllocationState = async (contratoId: string): Promise<'none' | 'has' | 'error'> => {
    const { data, error } = await supabase
      .from('contract_hour_allocations')
      .select('id')
      .eq('contrato_id', contratoId)
      .limit(1);
    if (error) {
      console.error('Error reading contract hour allocations:', error);
      return 'error';
    }
    return data && data.length > 0 ? 'has' : 'none';
  };

  // In edit mode, read once whether the contract already has a distribution of
  // hours: its total must equal horas_contratadas, so the field is then locked.
  useEffect(() => {
    const contratoId = editingContract?.id;
    if (!contratoId) {
      setHourAllocationState('none');
      return;
    }
    let cancelled = false;
    setHourAllocationState('checking');
    (async () => {
      const state = await readHourAllocationState(contratoId);
      if (cancelled) return;
      setHourAllocationState(state);
    })();
    return () => {
      cancelled = true;
    };
  }, [editingContract?.id]);

  // Generate contract number automatically
  useEffect(() => {
    if (!editingContract) { // Only generate for new contracts
      const generateContractNumber = () => {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      setContractForm(prev => ({
        ...prev,
        numero_contrato: `FNE-${year}-${month}-${random}`
      }));
    };
    
    generateContractNumber();
    }
  }, [editingContract]);

  // A new contract for an EXISTING client shows the client's data read-only:
  // the contract prints the stored client, and saving corrections from here would
  // silently change every other contract of that client (GES-3.10). Corrections go
  // through Clientes. Editing a contract keeps its client fields editable, as before.
  const clientReadOnly = !editingContract && !!selectedClienteId;
  // Send-back 2: a field this form REQUIRES to go on (isStepValid, step 'cliente')
  // that the stored client has EMPTY stays editable; on save only those fields are
  // written to the client, each only where it is still empty (fillMissingClientFields).
  const requiredClientFields: Array<keyof ClienteFormState> = esManual
    ? ['nombre_legal', 'rut', 'nombre_contacto_administrativo', 'email_contacto_administrativo']
    : ['nombre_legal', 'nombre_fantasia', 'rut', 'direccion', 'comuna', 'ciudad', 'nombre_representante'];
  const storedCliente = clientReadOnly ? clientes.find(c => c.id === selectedClienteId) : undefined;
  const clientFieldFillable = (field: keyof ClienteFormState): boolean => {
    if (!clientReadOnly || !requiredClientFields.includes(field)) return false;
    const stored = storedCliente?.[field as keyof Cliente];
    return stored == null || String(stored).trim() === '';
  };
  const fillableClientFields = requiredClientFields.filter(clientFieldFillable);
  const clientFieldReadOnly = (field: keyof ClienteFormState): boolean => clientReadOnly && !clientFieldFillable(field);
  const editCliente = (field: keyof ClienteFormState, value: string) => {
    if (clientFieldReadOnly(field)) return;
    setClienteForm(prev => ({ ...prev, [field]: value }));
  };
  // Writes the filled fields into the existing client's row. Each write is
  // conditional on the EXACT stored value the form read (null, '' or spaces), so a
  // value another admin stored meanwhile is never overwritten (send-back 3). Never
  // throws: returns the fields that were not written (no row changed, or an error),
  // for the sentence shown after the contract is saved.
  const fillMissingClientFields = async (clienteId: string): Promise<Array<keyof ClienteFormState>> => {
    const notWritten: Array<keyof ClienteFormState> = [];
    for (const field of fillableClientFields) {
      const value = (clienteForm[field] || '').trim();
      if (!value) continue;
      const stored = storedCliente?.[field as keyof Cliente];
      const update = supabase
        .from('clientes')
        .update({ [field]: field === 'rut' ? formatRut(value) : value })
        .eq('id', clienteId);
      const conditional = stored == null ? update.is(field, null) : update.eq(field, String(stored));
      try {
        const { data, error } = await conditional.select('id');
        const changed = Array.isArray(data) ? data.length > 0 : !!data;
        if (error || !changed) notWritten.push(field);
      } catch (fillError) {
        console.error('Error completing client field:', fillError);
        notWritten.push(field);
      }
    }
    return notWritten;
  };
  // «El contrato se guardó, pero no se pudo completar … en la ficha del cliente.»
  const tellFieldsNotWritten = (fields: Array<keyof ClienteFormState>) => {
    if (fields.length === 0) return;
    const names = fields.map(f => CLIENT_FIELD_NAMES[f] ?? f);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    toast.error(`El contrato se guardó, pero no se pudo completar ${list} en la ficha del cliente. Corríjalo en Clientes.`);
  };

  // The client RUT is checked wherever it is written from this form: a new
  // client, or a changed RUT when editing (an unchanged stored RUT is left alone)
  const rutIsWritten = clientFieldFillable('rut') || !clientReadOnly && (!editingContract || clienteForm.rut !== (editingContract.clientes?.rut || ''));
  const rutInvalid = rutIsWritten && clienteForm.rut.trim() !== '' && !validateRut(clienteForm.rut);
  // An imported contract with a new client and no escritura date: asked for (GES-3.6)
  const importedNewClient = !!extractedData && !editingContract && !selectedClienteId;
  const escrituraDateMissing = importedNewClient && !clienteForm.fecha_escritura;

  // Handle client selection
  const handleClienteSelection = (clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (cliente) {
      setSelectedSchoolId(cliente.school_id || '');
      setClienteForm({
        nombre_legal: cliente.nombre_legal,
        nombre_fantasia: cliente.nombre_fantasia,
        rut: cliente.rut,
        direccion: cliente.direccion,
        comuna: cliente.comuna || '',
        ciudad: cliente.ciudad || '',
        nombre_representante: cliente.nombre_representante,
        rut_representante: cliente.rut_representante || '',
        fecha_escritura: cliente.fecha_escritura || '',
        nombre_notario: cliente.nombre_notario || '',
        comuna_notaria: cliente.comuna_notaria || '',
        nombre_encargado_proyecto: cliente.nombre_encargado_proyecto || '',
        telefono_encargado_proyecto: cliente.telefono_encargado_proyecto || '',
        email_encargado_proyecto: cliente.email_encargado_proyecto || '',
        nombre_contacto_administrativo: cliente.nombre_contacto_administrativo || '',
        telefono_contacto_administrativo: cliente.telefono_contacto_administrativo || '',
        email_contacto_administrativo: cliente.email_contacto_administrativo || ''
      });
    }
    setSelectedClienteId(clienteId);
  };

  // Calculate installments automatically
  const calculateCuotas = () => {
    const totalAmount = contractForm.precio_total_uf;
    const numCuotas = cuotas.length;
    
    if (totalAmount > 0 && numCuotas > 0) {
      // Whole hundredths (UF) or whole pesos (CLP); the last cuota takes the remainder (GES-2.7).
      const amounts = splitEvenly(totalAmount, numCuotas, decimalsFor(contractForm.tipo_moneda));
      const updatedCuotas = cuotas.map((cuota, index) => ({
        ...cuota,
        monto: amounts[index],
        montoText: amountText(amounts[index])
      }));
      setCuotas(updatedCuotas);
    }
  };

  // Add new installment
  const addCuota = () => {
    if (cuotas.length < 12) {
      setCuotas([...cuotas, {
        numero_cuota: cuotas.length + 1,
        fecha_vencimiento: '',
        monto: 0,
        montoText: '0'
      }]);
    }
  };

  // Remove installment
  const removeCuota = (index: number) => {
    if (cuotas.length > 1) {
      const updatedCuotas = cuotas
        .filter((_, i) => i !== index)
        .map((cuota, i) => ({ ...cuota, numero_cuota: i + 1 }));
      setCuotas(updatedCuotas);
    }
  };

  // Update installment
  const updateCuota = (index: number, field: keyof CuotaForm, value: string | number) => {
    const updatedCuotas = [...cuotas];
    updatedCuotas[index] = { ...updatedCuotas[index], [field]: value };
    setCuotas(updatedCuotas);
  };

  // A cuota's amount as typed: the text is kept, the number is read from it (N171)
  const updateCuotaAmount = (index: number, text: string) => {
    const updatedCuotas = [...cuotas];
    updatedCuotas[index] = { ...updatedCuotas[index], montoText: text, monto: readAmount(text, contractForm.tipo_moneda).value };
    setCuotas(updatedCuotas);
  };

  // A typed amount's reading depends on the currency («49.995» is ambiguous in UF,
  // thousands in pesos): changing it reads every typed amount again (send-back 1)
  const changeCurrency = (tipo_moneda: 'UF' | 'CLP') => {
    setContractForm({
      ...contractForm,
      tipo_moneda,
      precio_total_uf: readAmount(contractForm.precio_total_text, tipo_moneda).value
    });
    setCuotas(cuotas.map(c => ({ ...c, monto: readAmount(c.montoText, tipo_moneda).value })));
  };

  // Create new school
  const handleCreateSchool = async () => {
    if (!newSchoolForm.name.trim()) {
      toast.error('El nombre de la escuela es requerido');
      return;
    }

    try {
      setLoading(true);
      
      // Get the current user's token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No authenticated session');
      }

      const response = await fetch('/api/admin/schools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(newSchoolForm)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error creating school');
      }

      const newSchool = await response.json();
      
      // Update schools list
      await fetchSchools();
      
      // Select the newly created school
      setSelectedSchoolId(newSchool.id);
      
      // Pre-fill client form with school data (not over an existing client's read-only data, GES-3.10)
      if (!clientReadOnly) {
        setClienteForm(prev => ({
          ...prev,
          nombre_fantasia: newSchool.name,
          direccion: newSchool.address || prev.direccion,
          ciudad: newSchool.region || prev.ciudad
        }));
      }
      
      setShowNewSchoolForm(false);
      setNewSchoolForm({
        name: '',
        code: '',
        address: '',
        region: '',
        has_generations: true
      });
      
      toast.success('Escuela creada exitosamente');
    } catch (error) {
      console.error('Error creating school:', error);
      toast.error('Error al crear la escuela: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // «Horas contratadas»: validity, locked state and the value to save (GES-2.2)
  const horasText = contractForm.horas_contratadas.trim();
  const horasValid = horasText === '' || HORAS_CONTRATADAS_PATTERN.test(horasText);
  const horasReadOnly = hourAllocationState !== 'none';
  const horasToSave = horasText === '' || !horasValid ? null : Number(horasText);

  // What is wrong with a typed amount under the chosen currency, if anything (N171)
  function amountProblemOf(text: string, value: number): AmountProblem {
    const { problem } = readAmount(text, contractForm.tipo_moneda);
    if (problem) return problem;
    return hasCurrencyPrecision(value, decimalsFor(contractForm.tipo_moneda)) ? null : 'precision';
  }
  function cuotaProblem(cuota: CuotaForm): AmountProblem {
    return amountProblemOf(cuota.montoText, cuota.monto);
  }
  function totalAmountProblem(): AmountProblem {
    return amountProblemOf(contractForm.precio_total_text, contractForm.precio_total_uf);
  }

  // Row for a brand-new client: only clientes columns (buildClientRow, GES-2.1),
  // with the defaults the database still needs for its obligatory legal columns.
  const newClientRow = () => {
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
    return {
      ...buildClientRow(clienteForm, selectedSchoolId),
      rut: formatRut(clienteForm.rut), // the product's format (GES-3.11)
      // Required fields with defaults
      nombre_fantasia: clienteForm.nombre_fantasia || clienteForm.nombre_legal, // Use legal name if no fantasy name
      rut_representante: clienteForm.rut_representante || '11.111.111-1', // Default RUT if not provided
      // An imported contract's date is never made up: the form asks for it (GES-3.6)
      fecha_escritura: extractedData ? (clienteForm.fecha_escritura || null) : (clienteForm.fecha_escritura || today),
      nombre_notario: clienteForm.nombre_notario || 'Notario Público', // Default notary name
      // Optional fields can be null
      comuna_notaria: clienteForm.comuna_notaria || null,
      nombre_encargado_proyecto: clienteForm.nombre_encargado_proyecto || null,
      telefono_encargado_proyecto: clienteForm.telefono_encargado_proyecto || null,
      email_encargado_proyecto: clienteForm.email_encargado_proyecto || null,
      nombre_contacto_administrativo: clienteForm.nombre_contacto_administrativo || null,
      telefono_contacto_administrativo: clienteForm.telefono_contacto_administrativo || null,
      email_contacto_administrativo: clienteForm.email_contacto_administrativo || null
    };
  };

  // «Guardar Borrador» only for a new contract or a draft: it writes estado
  // 'borrador', which would take any other contract out of its state (GES-3.8)
  const canSaveAsDraft = !editingContract || editingContract.estado === 'borrador';

  // Save contract as draft
  const handleSaveAsDraft = async () => {
    if (!canSaveAsDraft) return;
    try {
      setSavingAsDraft(true);
      
      if (rutInvalid) {
        toast.error(RUT_INVALID_MESSAGE);
        return;
      }
      if (escrituraDateMissing) {
        toast.error(ASK_ESCRITURA_DATE_MESSAGE);
        return;
      }

      // Validate minimum required fields for draft
      if (!contractForm.numero_contrato) {
        toast.error('Por favor ingrese un número de contrato antes de guardar como borrador.');
        setSavingAsDraft(false);
        return;
      }
      
      // Check the schedule before ANY write: a draft is saved whole or not at all (GES-2.6)
      for (const cuota of cuotas) {
        if (!cuota.fecha_vencimiento) {
          toast.error(`La cuota ${cuota.numero_cuota} necesita una fecha de vencimiento para guardar el borrador.`);
          return;
        }
        if (!(cuota.monto > 0) && !cuotaProblem(cuota)) {
          toast.error(`La cuota ${cuota.numero_cuota} necesita un monto mayor que cero para guardar el borrador.`);
          return;
        }
      }
      if (amountPrecisionError) {
        toast.error(amountPrecisionError);
        return;
      }
      
      // Get or create clienteId
      let clienteId = selectedClienteId || contractForm.cliente_id;
      
      if (!clienteId && (clienteForm.rut || clienteForm.nombre_legal)) {
        // Check if client exists
        if (clienteForm.rut) {
          const { data: matchingClientes } = await supabase
            .from('clientes')
            .select('id, created_at')
            // however the stored RUT is written; the oldest such client (GES-3.11, send-back 3)
            .in('rut', rutSpellings(clienteForm.rut))
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          const existingCliente = oldestClient(matchingClientes as Array<{ id: string; created_at?: string | null }> | null);

          if (existingCliente) {
            clienteId = existingCliente.id;
          }
        }
        
        if (!clienteId) {
          // The same complete row as the full save (buildClientRow + defaults)
          const { data: newCliente, error: clienteError } = await supabase
            .from('clientes')
            .insert([newClientRow()])
            .select()
            .single();
            
          if (clienteError) {
            // Stop here: without its client nothing of the draft is written
            console.error('Error creating client for draft:', clienteError);
            toast.error('No se pudo guardar el cliente del borrador. Revise sus datos e inténtelo de nuevo.');
            return;
          }
          clienteId = newCliente.id;
        }
      }
      
      // The client's missing fields are filled BEFORE the contract row is written, so
      // whatever reads the client at insertion (the representative's snapshot trigger)
      // sees them (send-back 4). A fill never stops the save: what could not be written
      // is told after the contract is saved. If the contract write then fails, the
      // client keeps the filled fields: they are true data about the client.
      const draftNotWritten = clienteId && clientReadOnly && clienteId === selectedClienteId
        ? await fillMissingClientFields(clienteId)
        : [];

      // Prepare contract data (allow incomplete data for draft)
      const contractData: any = {
        numero_contrato: contractForm.numero_contrato,
        estado: 'borrador',
        es_manual: esManual
      };
      
      // Add optional fields if they exist
      if (contractForm.fecha_contrato) contractData.fecha_contrato = contractForm.fecha_contrato;
      if (contractForm.fecha_fin) contractData.fecha_fin = contractForm.fecha_fin;
      if (clienteId) contractData.cliente_id = clienteId;
      if (!esManual && contractForm.programa_id) contractData.programa_id = contractForm.programa_id;
      if (contractForm.precio_total_uf) contractData.precio_total_uf = contractForm.precio_total_uf;
      if (contractForm.tipo_moneda) contractData.tipo_moneda = contractForm.tipo_moneda;
      if (esManual && contractForm.descripcion_manual) contractData.descripcion_manual = contractForm.descripcion_manual;
      if (contractForm.contrato_url) contractData.contrato_url = contractForm.contrato_url;
      if (!horasReadOnly) contractData.horas_contratadas = horasToSave;
      
      let contractId;
      
      // Check if we're updating an existing draft or contract
      if (editingContract) {
        // Update existing contract to draft status
        const { data: updatedContract, error } = await supabase
          .from('contratos')
          .update(contractData)
          .eq('id', editingContract.id)
          .select()
          .single();
          
        if (error) throw error;
        contractId = updatedContract.id;
      } else {
        // Check if a draft already exists with this number
        const { data: existingDraft } = await supabase
          .from('contratos')
          .select('id')
          .eq('numero_contrato', contractForm.numero_contrato)
          .eq('estado', 'borrador')
          .single();
          
        if (existingDraft) {
          // Update existing draft. Do not overwrite hours already distributed: if
          // the row has allocations, or the read fails, the column is not sent.
          if ((await readHourAllocationState(existingDraft.id)) !== 'none') {
            delete contractData.horas_contratadas;
          }
          const { data: updatedContract, error } = await supabase
            .from('contratos')
            .update(contractData)
            .eq('id', existingDraft.id)
            .select()
            .single();
            
          if (error) throw error;
          contractId = updatedContract.id;
        } else {
          // Create new draft
          const { data: newContract, error } = await supabase
            .from('contratos')
            .insert([contractData])
            .select()
            .single();
            
          if (error) {
            if (error.message.includes('duplicate key')) {
              throw new Error(DUPLICATE_DRAFT_NUMBER_MESSAGE);
            }
            throw error;
          }
          contractId = newContract.id;
        }
      }
      
      // Save payment schedule if exists
      if (cuotas.length > 0 && contractId) {
        // A brand-new form can be saved over a pre-existing draft (matched by
        // numero_contrato above); in that case every form row lacks a cuota id, so
        // without hydration reconcileCuotas would delete the draft's cuotas and
        // re-insert — wiping any uploaded facturas/pagada (#3B1191D3). When the whole
        // schedule is id-less, pull the existing rows and match ids by numero_cuota
        // so they update in place. Edit mode already carries ids and is left as-is.
        let cuotasToSave = cuotas;
        if (cuotas.every(c => !c.id)) {
          const { data: existingCuotas, error: existingCuotasError } = await supabase
            .from('cuotas')
            .select('id, numero_cuota')
            .eq('contrato_id', contractId);
          // Must not silently continue: a failed lookup would leave the schedule
          // id-less and let reconcileCuotas delete the draft's cuotas, orphaning facturas.
          if (existingCuotasError) throw existingCuotasError;
          if (existingCuotas && existingCuotas.length > 0) {
            cuotasToSave = attachExistingCuotaIds(cuotas, existingCuotas);
          }
        }

        // Let failures propagate to the outer catch: a partial schedule write must
        // surface an error and skip the success path, not be silently swallowed.
        await reconcileCuotas(
          supabase,
          contractId,
          cuotasToSave.map(c => ({
            id: c.id,
            numero_cuota: c.numero_cuota,
            fecha_vencimiento: c.fecha_vencimiento,
            monto_uf: c.monto,
          }))
        );
      }
      
      toast.success('✅ Contrato guardado como borrador. Puede continuar editándolo más tarde desde la lista de contratos.');
      tellFieldsNotWritten(draftNotWritten);
      onSuccess(contractId);
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error(
        error?.message === DUPLICATE_DRAFT_NUMBER_MESSAGE
          ? DUPLICATE_DRAFT_NUMBER_MESSAGE
          : 'No se pudo guardar el borrador. Inténtelo de nuevo.'
      );
    } finally {
      setSavingAsDraft(false);
    }
  };

  // Save contract
  const handleSaveContract = async () => {
    setLoading(true);
    try {
      let clienteId = selectedClienteId;
      
      if (editingContract) {
        // EDITING MODE
        
        // Update client data with school_id
        const clientUpdateData = buildClientRow(clienteForm, selectedSchoolId);
        
        const { error: clienteError } = await supabase
          .from('clientes')
          .update(clientUpdateData)
          .eq('id', editingContract.cliente_id);
          
        if (clienteError) throw clienteError;
        clienteId = editingContract.cliente_id;
        
        // Update school link if changed
        if (selectedSchoolId) {
          const { error: schoolUpdateError } = await supabase
            .from('schools')
            .update({ cliente_id: editingContract.cliente_id })
            .eq('id', selectedSchoolId);
            
          if (schoolUpdateError) {
            console.error('Error updating school link:', schoolUpdateError);
          }
        }
        
        // Update contract
        const { error: contratoError } = await supabase
          .from('contratos')
          .update({
            numero_contrato: contractForm.numero_contrato,
            fecha_contrato: contractForm.fecha_contrato,
            fecha_fin: contractForm.fecha_fin,
            programa_id: esManual ? null : contractForm.programa_id,
            precio_total_uf: contractForm.precio_total_uf,
            tipo_moneda: contractForm.tipo_moneda,
            es_manual: esManual,
            descripcion_manual: esManual ? contractForm.descripcion_manual : null,
            // Not sent once the contract has a distribution of hours (GES-2.2)
            ...(horasReadOnly ? {} : { horas_contratadas: horasToSave }),
            // Preserve/refresh the imported source PDF URL without nulling it on edit.
            ...(contractForm.contrato_url ? { contrato_url: contractForm.contrato_url } : {}),
            // A full save runs only on a validated form (isStepValid), so it
            // promotes a draft to pendiente — otherwise drafts stay borrador
            // forever and can never be activated.
            ...(editingContract.estado === 'borrador' ? { estado: 'pendiente' } : {})
          })
          .eq('id', editingContract.id);

        if (contratoError) throw contratoError;

        await reconcileCuotas(
          supabase,
          editingContract.id,
          cuotas.map(cuota => ({
            id: cuota.id,
            numero_cuota: cuota.numero_cuota,
            fecha_vencimiento: cuota.fecha_vencimiento,
            monto_uf: cuota.monto,
          }))
        );
        
      } else {
        // CREATE MODE

        // A tender has at most one contract (LIC-D5): if one with this
        // licitacion_id already exists, insert nothing and hand its id to the
        // parent, which links it (the link is idempotent for the same contract).
        // Which one: the contract the tender is already linked to; otherwise the
        // oldest by created_at, then by id, so equal times always pick the same.
        // The parent is told it was reused, and whether it lacks cuotas while the
        // form holds some (send-back 1).
        if (licitacionId) {
          const { data: tenderContracts, error: tenderLookupError } = await supabase
            .from('contratos')
            .select('id, created_at')
            .eq('licitacion_id', licitacionId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          if (tenderLookupError) throw tenderLookupError;
          const found = ((tenderContracts ?? []) as Array<{ id: string; created_at: string | null }>).filter(c => !!c.id);
          if (found.length > 0) {
            const { data: tender, error: tenderError } = await supabase
              .from('licitaciones')
              .select('contrato_id')
              .eq('id', licitacionId)
              .maybeSingle();
            if (tenderError) throw tenderError;
            const byAge = [...found].sort((a, b) => {
              const ta = a.created_at ?? '';
              const tb = b.created_at ?? '';
              if (ta !== tb) return ta < tb ? -1 : 1;
              return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
            });
            const linkedId = (tender as { contrato_id?: string | null } | null)?.contrato_id;
            const chosen = byAge.find(c => c.id === linkedId) ?? byAge[0];
            let withoutCuotas = false;
            if (cuotas.length > 0) {
              const { data: existingCuotas, error: cuotasReadError } = await supabase
                .from('cuotas')
                .select('id')
                .eq('contrato_id', chosen.id)
                .limit(1);
              if (cuotasReadError) throw cuotasReadError;
              withoutCuotas = !existingCuotas || existingCuotas.length === 0;
            }
            onSuccess(chosen.id, { reused: true, withoutCuotas });
            return;
          }
        }

        // First, save or update client
        if (!selectedClienteId) {
          // Prepare client data with school_id if selected (defaults applied by newClientRow)
          const clientData = newClientRow();
          
          // Check if client with this RUT already exists
          const { data: matchingClientes, error: checkError } = await supabase
            .from('clientes')
            .select('*')
            // however the stored RUT is written; the oldest such client (GES-3.11, send-back 3)
            .in('rut', rutSpellings(clienteForm.rut))
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
          const existingCliente = oldestClient(matchingClientes as Cliente[] | null);
            
          if (checkError && checkError.code !== 'PGRST116') {
            // PGRST116 means no rows found, which is expected for new clients
            throw checkError;
          }
          
          if (existingCliente) {
            // Client already exists - show warning
            const confirmMessage = `⚠️ Ya existe un cliente con el RUT ${clienteForm.rut}:\n\n` +
              `Nombre: ${existingCliente.nombre_legal}\n` +
              `Nombre Fantasía: ${existingCliente.nombre_fantasia}\n` +
              `Ciudad: ${existingCliente.ciudad}\n` +
              `Representante: ${existingCliente.nombre_representante}\n\n` +
              `¿Deseas usar este cliente existente para el contrato?\n\n` +
              `• SÍ: Usará el cliente existente\n` +
              `• NO: Verifica el RUT y corrige los datos`;
            
            if (confirm(confirmMessage)) {
              // User confirmed to use existing client
              clienteId = existingCliente.id;
            } else {
              // User canceled - stop the creation process
              toast.error('Creación de contrato cancelada. Por favor verifica el RUT del cliente.');
              setLoading(false);
              return;
            }
          } else {
            // Create new client
            const { data: newCliente, error: clienteError } = await supabase
              .from('clientes')
              .insert([clientData])
              .select()
              .single();
              
            if (clienteError) throw clienteError;
            clienteId = newCliente.id;
            
            // If a school was selected, update the school with the client reference
            if (selectedSchoolId && newCliente.id) {
              const { error: schoolUpdateError } = await supabase
                .from('schools')
                .update({ cliente_id: newCliente.id })
                .eq('id', selectedSchoolId);
                
              if (schoolUpdateError) {
                console.error('Error linking school to client:', schoolUpdateError);
                // Non-critical error, continue with contract creation
              }
            }
          }
        }

        // Check if contract number already exists
        const { data: existingContract } = await supabase
          .from('contratos')
          .select('id')
          .eq('numero_contrato', contractForm.numero_contrato)
          .single();

        if (existingContract) {
          throw new Error(`El número de contrato "${contractForm.numero_contrato}" ya existe. Por favor, use un número diferente.`);
        }

        // Validate clienteId before saving contract
        if (!clienteId) {
          throw new Error('Error: No se pudo determinar el ID del cliente. Por favor, seleccione o cree un cliente válido.');
        }


        // The client's missing fields are filled BEFORE the contract row is written, so
        // whatever reads the client at insertion (the representative's snapshot trigger)
        // sees them (send-back 4). A fill never stops the save: what could not be written
        // is told after the contract is saved. If the contract write then fails, the
        // client keeps the filled fields: they are true data about the client.
        const fullSaveNotWritten = selectedClienteId && clientReadOnly
          ? await fillMissingClientFields(selectedClienteId)
          : [];

        // Save contract (ensure empty date strings become null)
        const newContratoPayload: Record<string, unknown> = {
          numero_contrato: contractForm.numero_contrato,
          // Explicit estado: without it the DB default 'vigente' applies — a
          // value the app's status model doesn't use.
          estado: 'pendiente',
          fecha_contrato: contractForm.fecha_contrato || null,
          fecha_fin: contractForm.fecha_fin || null,
          cliente_id: clienteId,
          programa_id: esManual ? null : contractForm.programa_id, // NULL for manual contracts
          precio_total_uf: contractForm.precio_total_uf,
          tipo_moneda: contractForm.tipo_moneda,
          es_manual: esManual,
          descripcion_manual: esManual ? contractForm.descripcion_manual : null,
          horas_contratadas: horasToSave,
        };
        // Phase 5: include licitacion_id if creating from licitacion
        if (licitacionId) {
          newContratoPayload.licitacion_id = licitacionId;
        }
        // Persist the imported source PDF URL (set by the "Importar PDF" flow).
        if (contractForm.contrato_url) {
          newContratoPayload.contrato_url = contractForm.contrato_url;
        }
        const { data: newContrato, error: contratoError } = await supabase
          .from('contratos')
          .insert([newContratoPayload])
          .select()
          .single();

        if (contratoError) {
          console.error('Contract insertion error:', contratoError);
          if (contratoError.message.includes('contratos_cliente_id_fkey')) {
            throw new Error(`Error: El cliente seleccionado no existe en la base de datos. Por favor, cree un nuevo cliente o seleccione uno existente.`);
          }
          throw contratoError;
        }

        // Save installments
        const cuotasData = cuotas.map(cuota => ({
          contrato_id: newContrato.id,
          numero_cuota: cuota.numero_cuota,
          fecha_vencimiento: cuota.fecha_vencimiento || null,
          monto_uf: cuota.monto,
          pagada: false
        }));

        const { error: cuotasError } = await supabase
          .from('cuotas')
          .insert(cuotasData);

        if (cuotasError) throw cuotasError;

        // Told only now that the contract is saved (send-back 3, 4)
        tellFieldsNotWritten(fullSaveNotWritten);

        // Phase 5: pass the new contrato ID to parent
        onSuccess(newContrato?.id);
        return; // Early return to avoid double-calling onSuccess below
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving contract:', error);
      toast.error('Error al guardar el contrato: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date for display - parse manually to avoid timezone issues
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

  // Generate PDF using contract-template.ts
  const generateContractPDF = async () => {
    // Get selected program
    const selectedPrograma = programas.find(p => p.id === contractForm.programa_id);

    // Build contract data object for the template
    const contractData = {
      fecha_contrato: contractForm.fecha_contrato,
      fecha_fin: contractForm.fecha_fin,
      numero_contrato: contractForm.numero_contrato,
      precio_total_uf: contractForm.precio_total_uf,
      precio_total_clp: contractForm.tipo_moneda === 'CLP' ? contractForm.precio_total_uf : 0,
      tipo_moneda: contractForm.tipo_moneda,
      cliente: {
        nombre_legal: clienteForm.nombre_legal,
        nombre_fantasia: clienteForm.nombre_fantasia,
        rut: clienteForm.rut,
        direccion: clienteForm.direccion,
        comuna: clienteForm.comuna,
        ciudad: clienteForm.ciudad,
        nombre_representante: clienteForm.nombre_representante,
        rut_representante: clienteForm.rut_representante,
        fecha_escritura: clienteForm.fecha_escritura,
        nombre_notario: clienteForm.nombre_notario,
        comuna_notaria: clienteForm.comuna_notaria
      },
      programa: {
        nombre: selectedPrograma?.nombre || contractForm.descripcion_manual || '',
        descripcion: selectedPrograma?.descripcion || '',
        horas_totales: selectedPrograma?.horas_totales || 0,
        modalidad: selectedPrograma?.modalidad || ''
      },
      cuotas: cuotas.map(c => ({
        numero_cuota: c.numero_cuota,
        fecha_vencimiento: c.fecha_vencimiento,
        monto_uf: contractForm.tipo_moneda === 'UF' ? c.monto : 0,
        monto_clp: contractForm.tipo_moneda === 'CLP' ? c.monto : 0
      }))
    };

    // Generate HTML from template
    const htmlContent = generateContractFromTemplate(contractData);

    return renderDocumentPreview(openDocumentPreview(), htmlContent, `Contrato ${contractForm.numero_contrato}`);
  };

  // Cuotas against the contract total, in whole units of the currency (GES-2.7)
  const moneyDecimals = decimalsFor(contractForm.tipo_moneda);
  const cuotaAmounts = cuotas.map(c => c.monto);
  const cuotasMatchTotal = sumsMatch(contractForm.precio_total_uf, cuotaAmounts, moneyDecimals);
  // The amounts that are checked are the amounts that are saved: a total or a cuota
  // with more decimals than its currency is refused, never rounded (send-back 1).
  // A typed amount the currency does not accept, or that is not an amount at all (N171).
  const amountMessage = (problem: AmountProblem, target: { cuota: number } | 'total', text: string) =>
    problem === 'ambiguous'
      ? ambiguousMessage(text)
      : problem === 'unreadable' ? unreadableMessage(target) : precisionMessage(target);
  const totalProblem = totalAmountProblem();
  const badPrecisionCuota = cuotas.find(c => cuotaProblem(c) !== null);
  const amountPrecisionError = totalProblem
    ? amountMessage(totalProblem, 'total', contractForm.precio_total_text)
    : badPrecisionCuota
      ? amountMessage(cuotaProblem(badPrecisionCuota), { cuota: badPrecisionCuota.numero_cuota }, badPrecisionCuota.montoText)
      : null;
  // A cuota whose amount is not above zero cannot be saved: say which (send-back 2)
  const zeroAmountCuota = cuotas.find(c => !(c.monto > 0) && !cuotaProblem(c));

  // Validation
  const isStepValid = () => {
    switch (step) {
      case 'cliente':
        // For manual contracts, require less information
        // A RUT that fails its check digit, or an imported new client without its
        // escritura date, cannot go on (GES-3.11, GES-3.6)
        if (rutInvalid || escrituraDateMissing) return false;
        if (esManual) {
          return clienteForm.nombre_legal && clienteForm.rut && 
                 clienteForm.nombre_contacto_administrativo && clienteForm.email_contacto_administrativo;
        }
        return clienteForm.nombre_legal && clienteForm.nombre_fantasia && 
               clienteForm.rut && clienteForm.direccion && clienteForm.comuna && 
               clienteForm.ciudad && clienteForm.nombre_representante;
      case 'contrato':
        // For manual contracts, validate description instead of program
        if (esManual) {
          return contractForm.numero_contrato && contractForm.fecha_contrato && 
                 contractForm.fecha_fin && contractForm.descripcion_manual && contractForm.precio_total_uf > 0 &&
                 totalProblem !== 'unreadable' && totalProblem !== 'ambiguous' && horasValid;
        }
        return contractForm.numero_contrato && contractForm.fecha_contrato && 
               contractForm.fecha_fin && contractForm.programa_id && contractForm.precio_total_uf > 0 &&
               totalProblem !== 'unreadable' && totalProblem !== 'ambiguous' && horasValid;
      case 'cuotas':
        return cuotas.every(c => c.fecha_vencimiento && c.monto > 0) &&
               cuotasMatchTotal && !amountPrecisionError;
      default:
        return false;
    }
  };

  // Determine if we should show the condiciones_pago side panel
  const showCondicionesPago = !!(licitacionId && licitacionData?.condiciones_pago);

  return (
    <div className={`flex gap-4 ${showCondicionesPago ? 'items-start' : ''}`}>
    {/* Main form */}
    <div className={`bg-white rounded-lg shadow-md ${showCondicionesPago ? 'flex-1' : 'w-full'}`}>
      {/* Show notification if licitacion data pre-populated */}
      {licitacionId && !extractedData && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <FileText className="text-blue-600 shrink-0" size={16} />
            <p className="text-blue-800 text-sm">
              <strong>Datos pre-cargados desde licitacion.</strong> El cliente, programa y monto
              han sido completados automaticamente. Revise y complete los campos restantes.
            </p>
          </div>
        </div>
      )}
      {/* Show notification if data was imported from PDF */}
      {extractedData && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="flex items-center">
            <FileText className="text-amber-600 mr-3" size={20} />
            <div className="flex-1">
              <p className="text-amber-900 font-medium">Datos importados desde PDF</p>
              <p className="text-amber-700 text-sm">
                Los campos han sido pre-llenados con la información extraída. Por favor, revise y complete los campos faltantes.
              </p>
            </div>
            {extractedData.overall_confidence && (
              <div className="ml-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  extractedData.overall_confidence >= 0.8 ? 'bg-amber-100 text-amber-800' :
                  extractedData.overall_confidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Confianza: {Math.round(extractedData.overall_confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Progress Steps */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          {['cliente', 'contrato', 'cuotas'].map((stepName, index) => {
            const isActive = step === stepName;
            const isCompleted = ['cliente', 'contrato', 'cuotas'].indexOf(step) > index;
            
            return (
              <div key={stepName} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isActive ? 'bg-brand_primary text-white' :
                  isCompleted ? 'bg-brand_yellow text-brand_primary' : 'bg-gray-200 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  isActive ? 'text-brand_primary' :
                  isCompleted ? 'text-brand_yellow' : 'text-gray-500'
                }`}>
                  {stepName === 'cliente' && 'Cliente'}
                  {stepName === 'contrato' && 'Contrato'}
                  {stepName === 'cuotas' && 'Cuotas'}
                </span>
                {index < 2 && <div className="w-8 h-px bg-gray-300 mx-4"></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {/* Step 1: Client Information */}
        {step === 'cliente' && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <FileText className="text-brand_primary" size={20} />
              <h3 className="text-lg font-semibold text-brand_primary">Información del Cliente</h3>
            </div>

            {/* Manual Contract Toggle and PDF Import Options */}
            <div className="space-y-3">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esManual}
                    onChange={(e) => setEsManual(e.target.checked)}
                    // An existing contract's nature is not flipped by accident (GES-2.8)
                    disabled={!!editingContract}
                    className="mr-3 h-4 w-4 text-brand_primary focus:ring-brand_accent border-gray-300 rounded"
                  />
                  <div>
                    <span className="font-medium text-gray-900">Contrato Manual (Subir PDF existente)</span>
                    <p className="text-sm text-gray-600 mt-1">
                      Marque esta opción para contratos creados fuera del sistema. Solo se solicitará información operativa.
                    </p>
                  </div>
                </label>
              </div>
              
              {/* AI PDF Import Button */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-amber-900">¿Tiene un PDF de contrato?</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Use AI para extraer automáticamente la información del contrato
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      // Trigger PDF import modal from parent
                      window.dispatchEvent(new CustomEvent('openPDFImporterFromForm'));
                    }}
                    className="inline-flex items-center px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 transition-colors"
                  >
                    <Upload className="mr-2" size={16} />
                    Importar con AI
                  </button>
                </div>
              </div>
            </div>

            {/* Existing Client Selection */}
            <div className="bg-brand_beige border border-brand_accent rounded-lg p-4">
              <label className="block text-sm font-medium text-brand_primary mb-2">
                Seleccionar Cliente Existente {licitacionId ? '(Pre-seleccionado desde licitacion)' : '(Opcional)'}
              </label>
              <select
                value={selectedClienteId}
                onChange={(e) => !licitacionId && handleClienteSelection(e.target.value)}
                disabled={!!licitacionId}
                className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${licitacionId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              >
                <option value="">-- Crear nuevo cliente --</option>
                {clientes.map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre_legal} ({cliente.rut})
                  </option>
                ))}
              </select>
              {licitacionId && (
                <p className="text-xs text-blue-600 mt-1">
                  Cliente fijado por la licitacion. No se puede cambiar.
                </p>
              )}
              {clientReadOnly && (
                <p className="text-sm text-gray-700 mt-2" data-testid="client-readonly-note">
                  Para corregir los datos del cliente, use Clientes
                </p>
              )}
              {fillableClientFields.length > 0 && (
                <p className="text-sm text-gray-700 mt-1" data-testid="client-fill-note">
                  Los datos que faltan en la ficha del cliente se guardarán en ella.
                </p>
              )}
            </div>

            {/* School Selection */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  <Building className="inline mr-2" size={16} />
                  Escuela Asociada
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewSchoolForm(!showNewSchoolForm)}
                  className="text-sm text-brand_primary hover:text-brand_primary/80 font-medium"
                >
                  {showNewSchoolForm ? 'Cancelar' : '+ Nueva Escuela'}
                </button>
              </div>
              
              {!showNewSchoolForm ? (
                <select
                  value={selectedSchoolId}
                  onChange={(e) => {
                    const schoolId = e.target.value ? parseInt(e.target.value) : '';
                    setSelectedSchoolId(schoolId);
                    
                    // If a school is selected, update client form with school data
                    if (schoolId && typeof schoolId === 'number') {
                      const school = schools.find(s => s.id === schoolId);
                      if (school && !selectedClienteId) {
                        setClienteForm(prev => ({
                          ...prev,
                          nombre_fantasia: school.name,
                          direccion: school.address || prev.direccion,
                          ciudad: school.region || prev.ciudad
                        }));
                      }
                    }
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                >
                  <option value="">-- Sin escuela asociada --</option>
                  {schools.filter(school => !school.cliente_id || school.cliente_id === selectedClienteId).map(school => (
                    <option key={school.id} value={school.id}>
                      {school.name} {school.code ? `(${school.code})` : ''}
                      {school.cliente_id && school.cliente_id !== selectedClienteId ? ' (Vinculada a otro cliente)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-3">
                  <div>
                    <input
                      type="text"
                      value={newSchoolForm.name}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, name: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                      placeholder="Nombre de la escuela *"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newSchoolForm.code}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, code: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                      placeholder="Código"
                    />
                    <input
                      type="text"
                      value={newSchoolForm.region}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, region: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                      placeholder="Región"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={newSchoolForm.address}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, address: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                      placeholder="Dirección"
                    />
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="has_generations"
                      checked={newSchoolForm.has_generations}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, has_generations: e.target.checked })}
                      className="mr-2 h-4 w-4 text-brand_primary focus:ring-brand_accent border-gray-300 rounded"
                    />
                    <label htmlFor="has_generations" className="text-sm text-gray-700">
                      Esta escuela maneja generaciones
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateSchool}
                    disabled={loading || !newSchoolForm.name.trim()}
                    className="w-full px-4 py-2 bg-brand_primary text-white rounded-lg hover:bg-brand_primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creando...' : 'Crear Escuela'}
                  </button>
                </div>
              )}
              
              {selectedSchoolId && (
                <p className="text-xs text-gray-500 mt-2">
                  La escuela y el cliente quedarán vinculados automáticamente
                </p>
              )}
            </div>

            {/* Client Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre Legal *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_legal}
                  readOnly={clientFieldReadOnly('nombre_legal')}
                  onChange={(e) => editCliente('nombre_legal', e.target.value)}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('nombre_legal') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="Nombre legal de la empresa"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de Fantasía *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_fantasia}
                  readOnly={clientFieldReadOnly('nombre_fantasia')}
                  onChange={(e) => editCliente('nombre_fantasia', e.target.value)}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('nombre_fantasia') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="Nombre comercial"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RUT *
                </label>
                <input
                  type="text"
                  value={clienteForm.rut}
                  readOnly={clientFieldReadOnly('rut')}
                  onChange={(e) => editCliente('rut', formatRut(e.target.value))}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('rut') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="12.345.678-9"
                />
                {rutInvalid && (
                  <p className="text-sm text-red-600 mt-1">{RUT_INVALID_MESSAGE}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dirección *
                </label>
                <input
                  type="text"
                  value={clienteForm.direccion}
                  readOnly={clientFieldReadOnly('direccion')}
                  onChange={(e) => editCliente('direccion', e.target.value)}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('direccion') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="Calle y número"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comuna *
                </label>
                <input
                  type="text"
                  value={clienteForm.comuna}
                  readOnly={clientFieldReadOnly('comuna')}
                  onChange={(e) => editCliente('comuna', e.target.value)}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('comuna') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="Comuna"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ciudad *
                </label>
                <input
                  type="text"
                  value={clienteForm.ciudad}
                  readOnly={clientFieldReadOnly('ciudad')}
                  onChange={(e) => editCliente('ciudad', e.target.value)}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('ciudad') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="Ciudad"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Representante Legal *
                </label>
                <input
                  type="text"
                  value={clienteForm.nombre_representante}
                  readOnly={clientFieldReadOnly('nombre_representante')}
                  onChange={(e) => editCliente('nombre_representante', e.target.value)}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('nombre_representante') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="Nombre del representante"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  RUT Representante
                </label>
                <input
                  type="text"
                  value={clienteForm.rut_representante}
                  readOnly={clientFieldReadOnly('rut_representante')}
                  onChange={(e) => editCliente('rut_representante', e.target.value)}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('rut_representante') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  placeholder="12.345.678-9"
                />
              </div>
            </div>

            {/* An imported contract's new client: its escritura date is asked for (GES-3.6) */}
            {esManual && importedNewClient && (
            <div className="border-t pt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Escritura Pública *
              </label>
              <input
                type="date"
                data-testid="client-fecha-escritura-input"
                value={clienteForm.fecha_escritura}
                onChange={(e) => editCliente('fecha_escritura', e.target.value)}
                className="w-full md:w-1/3 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
              />
              {escrituraDateMissing && (
                <p className="text-sm text-red-600 mt-1">{ASK_ESCRITURA_DATE_MESSAGE}</p>
              )}
            </div>
            )}

            {/* Additional Legal Information - Hide for manual contracts */}
            {!esManual && (
            <div className="border-t pt-6">
              <h4 className="text-md font-semibold text-brand_primary mb-4">Información Legal Adicional</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha Escritura Pública
                  </label>
                  <input
                    type="date"
                    value={clienteForm.fecha_escritura}
                    readOnly={clientFieldReadOnly('fecha_escritura')}
                    onChange={(e) => editCliente('fecha_escritura', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('fecha_escritura') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  {escrituraDateMissing && (
                    <p className="text-sm text-red-600 mt-1">{ASK_ESCRITURA_DATE_MESSAGE}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notario Público
                  </label>
                  <input
                    type="text"
                    value={clienteForm.nombre_notario}
                    readOnly={clientFieldReadOnly('nombre_notario')}
                    onChange={(e) => editCliente('nombre_notario', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('nombre_notario') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="Nombre del notario"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comuna Notaría
                  </label>
                  <input
                    type="text"
                    value={clienteForm.comuna_notaria}
                    readOnly={clientFieldReadOnly('comuna_notaria')}
                    onChange={(e) => editCliente('comuna_notaria', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('comuna_notaria') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="Santiago, Providencia, etc."
                  />
                </div>
              </div>
            </div>
            )}

            {/* Project Manager Information - Hide for manual contracts */}
            {!esManual && (
            <div className="border-t pt-6">
              <h4 className="text-md font-semibold text-brand_primary mb-4">Encargado del Proyecto</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Encargado
                  </label>
                  <input
                    type="text"
                    value={clienteForm.nombre_encargado_proyecto}
                    readOnly={clientFieldReadOnly('nombre_encargado_proyecto')}
                    onChange={(e) => editCliente('nombre_encargado_proyecto', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('nombre_encargado_proyecto') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="Nombre completo"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={clienteForm.telefono_encargado_proyecto}
                    readOnly={clientFieldReadOnly('telefono_encargado_proyecto')}
                    onChange={(e) => editCliente('telefono_encargado_proyecto', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('telefono_encargado_proyecto') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="+56 9 1234 5678"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={clienteForm.email_encargado_proyecto}
                    readOnly={clientFieldReadOnly('email_encargado_proyecto')}
                    onChange={(e) => editCliente('email_encargado_proyecto', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('email_encargado_proyecto') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="encargado@colegio.cl"
                  />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  Esta información es necesaria para la gestión de facturación y seguimiento del proyecto.
                </p>
              </div>
            </div>
            )}

            {/* Administrative Contact Information - ALWAYS SHOW for invoicing */}
            <div className="border-t pt-6">
              <h4 className="text-md font-semibold text-brand_primary mb-4">Contacto Administrativo {esManual && '(Requerido para facturación)'}</h4>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-400 text-lg">📧</span>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800">
                      <strong>Importante:</strong> Esta es la persona que recibirá todas las facturas y documentos administrativos del contrato.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Contacto Administrativo
                  </label>
                  <input
                    type="text"
                    value={clienteForm.nombre_contacto_administrativo}
                    readOnly={clientFieldReadOnly('nombre_contacto_administrativo')}
                    onChange={(e) => editCliente('nombre_contacto_administrativo', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('nombre_contacto_administrativo') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="Nombre completo"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono de Facturación
                  </label>
                  <input
                    type="tel"
                    value={clienteForm.telefono_contacto_administrativo}
                    readOnly={clientFieldReadOnly('telefono_contacto_administrativo')}
                    onChange={(e) => editCliente('telefono_contacto_administrativo', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('telefono_contacto_administrativo') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="+56 2 2345 6789"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email de Facturación
                  </label>
                  <input
                    type="email"
                    value={clienteForm.email_contacto_administrativo}
                    readOnly={clientFieldReadOnly('email_contacto_administrativo')}
                    onChange={(e) => editCliente('email_contacto_administrativo', e.target.value)}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${clientFieldReadOnly('email_contacto_administrativo') ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="administracion@colegio.cl"
                  />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  <strong>Nota:</strong> Las facturas y documentos administrativos se enviarán a este contacto por email.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contract Information */}
        {step === 'contrato' && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <Calendar className="text-brand_primary" size={20} />
              <h3 className="text-lg font-semibold text-brand_primary">Información del Contrato</h3>
            </div>

            {/* Show notice for manual contracts */}
            {esManual && (
              <div className="bg-brand_beige border border-brand_accent rounded-lg p-4">
                <p className="text-brand_primary">
                  📄 <strong>Contrato Manual</strong> - Solo ingrese información necesaria para gestión operativa y pagos.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de Contrato *
                </label>
                <input
                  type="text"
                  value={contractForm.numero_contrato}
                  onChange={(e) => setContractForm({ ...contractForm, numero_contrato: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  placeholder="FNE-2025-01-001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha del Contrato *
                </label>
                <input
                  type="date"
                  value={contractForm.fecha_contrato}
                  onChange={(e) => setContractForm({ ...contractForm, fecha_contrato: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Finalización *
                </label>
                <input
                  type="date"
                  value={contractForm.fecha_fin}
                  onChange={(e) => setContractForm({ ...contractForm, fecha_fin: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  min={contractForm.fecha_contrato}
                />
              </div>
              
              {/* For manual contracts, show description field instead of program selection */}
              {esManual ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción del Contrato *
                  </label>
                  <textarea
                    value={contractForm.descripcion_manual}
                    onChange={(e) => setContractForm({ ...contractForm, descripcion_manual: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                    placeholder="Ej: Asesoría personalizada Q1 2025, Programa piloto región sur, Capacitación especial..."
                    rows={3}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Breve descripción del servicio o programa que cubre este contrato
                  </p>
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Programa Contratado *
                  </label>
                  <select
                    value={contractForm.programa_id}
                    onChange={(e) => {
                      if (licitacionId) return;
                      // The programme's hours replace the field, unless locked (send-back 3)
                      const horas = horasReadOnly ? null : hoursOfProgramme(programas, e.target.value);
                      setContractForm({
                        ...contractForm,
                        programa_id: e.target.value,
                        ...(horas !== null ? { horas_contratadas: horas } : {})
                      });
                    }}
                    disabled={!!licitacionId}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${licitacionId ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    <option value="">-- Seleccionar programa --</option>
                    {programas.map(programa => (
                      <option key={programa.id} value={programa.id}>
                        {programa.nombre} ({programa.horas_totales}h - {programa.modalidad})
                      </option>
                    ))}
                  </select>
                  {licitacionId && (
                    <p className="text-xs text-blue-600 mt-1">
                      Programa fijado por la licitacion. No se puede cambiar.
                    </p>
                  )}
                </div>
              )}

              {/* Contracted hours (GES-2.2): filled from the programme, editable */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Horas contratadas
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="999999.99"
                  data-testid="contract-hours-input"
                  value={contractForm.horas_contratadas}
                  readOnly={horasReadOnly}
                  onChange={(e) => {
                    if (horasReadOnly) return;
                    setContractForm({ ...contractForm, horas_contratadas: e.target.value });
                  }}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent ${horasReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                />
                {/* Locked by a distribution: only the lock note shows (send-back 2) */}
                {hourAllocationState !== 'has' && (
                  <p className="text-sm text-gray-500 mt-1">
                    {esManual
                      ? 'Horas de la bolsa de este contrato (opcional).'
                      : 'Se completa con las horas del programa al elegirlo; puede cambiarlas después.'}
                  </p>
                )}
                {hourAllocationState === 'has' && (
                  <p className="text-xs text-gray-500 mt-1">
                    No se puede cambiar: el contrato ya tiene una distribución de horas.
                  </p>
                )}
                {!horasValid && (
                  <p className="text-sm text-red-600 mt-1">
                    Las horas contratadas deben ser un número entre 0 y 999999,99 con hasta dos decimales.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Moneda
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipo_moneda"
                      value="UF"
                      checked={contractForm.tipo_moneda === 'UF'}
                      onChange={(e) => changeCurrency(e.target.value as 'UF' | 'CLP')}
                      className="mr-2"
                    />
                    UF (Unidades de Fomento)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="tipo_moneda"
                      value="CLP"
                      checked={contractForm.tipo_moneda === 'CLP'}
                      onChange={(e) => changeCurrency(e.target.value as 'UF' | 'CLP')}
                      className="mr-2"
                    />
                    Pesos Chilenos (CLP)
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio Total ({contractForm.tipo_moneda}) *
                </label>
                {/* Typed the Chilean way: «1.200,50», «15.990» (N171) */}
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="contract-total-input"
                  value={contractForm.precio_total_text}
                  onChange={(e) => setContractForm({
                    ...contractForm,
                    precio_total_text: e.target.value,
                    precio_total_uf: readAmount(e.target.value, contractForm.tipo_moneda).value
                  })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  placeholder="0.00"
                />
                {totalProblem && (
                  <p className="text-sm text-red-600 mt-1">{amountMessage(totalProblem, 'total', contractForm.precio_total_text)}</p>
                )}
              </div>
            </div>

            {/* PDF Upload Notice for Manual Contracts */}
            {esManual && (
              <div className="mt-6 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50">
                <Upload size={32} className="mx-auto mb-3 text-gray-400" />
                <p className="font-medium text-gray-900 mb-2">El PDF del contrato se subirá después de guardar</p>
                <p className="text-sm text-gray-600">Una vez guardada la información, podrá cargar el PDF desde el listado de contratos</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Installments */}
        {step === 'cuotas' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <DollarSign className="text-brand_primary" size={20} />
                <h3 className="text-lg font-semibold text-brand_primary">Plan de Pagos</h3>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={calculateCuotas}
                  className="px-4 py-2 bg-brand_yellow text-brand_primary rounded-lg hover:bg-brand_yellow/90 transition-colors text-sm font-medium"
                >
                  Calcular Automático
                </button>
                <button
                  type="button"
                  onClick={addCuota}
                  disabled={cuotas.length >= 12}
                  className="flex items-center px-4 py-2 bg-brand_primary text-white rounded-lg hover:bg-brand_primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Plus size={16} className="mr-1" />
                  Agregar Cuota
                </button>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 mb-2">
                <strong>Total del Contrato:</strong> {contractForm.tipo_moneda} {contractForm.precio_total_uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-600">
                <strong>Total de Cuotas:</strong> {contractForm.tipo_moneda} {cuotas.reduce((sum, c) => sum + c.monto, 0).toLocaleString('es-CL', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="space-y-4">
              {cuotas.map((cuota, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-4 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-brand_primary">Cuota {cuota.numero_cuota}</span>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Fecha Vencimiento
                    </label>
                    <input
                      type="date"
                      value={cuota.fecha_vencimiento}
                      onChange={(e) => updateCuota(index, 'fecha_vencimiento', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Monto ({contractForm.tipo_moneda})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      data-testid="cuota-amount-input"
                      value={cuota.montoText}
                      onChange={(e) => updateCuotaAmount(index, e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand_accent focus:border-transparent text-sm"
                    />
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeCuota(index)}
                      disabled={cuotas.length <= 1}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Eliminar cuota"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!cuotasMatchTotal && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  ⚠️ La suma de las cuotas no coincide con el total del contrato. 
                  Diferencia: {contractForm.tipo_moneda} {difference(contractForm.precio_total_uf, cuotaAmounts, moneyDecimals).toLocaleString('es-CL', { minimumFractionDigits: moneyDecimals, maximumFractionDigits: moneyDecimals })}
                </p>
              </div>
            )}

            {amountPrecisionError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">{amountPrecisionError}</p>
              </div>
            )}

            {zeroAmountCuota && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  La cuota {zeroAmountCuota.numero_cuota} necesita un monto mayor que cero.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            
            {step !== 'cliente' && (
              <button
                type="button"
                onClick={() => {
                  if (step === 'contrato') setStep('cliente');
                  if (step === 'cuotas') setStep('contrato');
                }}
                className="px-6 py-2 border border-brand_accent text-brand_primary rounded-lg hover:bg-brand_primary hover:text-white transition-colors"
              >
                Anterior
              </button>
            )}
          </div>
          
          <div>
            {step !== 'cuotas' ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 'cliente') setStep('contrato');
                  if (step === 'contrato') setStep('cuotas');
                }}
                disabled={!isStepValid()}
                className="px-6 py-2 bg-brand_primary text-white rounded-lg hover:bg-brand_primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            ) : (
              <div className="flex space-x-3">
                {/* Save as Draft button: a new contract or a draft only (GES-3.8) */}
                {canSaveAsDraft && (
                <button
                  type="button"
                  onClick={handleSaveAsDraft}
                  disabled={savingAsDraft}
                  className="flex items-center px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  title="Guardar progreso sin finalizar el contrato"
                >
                  {savingAsDraft ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Guardando borrador...
                    </>
                  ) : (
                    <>
                      <Save size={16} className="mr-2" />
                      Guardar Borrador
                    </>
                  )}
                </button>
                )}
                {/* Only show PDF generation for standard contracts */}
                {!esManual && (
                  <button
                    type="button"
                    onClick={() => {
                      void generateContractPDF().catch(() => toast.error('Error al abrir la vista previa del contrato'));
                    }}
                    disabled={!isStepValid()}
                    className="flex items-center px-6 py-2 bg-brand_accent text-brand_primary rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    <Download size={16} className="mr-2" />
                    Vista previa / PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveContract}
                  disabled={!isStepValid() || loading}
                  className="flex items-center px-6 py-2 bg-brand_yellow text-brand_primary rounded-lg hover:bg-brand_yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_accent mr-2"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={16} className="mr-2" />
                      {editingContract ? 'Actualizar Contrato' : 'Guardar Contrato'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    {/* Condiciones de Pago side panel (Phase 5: only when from licitacion) */}
    {showCondicionesPago && (
      <div className="w-72 shrink-0">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 sticky top-4">
          <h4 className="font-semibold text-blue-900 text-sm mb-2">
            Condiciones de Pago (Licitacion)
          </h4>
          <p className="text-blue-800 text-xs leading-relaxed whitespace-pre-wrap">
            {licitacionData?.condiciones_pago}
          </p>
        </div>
      </div>
    )}
    </div>
  );
}
