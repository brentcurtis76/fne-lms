import React from 'react';
import { Calendar, Users, Plane, Building, DollarSign, FileText, MapPin, Clock, CheckCircle, ExternalLink, Download, Mail, Phone } from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';
import { parseLocalDate } from '@/utils/dateUtils';

interface Program {
  id: string;
  name: string;
  description: string;
  price: number;
  pdf_url: string | null;
}

interface Quote {
  id: string;
  quote_number?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_institution?: string;
  arrival_date: string;
  departure_date: string;
  nights: number;
  flight_price: number;
  flight_notes?: string;
  room_type: string;
  single_room_price: number;
  double_room_price: number;
  num_pasantes: number;
  selected_programs: string[];
  program_total: number;
  accommodation_total: number;
  total_per_person: number;
  grand_total: number;
  notes?: string;
  status: string;
  valid_until?: string;
  created_at: string;
  programs: Program[];
  apply_early_bird_discount?: boolean;
  discount_amount?: number;
  original_program_total?: number;
  viaticos_type?: 'daily' | 'total' | null;
  viaticos_amount?: number;
  viaticos_total?: number;
  viaticos_display_amount?: number;
}

interface QuotePublicViewProps {
  quote: Quote;
}

export default function QuotePublicView({ quote }: QuotePublicViewProps) {
  const formatDate = (dateString: string) => {
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Calculate the actual per-person program cost
  const calculateProgramCostPerPerson = () => {
    if (!quote.programs || quote.programs.length === 0) return 0;
    
    // Sum up the base prices of selected programs
    const baseProgramTotal = quote.programs.reduce((sum, program) => sum + program.price, 0);
    
    // Apply early bird discount if active ($500,000 per program)
    if (quote.apply_early_bird_discount) {
      const discountPerPerson = 500000 * quote.programs.length;
      return Math.max(0, baseProgramTotal - discountPerPerson);
    }
    
    return baseProgramTotal;
  };

  const programCostPerPerson = calculateProgramCostPerPerson();

  const generatePDF = () => {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 56;
    const contentWidth = pageWidth - margin * 2;

    const primaryColor: [number, number, number] = [28, 35, 53];
    const textColor: [number, number, number] = [42, 47, 55];
    const mutedText: [number, number, number] = [120, 125, 133];
    const dividerColor: [number, number, number] = [218, 222, 229];
    const neutralBg: [number, number, number] = [246, 247, 249];

    let cursorY = margin;

    const ensureSpace = (height: number) => {
      if (cursorY + height > pageHeight - margin) {
        pdf.addPage();
        cursorY = margin;
      }
    };

    const formatCurrencyClp = (value: number) => {
      return `$${Math.round(value).toLocaleString('es-CL')} CLP`;
    };

    const drawDefinitionCell = (
      label: string,
      value: string,
      x: number,
      y: number,
      width: number
    ) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
      pdf.text(label.toUpperCase(), x, y);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      const lines = pdf.splitTextToSize(value, width);
      lines.forEach((line, index) => {
        pdf.text(line, x, y + 15 + index * 13);
      });
      return 15 + (lines.length - 1) * 13 + 16;
    };

    const drawDefinitionList = (
      items: { label: string; value: string }[],
      columns = 2
    ) => {
      if (!items.length) return;
      const spacing = 24;
      const columnWidth = (contentWidth - spacing * (columns - 1)) / columns;
      let columnIndex = 0;
      let rowTop = cursorY;
      let rowHeight = 0;

      items.forEach((item, index) => {
        const x = margin + (columnWidth + spacing) * columnIndex;
        const height = drawDefinitionCell(item.label, item.value, x, rowTop, columnWidth);
        rowHeight = Math.max(rowHeight, height);
        columnIndex += 1;

        const isRowBreak = columnIndex === columns || index === items.length - 1;
        if (isRowBreak) {
          rowTop += rowHeight;
          cursorY = rowTop;
          columnIndex = 0;
          rowHeight = 0;
          ensureSpace(0);
        }
      });

      cursorY += 12;
    };

    const drawSectionTitle = (title: string) => {
      ensureSpace(40);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.text(title.toUpperCase(), margin, cursorY);
      cursorY += 14;
      pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
      pdf.setLineWidth(0.5);
      pdf.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 20;
    };

    const drawParagraph = (text: string, maxWidth: number) => {
      const lines = pdf.splitTextToSize(text, maxWidth);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      lines.forEach((line) => {
        ensureSpace(18);
        pdf.text(line, margin, cursorY);
        cursorY += 15;
      });
      cursorY += 4;
    };

    const addFooter = () => {
      const footerY = pageHeight - margin + 24;
      pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
      pdf.line(margin, footerY - 18, pageWidth - margin, footerY - 18);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);

      pdf.text('Email: info@nuevaeducacion.org', margin, footerY);
      pdf.text('Tel: +56 9 4162 3577', pageWidth / 2, footerY, { align: 'center' });
      pdf.text('Web: www.nuevaeducacion.org', pageWidth - margin, footerY, { align: 'right' });

      pdf.setFont('helvetica', 'bold');
      pdf.text('© 2025 Fundación Nueva Educación', pageWidth / 2, footerY + 14, { align: 'center' });
    };

    const moveCursorNearFooter = () => {
      if (cursorY < pageHeight - margin - 80) {
        cursorY = pageHeight - margin - 80;
      }
    };

    // Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text('FUNDACIÓN NUEVA EDUCACIÓN', margin, cursorY);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    pdf.text('Propuesta Pasantía Internacional · Barcelona 2025', margin, cursorY + 18);

    if (quote.quote_number || quote.created_at || quote.valid_until) {
      const rightX = pageWidth - margin;
      let detailY = cursorY;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      if (quote.quote_number) {
        pdf.text(`#${quote.quote_number}`, rightX, detailY, { align: 'right' });
        detailY += 16;
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
      if (quote.created_at) {
        pdf.text(`Emitida: ${formatDate(quote.created_at)}`, rightX, detailY, { align: 'right' });
        detailY += 14;
      }
      if (quote.valid_until) {
        pdf.text(`Válida hasta: ${formatDate(quote.valid_until)}`, rightX, detailY, { align: 'right' });
      }
    }

    cursorY += 46;
    pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    pdf.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 24;

    // Client information
    drawSectionTitle('Información del cliente');
    const clientItems: { label: string; value: string }[] = [
      { label: 'Cliente', value: quote.client_name },
      quote.client_institution
        ? { label: 'Institución', value: quote.client_institution }
        : null,
      quote.client_email ? { label: 'Email', value: quote.client_email } : null,
      quote.client_phone ? { label: 'Teléfono', value: quote.client_phone } : null,
    ].filter(Boolean) as { label: string; value: string }[];
    drawDefinitionList(clientItems, 2);

    // Travel details
    drawSectionTitle('Detalles del viaje');
    const travelItems: { label: string; value: string }[] = [
      { label: 'Fecha de llegada', value: formatDate(quote.arrival_date) },
      { label: 'Fecha de salida', value: formatDate(quote.departure_date) },
      {
        label: 'Duración',
        value: `${quote.nights} ${quote.nights === 1 ? 'noche' : 'noches'}`,
      },
      {
        label: 'Participantes',
        value: `${quote.num_pasantes} ${
          quote.num_pasantes === 1 ? 'persona' : 'personas'
        }`,
      },
      {
        label: 'Tipo de habitación',
        value:
          quote.room_type === 'single'
            ? 'Individual'
            : quote.room_type === 'triple'
            ? 'Triple'
            : 'Doble',
      },
    ];
    drawDefinitionList(travelItems, 2);

    // Programs
    if (quote.programs && quote.programs.length > 0) {
      drawSectionTitle('Programas seleccionados');
      quote.programs.forEach((program, index) => {
        ensureSpace(48);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
        pdf.text(program.name, margin, cursorY);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        pdf.text(
          `${formatCurrencyClp(program.price)}`,
          pageWidth - margin,
          cursorY,
          { align: 'right' }
        );

        cursorY += 16;

        if (program.description) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
          const descLines = pdf.splitTextToSize(program.description, contentWidth);
          descLines.forEach((line) => {
            ensureSpace(18);
            pdf.text(line, margin, cursorY);
            cursorY += 14;
          });
        }

        cursorY += 6;

        if (index < quote.programs.length - 1) {
          pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
          pdf.line(margin, cursorY, pageWidth - margin, cursorY);
          cursorY += 12;
        }
      });

      cursorY += 8;
    }

    // Cost summary
    drawSectionTitle('Resumen de costos');
    const accommodationPerPerson = quote.accommodation_total / quote.num_pasantes;
    const viaticosPerPerson =
      quote.viaticos_display_amount && quote.viaticos_display_amount > 0
        ? Math.round(quote.viaticos_display_amount / quote.num_pasantes)
        : 0;
    const discountPerPerson =
      quote.discount_amount && quote.num_pasantes > 0
        ? Math.round(quote.discount_amount / quote.num_pasantes)
        : quote.apply_early_bird_discount
        ? 500000 * (quote.programs?.length || 0)
        : 0;

    const costRows: { label: string; value: string; hint?: string }[] = [
      { label: 'Vuelo internacional', value: formatCurrencyClp(quote.flight_price) },
      {
        label: `Alojamiento (${quote.nights} ${
          quote.nights === 1 ? 'noche' : 'noches'
        })`,
        value: formatCurrencyClp(accommodationPerPerson),
      },
      {
        label: `Programas (${quote.programs?.length || 0})`,
        value: formatCurrencyClp(programCostPerPerson),
        hint: quote.apply_early_bird_discount
          ? 'Incluye descuento por pago anticipado'
          : undefined,
      },
    ];

    if (viaticosPerPerson > 0) {
      costRows.push({
        label:
          quote.viaticos_type === 'daily'
            ? `Viáticos (${quote.nights + 1} días)`
            : 'Viáticos (monto total)',
        value: formatCurrencyClp(viaticosPerPerson),
      });
    }

    const tableLeft = margin;
    const tableRight = pageWidth - margin;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    pdf.text('Concepto', tableLeft + 10, cursorY);
    pdf.text('Monto', tableRight - 10, cursorY, { align: 'right' });
    cursorY += 12;
    pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    pdf.line(tableLeft, cursorY, tableRight, cursorY);

    costRows.forEach((row) => {
      const rowHeight = row.hint ? 30 : 24;
      ensureSpace(rowHeight + 4);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      pdf.text(row.label, tableLeft + 10, cursorY + 18);

      if (row.hint) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
        pdf.text(row.hint, tableLeft + 10, cursorY + 30);
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      pdf.text(row.value, tableRight - 10, cursorY + 18, { align: 'right' });

      cursorY += rowHeight;
      pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
      pdf.line(tableLeft, cursorY, tableRight, cursorY);
    });

    cursorY += 16;

    ensureSpace(48);
    pdf.setFillColor(neutralBg[0], neutralBg[1], neutralBg[2]);
    pdf.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    pdf.roundedRect(tableLeft, cursorY, contentWidth, 40, 6, 6, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    pdf.text('Total por persona', tableLeft + 14, cursorY + 26);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(
      formatCurrencyClp(quote.total_per_person),
      tableRight - 14,
      cursorY + 26,
      { align: 'right' }
    );

    cursorY += 56;

    if (quote.num_pasantes > 1) {
      ensureSpace(30);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
      pdf.text(
        `Total general para ${quote.num_pasantes} ${
          quote.num_pasantes === 1 ? 'persona' : 'personas'
        }`,
        tableLeft,
        cursorY
      );

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      pdf.text(
        formatCurrencyClp(quote.grand_total),
        tableRight,
        cursorY,
        { align: 'right' }
      );
      cursorY += 28;
    }

    if (discountPerPerson > 0) {
      ensureSpace(60);
      pdf.setFillColor(neutralBg[0], neutralBg[1], neutralBg[2]);
      pdf.rect(tableLeft, cursorY, contentWidth, 54, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      pdf.text('Descuento por pago anticipado', tableLeft + 14, cursorY + 20);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
      pdf.text(
        `Ahorro de ${formatCurrencyClp(discountPerPerson)} por persona`,
        tableLeft + 14,
        cursorY + 36
      );
      pdf.text(
        'Válido pagando antes del 30 de noviembre de 2025',
        tableLeft + 14,
        cursorY + 48
      );

      cursorY += 72;
    }

    if (quote.notes) {
      moveCursorNearFooter();
      addFooter();
      pdf.addPage();
      cursorY = margin;

      drawSectionTitle('Información adicional');
      drawParagraph(quote.notes, contentWidth);

      moveCursorNearFooter();
      addFooter();
    } else {
      moveCursorNearFooter();
      addFooter();
    }

    const date = new Date().toISOString().split('T')[0];
    pdf.save(`Propuesta_Barcelona_${quote.client_name.replace(/\s+/g, '_')}_${date}.pdf`);
    toast.success('PDF descargado exitosamente');
  };

  const handleContact = () => {
    window.location.href = 'mailto:info@nuevaeducacion.org?subject=Consulta sobre cotización pasantía Barcelona';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white py-8">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black mb-2">FUNDACIÓN NUEVA EDUCACIÓN</h1>
              <p className="text-white/80">Cotización Pasantía Internacional Barcelona</p>
            </div>
            <img 
              src="/Logo BW.png?v=3" 
              alt="FNE" 
              className="h-16 w-auto filter brightness-0 invert"
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
          </div>
        </div>
      </header>

      {/* Status Bar */}
      {quote.status === 'sent' || quote.status === 'viewed' ? (
        <div className="bg-yellow-50 border-b-2 border-yellow-200 py-3">
          <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
            <div className="flex items-center text-yellow-700">
              <CheckCircle className="mr-2" size={20} />
              <span className="font-medium">Cotización activa</span>
            </div>
            {quote.valid_until && (
              <div className="text-sm text-yellow-600">
                Válida hasta: {formatDate(quote.valid_until)}
              </div>
            )}
          </div>
        </div>
      ) : quote.status === 'expired' ? (
        <div className="bg-red-50 border-b-2 border-red-200 py-3">
          <div className="max-w-5xl mx-auto px-6 flex items-center text-red-700">
            <Clock className="mr-2" size={20} />
            <span className="font-medium">Esta cotización ha expirado</span>
          </div>
        </div>
      ) : null}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Client Info */}
        <div className="bg-gray-50 rounded-2xl p-8 mb-8">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold">Información del Cliente</h2>
            {quote.quote_number && (
              <div className="text-right">
                <p className="text-sm text-gray-600 mb-1">N° Cotización</p>
                <p className="text-2xl font-mono font-bold">#{quote.quote_number}</p>
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Cliente</p>
              <p className="text-lg font-medium">{quote.client_name}</p>
            </div>
            {quote.client_institution && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Institución</p>
                <p className="text-lg font-medium">{quote.client_institution}</p>
              </div>
            )}
            {quote.client_email && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Email</p>
                <p className="text-lg font-medium">{quote.client_email}</p>
              </div>
            )}
            {quote.client_phone && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Teléfono</p>
                <p className="text-lg font-medium">{quote.client_phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Travel Details */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Dates and Accommodation */}
          <div className="bg-white border-2 border-black rounded-2xl p-8">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <Calendar className="mr-3" size={24} />
              Detalles del Viaje
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Fecha de llegada</span>
                <span className="font-medium">{formatDate(quote.arrival_date)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Fecha de salida</span>
                <span className="font-medium">{formatDate(quote.departure_date)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Duración</span>
                <span className="font-bold text-lg">{quote.nights} noches</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Número de pasantes</span>
                <span className="font-bold text-lg flex items-center">
                  <Users className="mr-2" size={20} />
                  {quote.num_pasantes} {quote.num_pasantes === 1 ? 'persona' : 'personas'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-gray-600">Tipo de habitación</span>
                <span className="font-medium">
                  {quote.room_type === 'single' ? 'Individual' : 'Doble'}
                </span>
              </div>
            </div>
          </div>

          {/* Flight Info */}
          <div className="bg-white border-2 border-black rounded-2xl p-8">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <Plane className="mr-3" size={24} />
              Información de Vuelo
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-gray-600 mb-2">Precio estimado del vuelo</p>
                <p className="text-3xl font-bold">${quote.flight_price.toLocaleString('es-CL')} CLP</p>
                <p className="text-sm text-gray-500 mt-1">Por persona</p>
              </div>
              
              {quote.flight_notes && (
                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                  <p className="text-sm text-gray-700">{quote.flight_notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Programs */}
        {quote.programs && quote.programs.length > 0 && (
          <div className="bg-white border-2 border-black rounded-2xl p-8 mb-8">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <FileText className="mr-3" size={24} />
              Programas Incluidos
            </h3>
            
            <div className="space-y-4">
              {quote.programs.map((program) => (
                <div key={program.id} className="border rounded-xl p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-lg mb-2 flex items-center">
                        <CheckCircle className="mr-2 text-yellow-600" size={20} />
                        {program.name}
                      </h4>
                      {program.description && (
                        <p className="text-gray-600 ml-7">{program.description}</p>
                      )}
                      {program.pdf_url && (
                        <a
                          href={program.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center mt-3 ml-7 text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <ExternalLink className="mr-1" size={16} />
                          Ver folleto del programa
                        </a>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-2xl font-bold">${program.price.toLocaleString('es-CL')}</p>
                      <p className="text-sm text-gray-500">CLP por persona</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost Summary */}
        <div className="bg-black text-white rounded-2xl p-4 sm:p-8 mb-8">
          <h3 className="text-xl sm:text-2xl font-bold mb-6 sm:mb-8 flex items-center">
            <DollarSign className="mr-2 sm:mr-3" size={24} />
            Resumen de Costos
          </h3>
          
          <div className="space-y-6">
            {/* Breakdown per person */}
            <div className="bg-white/10 rounded-xl p-4 sm:p-6">
              <h4 className="font-bold mb-4 text-base sm:text-lg">Costo por Persona</h4>
              
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-white/80 text-sm sm:text-base">Vuelo internacional</span>
                  <span className="font-medium text-sm sm:text-base whitespace-nowrap">
                    ${quote.flight_price.toLocaleString('es-CL')} CLP
                  </span>
                </div>
                
                <div className="flex justify-between items-start gap-2">
                  <span className="text-white/80 text-sm sm:text-base">
                    Alojamiento ({quote.nights} noches)
                  </span>
                  <span className="font-medium text-sm sm:text-base whitespace-nowrap">
                    ${(quote.accommodation_total / quote.num_pasantes).toLocaleString('es-CL')} CLP
                  </span>
                </div>
                
                <div className="flex justify-between items-start">
                  <span className="text-white/80 flex-1">
                    Programas ({quote.programs?.length || 0})
                    {quote.apply_early_bird_discount && (
                      <span className="text-yellow-600 text-xs block sm:inline ml-0 sm:ml-2 mt-1 sm:mt-0">
                        (Descuento aplicado)
                      </span>
                    )}
                  </span>
                  <div className="text-right ml-4 flex-shrink-0">
                    {quote.apply_early_bird_discount && quote.programs?.length > 0 ? (
                      <>
                        <div className="text-xs line-through opacity-60 hidden">
                          ${(quote.programs.reduce((sum, p) => sum + p.price, 0)).toLocaleString('es-CL')} CLP
                        </div>
                        <div className="font-medium">
                          ${programCostPerPerson.toLocaleString('es-CL')} CLP
                        </div>
                      </>
                    ) : (
                      <span className="font-medium">
                        ${programCostPerPerson.toLocaleString('es-CL')} CLP
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Viáticos */}
                {quote.viaticos_display_amount && quote.viaticos_display_amount > 0 && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-white/80 text-sm sm:text-base">
                      Viáticos {quote.viaticos_type === 'daily' ? 
                        `(${quote.nights + 1} días)` : 
                        '(monto total)'}
                    </span>
                    <span className="font-medium text-sm sm:text-base whitespace-nowrap">
                      ${Math.round(quote.viaticos_display_amount / quote.num_pasantes).toLocaleString('es-CL')} CLP
                    </span>
                  </div>
                )}
                
                <div className="border-t border-white/20 pt-3 mt-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-base sm:text-xl">Total por persona</span>
                    <span className="font-bold text-lg sm:text-2xl whitespace-nowrap">
                      ${quote.total_per_person.toLocaleString('es-CL')} <span className="text-sm sm:text-lg">CLP</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Grand Total for multiple participants */}
            {quote.num_pasantes > 1 && (
              <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
                  <div>
                    <p className="font-bold text-lg sm:text-2xl">TOTAL GENERAL</p>
                    <p className="text-xs sm:text-sm opacity-80">Para {quote.num_pasantes} personas</p>
                  </div>
                  <p className="font-black text-2xl sm:text-4xl">
                    ${quote.grand_total.toLocaleString('es-CL')} <span className="text-lg sm:text-2xl">CLP</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Early Bird Discount Notice */}
        {quote.apply_early_bird_discount && (
          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-2xl p-8 mb-8 border-2 border-yellow-300">
            <div>
              <h3 className="text-xl font-bold mb-2 text-yellow-800">
                Descuento por Pago Anticipado Aplicado
              </h3>
              <p className="text-yellow-700 mb-2">
                Se ha aplicado un descuento de <strong>${(500000 * (quote.programs?.length || 0)).toLocaleString('es-CL')} CLP por persona</strong> en los programas seleccionados.
              </p>
              <p className="text-sm text-yellow-700">
                Este descuento es válido realizando el pago antes del <strong>30 de noviembre de 2025</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Additional Notes */}
        {quote.notes && (
          <div className="bg-gray-50 rounded-2xl p-8 mb-8">
            <h3 className="text-xl font-bold mb-4">Información Adicional</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* What's Included */}
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 mb-8 border">
          <h3 className="text-xl font-bold mb-6">¿Qué incluye la experiencia?</h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Codocencia en Aulas</p>
                <p className="text-sm text-gray-600">
                  Participa activamente como co-docente en escuelas innovadoras
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Visitas a Escuelas</p>
                <p className="text-sm text-gray-600">
                  Conoce las metodologías más vanguardistas de Europa
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Talleres Especializados</p>
                <p className="text-sm text-gray-600">
                  Workshops con expertos internacionales en educación
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Certificación Internacional</p>
                <p className="text-sm text-gray-600">
                  Reconocimiento oficial de tu participación y aprendizajes
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Barcelona Info */}
        <div className="bg-white border-2 border-black rounded-2xl overflow-hidden mb-8">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <MapPin className="mr-2" size={24} />
                Barcelona, España
              </h3>
              <p className="text-gray-700 mb-4">
                Vive una experiencia transformadora en una de las ciudades más innovadoras de Europa en educación.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Ciudad cosmopolita y multicultural
                </li>
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Hub de innovación educativa
                </li>
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Red de escuelas colaboradoras
                </li>
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Experiencia cultural enriquecedora
                </li>
              </ul>
            </div>
            <div className="bg-gray-100 h-64 md:h-auto flex items-center justify-center">
              <img 
                src="/barcelona-skyline.jpg" 
                alt="Barcelona" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.parentElement) {
                    e.currentTarget.parentElement.innerHTML = '<div class="text-gray-400 text-center p-8">Barcelona, España</div>';
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            type="button"
            onClick={() => generatePDF()}
            className="flex items-center justify-center px-8 py-4 bg-yellow-500 text-black rounded-full font-medium hover:bg-yellow-600 transition-all duration-300"
          >
            <Download className="mr-2" size={20} />
            Descargar PDF
          </button>
          <button
            onClick={handleContact}
            className="flex items-center justify-center px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-all duration-300"
          >
            <Mail className="mr-2" size={20} />
            Contactar para Reservar
          </button>
        </div>

        {/* Contact Info */}
        <div className="mt-12 pt-8 border-t text-center">
          <p className="text-gray-600 mb-4">¿Tienes preguntas? Contáctanos:</p>
          <div className="flex justify-center items-center">
            <a href="mailto:info@nuevaeducacion.org" className="flex items-center text-black hover:underline">
              <Mail className="mr-2" size={18} />
              info@nuevaeducacion.org
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-8 mt-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="mb-2">© 2025 Fundación Nueva Educación</p>
          <p className="text-white/60 text-sm">Transformando la educación, un viaje a la vez</p>
        </div>
      </footer>
    </div>
  );
}
