import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Register fonts (optional - you can use default fonts)
// Font.register({
//   family: 'Roboto',
//   src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf'
// });

interface ContractPDFProps {
  contractData: {
    numero_contrato: string;
    fecha_contrato: string;
    precio_total_uf: number;
    cliente: {
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
    };
    programa: {
      nombre: string;
      descripcion: string;
      horas_totales: number;
      modalidad: string;
    };
    cuotas: Array<{
      numero_cuota: number;
      fecha_vencimiento: string;
      monto_uf: number;
    }>;
  };
}

// Define styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 30,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
    textAlign: 'center',
  },
  title: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: 'bold',
    color: '#1a365d', // brand_blue equivalent
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 5,
    fontWeight: 'bold',
    color: '#1a365d',
  },
  body: {
    fontSize: 11,
    lineHeight: 1.6,
    textAlign: 'justify',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1a365d',
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000000',
    marginBottom: 10,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#f8f9fa',
    padding: 5,
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000000',
    padding: 5,
  },
  tableCellHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableCell: {
    fontSize: 9,
    textAlign: 'center',
  },
  signature: {
    marginTop: 40,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
    textAlign: 'center',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    marginBottom: 5,
    height: 30,
  },
  signatureText: {
    fontSize: 10,
    marginBottom: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    fontSize: 8,
    color: '#666666',
  },
});

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return date.toLocaleDateString('es-ES', options);
};

