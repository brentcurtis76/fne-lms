/**
 * Minimal type declarations for the `docx` package.
 * These stubs allow TypeScript compilation before `npm install docx` is run.
 * Once docx is installed, these declarations are superseded by the package's own types.
 * Run: npm install docx
 */

declare module 'docx' {
  export class Document {
    constructor(options: Record<string, unknown>);
  }
  export class Packer {
    static toBuffer(doc: Document): Promise<Buffer>;
    static toBlob(doc: Document): Promise<Blob>;
  }
  export class Paragraph {
    constructor(options: Record<string, unknown>);
  }
  export class TextRun {
    constructor(options: Record<string, unknown>);
  }
  export class Table {
    constructor(options: Record<string, unknown>);
  }
  export class TableRow {
    constructor(options: Record<string, unknown>);
  }
  export class TableCell {
    constructor(options: Record<string, unknown>);
  }
  export class Header {
    constructor(options: Record<string, unknown>);
  }
  export const HeadingLevel: {
    HEADING_1: string;
    HEADING_2: string;
    HEADING_3: string;
    HEADING_4: string;
  };
  export const AlignmentType: {
    CENTER: string;
    LEFT: string;
    RIGHT: string;
    JUSTIFIED: string;
  };
  export const WidthType: {
    PERCENTAGE: string;
    DXA: string;
    AUTO: string;
    NIL: string;
  };
  export const BorderStyle: {
    SINGLE: string;
    THICK: string;
    DOUBLE: string;
    NONE: string;
  };
  export const ShadingType: {
    SOLID: string;
    CLEAR: string;
  };
  export const NumberFormat: {
    BULLET: string;
    DECIMAL: string;
  };
}
