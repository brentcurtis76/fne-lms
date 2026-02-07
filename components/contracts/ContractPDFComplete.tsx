import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

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
    color: '#1a365d',
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
    marginBottom: 8,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a365d',
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000000',
    marginBottom: 15,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '33.33%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#f8f9fa',
    padding: 5,
  },
  tableCol: {
    width: '33.33%',
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
    marginTop: 30,
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
    lineHeight: 1.4,
  },
  listItem: {
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 5,
    textAlign: 'justify',
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
  return `$${amount.toLocaleString('es-CL')}`;
};

export default function ContractPDFComplete({ contractData }: ContractPDFProps) {
  const { numero_contrato, fecha_contrato, precio_total_uf, cliente, programa, cuotas } = contractData;

  return (
    <Document>
      {/* PAGE 1 */}
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
            {cliente.ciudad}, en adelante e indistintamente como &quot;{cliente.nombre_fantasia}&quot; por una parte,
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN), Rol Único Tributario número 65.166.503-5,
            representada por don Arnoldo Cisternas Chávez, cédula nacional de identidad número 10.740.623-9,
            ambos domiciliados para estos efectos calle Carlos Silva Vildósola n° 10448, comuna de La Reina,
            en adelante indistintamente como &quot;FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)&quot;; se ha convenido 
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

      {/* PAGE 2 */}
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
          <Text style={styles.listItem}>
            1. Las horas de asesoría/formación online canceladas con al menos 48 horas de anticipación deberán 
            ser reagendadas dentro de la siguiente semana para ser ejecutadas de acuerdo a la disponibilidad 
            del equipo de la FUNDACIÓN NUEVA EDUCACIÓN dentro de los siguientes 30 días.
          </Text>
          <Text style={styles.listItem}>
            2. Las horas de asesoría/formación online canceladas con menos de 48 horas de anticipación se 
            considerarán como realizadas.
          </Text>
          <Text style={styles.listItem}>
            3. Las horas de asesoría/formación presencial canceladas por el colegio con al menos 2 semanas 
            de anticipación podrán ser recuperadas online según disponibilidad del equipo de la FUNDACIÓN 
            NUEVA EDUCACIÓN dentro de los siguiente 30 días. Si el colegio quisiera recuperarlas de manera 
            presencial y el equipo de la FNE tiene agenda disponible, los gastos de traslado y alojamiento 
            deberán ser asumidos por el colegio para las horas/jornadas a ser recuperadas.
          </Text>
          <Text style={styles.listItem}>
            4. Las horas de asesoría/formación presencial canceladas con menos de 2 semanas de anticipación 
            se considerarán como realizadas.
          </Text>
          <Text style={styles.listItem}>
            5. En caso de cancelaciones por fuerza mayor (detallados en el punto Décimo Tercero) las sesiones 
            serán reprogramadas según disponibilidad de la FUNDACIÓN NUEVA EDUCACIÓN, asegurando su realización 
            dentro de los siguiente 30 días.
          </Text>
          <Text style={styles.listItem}>
            6. Si la cancelación de las horas/jornadas agendadas es por parte de la FUNDACIÓN NUEVA EDUCACIÓN, 
            las sesiones deberán ser reagendadas dentro de los 7 días siguientes, para ser realizadas dentro 
            de los siguientes 30 días, según la disponibilidad de ambas partes. En caso de que no se pueda 
            encontrar una fecha la recuperación de dichas horas no podrá extenderse más allá de la fecha de 
            término del contrato. Los costos incurridos para efectuar la recuperación serán de responsabilidad 
            de la FUNDACIÓN NUEVA EDUCACIÓN.
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
            En consecuencia, se deja expresa constancia que ni FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN), 
            ni el personal que éste destine a la ejecución de las labores propias de los servicios que le presta 
            a {cliente.nombre_fantasia} y a que se refiere este contrato, se encuentra sujeto a subordinación o 
            dependencia alguna de {cliente.nombre_fantasia}.
          </Text>
        </View>
      </Page>

      {/* PAGE 3 */}
      <Page size="A4" style={styles.page}>
        {/* Clause 7: Obligations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SÉPTIMO: Obligaciones de las partes.</Text>
          <Text style={styles.body}>
            Para la ejecución y el cumplimiento de los objetivos del presente convenio, las partes se obligan 
            a lo siguiente:
          </Text>
          
          <Text style={[styles.body, { fontWeight: 'bold', marginTop: 10, marginBottom: 5 }]}>
            {cliente.nombre_legal}
          </Text>
          <Text style={styles.listItem}>
            1. Pagar oportunamente las cuotas en las fechas establecidas del presente convenio a la FUNDACIÓN 
            INSTITUTO RELACIONAL (NUEVA EDUCACIÓN).
          </Text>
          <Text style={styles.listItem}>
            2. Disponer de una persona que se responsabilice por los pagos y actúe como contraparte del área 
            de finanzas y gestión de la Fundación.
          </Text>
          <Text style={styles.listItem}>
            3. Disponer de una persona encargada de la comunicación continúa con el área de implementación 
            de la Fundación.
          </Text>
          <Text style={styles.listItem}>
            4. Participar y coordinar las acciones entre el establecimiento y la Fundación, dentro de los 
            márgenes del convenio.
          </Text>
          <Text style={styles.listItem}>
            5. Facilitar a FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) los medios necesarios para 
            llevar a cabo las tareas contratadas.
          </Text>
          <Text style={styles.listItem}>
            6. Disponer de horarios y lugar físico para las reuniones entre la coordinadora del programa 
            y el equipo directivo.
          </Text>
          <Text style={styles.listItem}>
            7. El personal de FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) que se desempeñe en labores 
            propias del programa {programa.nombre.toUpperCase()}, no queda ni podrá quedar sujeto a la 
            supervigilancia, subordinación ni dependencia de ningún trabajador de {cliente.nombre_legal}.
          </Text>

          <Text style={[styles.body, { fontWeight: 'bold', marginTop: 15, marginBottom: 5 }]}>
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)
          </Text>
          <Text style={styles.listItem}>
            1. Entregar a los docentes, capacitación y material para la inmersión, diseño, implementación, 
            evaluación y sistematización del programa {programa.nombre.toUpperCase()}.
          </Text>
          <Text style={styles.listItem}>
            2. Apoyar y acompañar a los docentes y al equipo directivo, para lograr una exitosa implementación 
            del programa.
          </Text>
          <Text style={styles.listItem}>
            3. Realizar reuniones con equipos directivos del establecimiento educacional para facilitar la 
            instalación de capacidades y crear un espacio de trabajo técnico pedagógico. El acompañamiento 
            a los docentes y al equipo directivo podrá ser realizado tanto de manera presencial como virtual, 
            según lo acuerden las partes. En el caso de que las medidas sanitarias vigentes o cualquier otra 
            circunstancia imprevista así lo requieran, todas las actividades de acompañamiento podrán 
            desarrollarse de manera completa en modalidad virtual, asegurando la continuidad y calidad del 
            programa sin interrupciones.
          </Text>
          <Text style={styles.listItem}>
            4. Corresponde única y exclusivamente a FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) el pago 
            de las remuneraciones, gratificaciones, cotizaciones previsionales y de salud (A.F.P, Isapre o 
            FONASA, AFC Chile), las retenciones, pagos tributarios y demás prestaciones laborales a que haya lugar.
          </Text>
        </View>
      </Page>

      {/* PAGE 4 */}
      <Page size="A4" style={styles.page}>
        {/* Clause 8: Confidentiality */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OCTAVO: Confidencialidad</Text>
          <Text style={styles.body}>
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) expresamente asume la obligación de guardar 
            confidencialidad, respecto de toda la información de {cliente.nombre_legal} o sus dependientes, 
            que sea de su propiedad o que mantenga en sus dependencias. En este sentido se obliga la FUNDACIÓN 
            INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) a guardar esta confidencialidad y declara no hacer uso de 
            dicha información bajo ningún aspecto. La {cliente.nombre_legal} se obliga a idéntico deber de 
            confidencialidad respecto de FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) o sus dependientes. 
            Lo anterior, sin perjuicio de la información cuya transmisión o difusión sea necesaria para la 
            ejecución del contrato o requerida por las autoridades competentes.
          </Text>
        </View>

        {/* Clause 9: Guarantees */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOVENO: Garantías de FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN)</Text>
          <Text style={styles.body}>
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) garantiza a {cliente.nombre_legal} lo siguiente:
          </Text>
          <Text style={styles.listItem}>
            a. La aceptación de FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) a realizar el servicio de 
            conformidad con este Contrato, la cual no viola ningún contrato u obligación FUNDACIÓN INSTITUTO 
            RELACIONAL (NUEVA EDUCACIÓN) y un tercero;
          </Text>
          <Text style={styles.listItem}>
            b. El cumplimiento de todas las leyes y regulaciones que sean aplicables a la ejecución de este 
            contrato, incluyendo las leyes laborales y tributarias; y
          </Text>
          <Text style={styles.listItem}>
            c. Proveer del personal idóneo que sea necesario, de acuerdo con lo especificado en la cláusula 
            segunda, para la realización del programa. Dicho personal será seleccionado, capacitado y contratado 
            por FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) y laborará bajo su exclusiva dependencia y 
            subordinación.
          </Text>
          <Text style={styles.listItem}>
            d. El cumplimiento de los requisitos estipulados en el presente contrato o en los anexos que se 
            acuerden.
          </Text>
        </View>

        {/* Clause 10: Responsibilities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCIMO: Responsabilidades.</Text>
          <Text style={styles.body}>
            FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) será responsable, conforme a las reglas generales 
            de la responsabilidad contractual, por la infracción a sus obligaciones asumidas en el presente 
            contrato; en particular, a su obligación de prestar los servicios contratados; a su obligación de 
            dar cumplimiento a las obligaciones laborales, tributarias y de seguridad social con sus propios 
            trabajadores, y a las obligaciones expresamente señaladas en este contrato o sus anexos.
          </Text>
          <Text style={styles.body}>
            Por su parte, {cliente.nombre_legal} será responsable conforme a las reglas generales de la 
            responsabilidad contractual por la infracción a sus obligaciones asumidas en el presente contrato; 
            en particular, a su obligación de pagar por los servicios prestados, y a las obligaciones 
            expresamente señaladas en este instrumento o sus anexos.
          </Text>
        </View>

        {/* Clause 11: Duration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCIMO PRIMERO: Vigencia y terminación</Text>
          <Text style={styles.body}>
            Este contrato regirá a partir de esta fecha y tendrá duración según lo acordado por las partes 
            para la ejecución completa del programa contratado.
          </Text>
          <Text style={styles.body}>
            Con todo, cualquiera de las partes podrá en todo momento poner término al presente contrato, 
            debiendo previamente notificar a la otra parte de su intención, por medio de una carta certificada 
            con a lo menos 30 días de anticipación a la fecha de término, sin necesidad de invocar motivo, 
            causal o razón alguna.
          </Text>
          <Text style={styles.body}>
            Sin perjuicio de lo anterior, las partes podrán poner término a este Contrato inmediatamente en 
            cualquier momento si cualquiera de ellas viola alguna de las disposiciones contenidas en este 
            contrato, procediendo además la indemnización de los perjuicios causados a la parte cumplidora.
          </Text>
        </View>
      </Page>

      {/* PAGE 5 */}
      <Page size="A4" style={styles.page}>
        {/* Clause 12: Dispute Resolution */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCIMO SEGUNDO: Solución de controversias.</Text>
          <Text style={styles.body}>
            Cualquier dificultad o controversia que se produzca entre los contratantes respecto de la aplicación, 
            interpretación, duración, validez o ejecución de este contrato o cualquier otro motivo será sometida 
            a la jurisdicción de los tribunales ordinarios de justicia de la ciudad Santiago, fijando para 
            dichos efectos domicilio en la ciudad indicada.
          </Text>
        </View>

        {/* Clause 13: Force Majeure */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCIMO TERCERO: Fuerza mayor.</Text>
          <Text style={styles.body}>
            Las partes contratantes quedarán exentas de responsabilidad por cualquier incumplimiento que se 
            deba a un caso de fuerza mayor. Para tal efecto, se considerarán, como casos de fuerza mayor, 
            entre otros que sean de similar naturaleza, los siguientes: reglamento u otra norma de Gobierno; 
            guerra, conmoción, naufragio, terremoto, inundación, otros actos de la naturaleza, y cualquier 
            otro señalado en el artículo 45 del Código Civil, que impida o demore el cumplimiento de las 
            obligaciones pactadas, no obstante, la parte afectada haya empleado la máxima diligencia.
          </Text>
          <Text style={styles.body}>
            Si ocurrieran tales circunstancias, la parte afectada informará a la otra, sin demora y por escrito, 
            la existencia del hecho, como tal hecho afectará al cumplimiento del Contrato, y la duración de este, 
            procediendo de la misma manera para informar del término de tal hecho y, en ambos casos, acompañando 
            los documentos justificativos correspondientes.
          </Text>
          <Text style={styles.body}>
            Tan pronto como los hechos constitutivos de fuerza mayor hubieran cesado en sus efectos, las Partes 
            iniciarán o continuarán el cumplimiento de sus obligaciones afectadas.
          </Text>
        </View>

        {/* Clause 14: Contract Domicile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCIMO CUARTO: Domicilio del Contrato</Text>
          <Text style={styles.body}>
            Para todos los efectos legales, la FUNDACIÓN INSTITUTO RELACIONAL (NUEVA EDUCACIÓN) fija su 
            domicilio en la ciudad de Santiago y la comuna de La Reina. La {cliente.nombre_legal} fija su 
            domicilio en la ciudad de {cliente.ciudad} y la comuna de {cliente.comuna}.
          </Text>
        </View>

        {/* Clause 15: Copies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCIMO QUINTO: Ejemplares</Text>
          <Text style={styles.body}>
            El presente contrato se firma en dos ejemplares, quedando uno en poder de cada una de las partes.
          </Text>
        </View>

        {/* Clause 16: Legal Authorization */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCIMO SEXTO: Personerías.</Text>
          {cliente.fecha_escritura && cliente.nombre_notario && cliente.comuna_notaria && (
            <Text style={styles.body}>
              La personería de {cliente.nombre_representante} para representar a {cliente.nombre_legal} consta 
              en la Escritura Pública del {formatDate(cliente.fecha_escritura)} suscrita ante {cliente.nombre_notario}, 
              notario público {cliente.comuna_notaria}.
            </Text>
          )}
          <Text style={styles.body}>
            La personería de don Arnoldo Cisternas Chávez, para actuar en representación de FUNDACIÓN INSTITUTO 
            RELACIONAL (NUEVA EDUCACIÓN), consta en los &quot;Estatutos Fundación Instituto Relacional&quot; otorgados 
            por la Municipalidad de la Reina con fecha 08 de marzo del año 2018.
          </Text>
        </View>

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
      </Page>
    </Document>
  );
}