const formatCurrency = (amount: number): string => {
  return `UF ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function ContractPDF({ contractData }: ContractPDFProps) {
  const { numero_contrato, fecha_contrato, precio_total_uf, cliente, programa, cuotas } = contractData;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>CONTRATO DE PRESTACIÓN DE SERVICIOS</Text>
          <Text style={styles.subtitle}>FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)</Text>
          <Text style={styles.subtitle}>Y</Text>
          <Text style={styles.subtitle}>{cliente.nombre_legal.toUpperCase()}</Text>
        </View>

        {/* Contract Introduction */}
        <View style={styles.section}>
          <Text style={styles.body}>
            En Santiago de Chile, a {formatDate(fecha_contrato)}, entre {cliente.nombre_legal}, 
            Rol Único Tributario número {cliente.rut}, representada por {cliente.nombre_representante}
            {cliente.rut_representante && `, cédula nacional de identidad número ${cliente.rut_representante}`}, 
            todos con domicilio para estos efectos en {cliente.direccion}, comuna de {cliente.comuna}, 
            {cliente.ciudad}, en adelante e indistintamente como "{cliente.nombre_fantasia}" por una parte, 
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN), Rol Único Tributario número 65.166.503-5, 
            representada por don Arnoldo Cisternas Chávez, cédula nacional de identidad número 10.740.623-9, 
            ambos domiciliados para estos efectos calle Carlos Silva Vildósola n° 10448, comuna de La Reina, 
            en adelante indistintamente como "FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)"; se ha convenido 
            el siguiente contrato de prestación de servicios:
          </Text>
        </View>

        {/* Clause 1: Background */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIMERO: Antecedentes.</Text>
          <Text style={styles.body}>
            La {cliente.nombre_legal}, con personalidad jurídica y patrimonio propio, cuya finalidad 
            es entregar una educación cristiana, inclusiva y de excelencia a todos sus estudiantes. 
            Por su parte, FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) es una fundación cuyo 
            objetivo es la prestación de servicios de asesoría, consultoría e investigación y 
            desarrollo de políticas públicas en materias de educación, psicología social, 
            desarrollo social y desarrollo sustentable.
          </Text>
        </View>

        {/* Clause 2: Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SEGUNDO: Servicios Contratados</Text>
          <Text style={styles.body}>
            La FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) viene a implementar para el año 2025 
            el programa {programa.nombre.toUpperCase()} a los miembros seleccionados por el equipo de gestión de 
            la comunidad educativa del {cliente.nombre_fantasia}, perteneciente a {cliente.nombre_legal}.
          </Text>
          <Text style={styles.body}>
            El {cliente.nombre_fantasia}, en consecuencia y por el presente instrumento, viene a contratar 
            los servicios de la FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN), a fin de que ejecute 
            la capacitación y asesoría del Programa {programa.nombre.toUpperCase()}.
          </Text>
          <Text style={styles.body}>
            Para la realización del programa antes referido, la FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) 
            utilizará el personal de su exclusiva subordinación y dependencia, idóneo que sea necesario. 
            La calificación de la idoneidad de tal personal corresponderá exclusivamente a la FUNDACIÓN 
            INSTITUTO RELACIONAL (NUEVA EDUCACIÓN).
          </Text>
        </View>

        {/* Clause 3: Price and Payment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TERCERO: Precio y Forma Pago</Text>
          <Text style={styles.body}>
            Las Partes acuerdan que {cliente.nombre_legal} pagará a FUNDACIÓN INSTITUTO RELACIONAL 
            (NUEVA EDUCACIÓN) la suma total de {formatCurrency(precio_total_uf)} correspondiente 
            al total del programa.
          </Text>
          <Text style={styles.body}>
            Para los efectos del pago de los servicios, FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) 
            emitirá una factura por los montos previamente definidos en este contrato y/o en los Anexos 
            que se acordaren, los que se pagarán en el plazo acordado por ambas partes. El pago se realizará 
            en {cuotas.length} cuotas, detalladas a continuación:
          </Text>
        </View>

        {/* Payment Schedule Table */}
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>Nº</Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>Fecha</Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>Monto</Text>
            </View>
          </View>
          {cuotas.map((cuota) => (
            <View style={styles.tableRow} key={cuota.numero_cuota}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{cuota.numero_cuota}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{formatDate(cuota.fecha_vencimiento)}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{formatCurrency(cuota.monto_uf)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Payment Terms Continued */}
        <View style={styles.section}>
          <Text style={styles.body}>
            En el evento que el {cliente.nombre_fantasia} no diese cumplimiento a su obligación de pago 
            de los servicios prestados por FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) podrá suspender 
            de inmediato el servicio prestado hasta que el pago sea realizado, sin perjuicio de su derecho 
            a poner término al presente contrato. Lo anterior, sin perjuicio que las partes acuerden una 
            prórroga en el plazo señalado.
          </Text>
          <Text style={styles.body}>
            Por otro lado, las partes acuerdan que en el evento que el {cliente.nombre_fantasia} decida 
            proponer una modificación en los servicios acordados, éste deberá informar a la FUNDACIÓN 
            INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) con no menos de una semana de anticipación a la 
            verificación de la modificación propuesta.
          </Text>
        </View>
      </Page>

      {/* Second Page */}
      <Page size="A4" style={styles.page}>
        {/* Clause 4: Additional Participants */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CUARTO: Adición de participantes o bloques de asesoría</Text>
          <Text style={styles.body}>
            Si el colegio desea agregar destinatarios al programa, podrá hacerlo mediante anexo de contrato, 
            sin extender la fecha de término. El monto adicional será acordado y estipulado en dicho anexo.
          </Text>
          <Text style={styles.body}>
            Si el colegio desea agregar horas de formación/asesoría o visitas técnicas, esto podrá realizarse 
            mediante anexo de contrato, sin extender la fecha de término. El monto adicional será acordado 
            y estipulado en dicho anexo.
          </Text>
        </View>

        {/* Clause 5: Cancellations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QUINTO: Con respecto a la cancelación de horas y/o jornadas de asesoría/formación:</Text>
          <Text style={styles.body}>
            1. Las horas de asesoría/formación online canceladas con al menos 48 horas de anticipación deberán 
            ser reagendadas dentro de la siguiente semana para ser ejecutadas de acuerdo a la disponibilidad 
            del equipo de la FUNDACIÓN NUEVA EDUCACIÓN dentro de los siguientes 30 días.
          </Text>
          <Text style={styles.body}>
            2. Las horas de asesoría/formación online canceladas con menos de 48 horas de anticipación se 
            considerarán como realizadas.
          </Text>
          <Text style={styles.body}>
            3. Las horas de asesoría/formación presencial canceladas por el colegio con al menos 2 semanas 
            de anticipación podrán ser recuperadas online según disponibilidad del equipo de la FUNDACIÓN 
            NUEVA EDUCACIÓN dentro de los siguiente 30 días.
          </Text>
          <Text style={styles.body}>
            4. Las horas de asesoría/formación presencial canceladas con menos de 2 semanas de anticipación 
            se considerarán como realizadas.
          </Text>
          <Text style={styles.body}>
            5. En caso de cancelaciones por fuerza mayor las sesiones serán reprogramadas según disponibilidad 
            de la FUNDACIÓN NUEVA EDUCACIÓN, asegurando su realización dentro de los siguiente 30 días.
          </Text>
        </View>

        {/* Clause 6: Relationship */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SEXTO: Relación entre las partes</Text>
          <Text style={styles.body}>
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) declara ser una fundación sin fines de lucro, 
            autónoma e independiente y nada en este contrato se interpretará como constitutivo de una relación 
            societaria entre las partes ni de ninguna otra naturaleza que la contenida en el presente contrato, 
            por lo que FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) actúa por su exclusiva cuenta y riesgo.
          </Text>
        </View>

        {/* Clause 7: Obligations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SÉPTIMO: Obligaciones de las partes.</Text>
          <Text style={styles.body}>
            Para la ejecución y el cumplimiento de los objetivos del presente convenio, las partes se obligan 
            a lo siguiente:
          </Text>
          <Text style={[styles.body, { fontWeight: 'bold', marginTop: 10 }]}>
            {cliente.nombre_legal}
          </Text>
          <Text style={styles.body}>
            1. Pagar oportunamente las cuotas en las fechas establecidas del presente convenio.
            {'\n'}2. Disponer de una persona que se responsabilice por los pagos y actúe como contraparte.
            {'\n'}3. Facilitar los medios necesarios para llevar a cabo las tareas contratadas.
          </Text>
        </View>
      </Page>

      {/* Third Page */}
      <Page size="A4" style={styles.page}>
        {/* Continuing Obligations */}
        <View style={styles.section}>
          <Text style={[styles.body, { fontWeight: 'bold' }]}>
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)
          </Text>
          <Text style={styles.body}>
            1. Entregar capacitación y material para la implementación del programa.
            {'\n'}2. Apoyar y acompañar a los docentes y al equipo directivo.
            {'\n'}3. Realizar reuniones con equipos directivos del establecimiento educacional.
            {'\n'}4. Corresponde única y exclusivamente a FUNDACIÓN INSTITUTO RELACIONAL el pago de 
            remuneraciones, cotizaciones previsionales y demás prestaciones laborales.
          </Text>
        </View>

        {/* Remaining clauses continue in similar format... */}
        
        {/* Signatures */}
        <View style={styles.signature}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine}></View>
            <Text style={[styles.signatureText, { fontWeight: 'bold' }]}>
              {cliente.nombre_representante.toUpperCase()}
            </Text>
            <Text style={styles.signatureText}>p.p. {cliente.nombre_legal}</Text>
          </View>
          
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine}></View>
            <Text style={[styles.signatureText, { fontWeight: 'bold' }]}>
              ARNOLDO CISTERNAS CHÁVEZ
            </Text>
            <Text style={styles.signatureText}>p.p Representante Legal FUNDACIÓN NUEVA EDUCACIÓN</Text>
          </View>
        </View>

        {/* Legal Authorization Footer */}
        <View style={styles.footer}>
          {cliente.fecha_escritura && cliente.nombre_notario && cliente.comuna_notaria && (
            <Text>
              La personería de {cliente.nombre_representante} para representar a {cliente.nombre_legal} consta 
              en la Escritura Pública del {formatDate(cliente.fecha_escritura)} suscrita ante {cliente.nombre_notario}, 
              notario público {cliente.comuna_notaria}.
            </Text>
          )}
          <Text style={{ marginTop: 10 }}>
            La personería de don Arnoldo Cisternas Chávez, para actuar en representación de FUNDACIÓN INSTITUTO 
            RELACIONAL (NUEVA EDUCACIÓN), consta en los "Estatutos Fundación Instituto Relacional" otorgados 
            por la Municipalidad de la Reina con fecha 08 de marzo del año 2018.
          </Text>
        </View>
      </Page>
    </Document>
  );
}