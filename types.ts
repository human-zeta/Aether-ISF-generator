
export enum ISFInputType {
  FLOAT = 'float',
  LONG = 'long', // integer in ISF usually maps to long or int logic
  BOOL = 'bool',
  POINT2D = 'point2D',
  COLOR = 'color',
  IMAGE = 'image', // Not fully supported in this web preview, but parsed
}

export interface ISFInput {
  NAME: string;
  TYPE: string;
  LABEL?: string;
  DEFAULT?: any;
  MIN?: number;
  MAX?: number;
  VALUES?: any[]; // For select dropdowns (long)
  LABELS?: string[];
}

export interface ISFMetadata {
  DESCRIPTION?: string;
  CREDIT?: string;
  ISFVSN?: string;
  INPUTS: ISFInput[];
}

export interface ParsedShader {
  rawCode: string;
  metadata: ISFMetadata | null;
  fragmentBody: string;
  error?: string;
}

export interface UniformValues {
  [key: string]: number | boolean | number[] | string;
}

export type TextureFilter = 'LINEAR' | 'NEAREST';
export type TextureWrap = 'REPEAT' | 'CLAMP_TO_EDGE';

export interface TextureSettings {
    [key: string]: {
        filter: TextureFilter;
        wrap: TextureWrap;
    };
}

export interface SavedShader {
  id: string;
  name: string;
  code: string;
  timestamp: number;
  thumbnail?: string;
}
