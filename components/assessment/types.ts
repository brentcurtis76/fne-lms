import { IndicatorCategory, FrequencyUnit } from '@/types/assessment-builder';

export interface IndicatorData {
  id: string;
  code?: string;
  name: string;
  description?: string;
  category: IndicatorCategory;
  frequencyConfig?: {
    type: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  };
  frequencyUnitOptions?: FrequencyUnit[];
  level0Descriptor?: string;
  level1Descriptor?: string;
  level2Descriptor?: string;
  level3Descriptor?: string;
  level4Descriptor?: string;
  detalle_options?: string[];
  displayOrder: number;
  weight: number;
  /** R11: Whether this indicator has an active expectation for the instance's year. */
  isActiveThisYear?: boolean;
}

export interface ModuleData {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  displayOrder: number;
  weight: number;
  objectiveId?: string;
  indicators: IndicatorData[];
}

export interface ObjectiveData {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  weight: number;
  modules: ModuleData[];
}

export interface ResponseData {
  id?: string;
  coverageValue?: boolean;
  frequencyValue?: number;
  frequencyUnit?: FrequencyUnit;
  profundityLevel?: number;
  rationale?: string;
  evidenceNotes?: string;
  subResponses?: Record<string, unknown>;
}
