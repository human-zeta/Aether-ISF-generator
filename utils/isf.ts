import { ParsedShader, ISFMetadata, ISFInput } from '../types';

export const parseISF = (code: string): ParsedShader => {
  let metadata: ISFMetadata | null = null;
  const jsonRegex = /\/\*([\s\S]*?)\*\//;
  const match = code.match(jsonRegex);

  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (typeof parsed === 'object') metadata = parsed as ISFMetadata;
    } catch (e) {
      console.warn("ISF Header Parse Error", e);
    }
  }

  return { rawCode: code, metadata, fragmentBody: code };
};

export const generateWebGLPreamble = (metadata: ISFMetadata | null): string => {
  let preamble = `
    precision mediump float;
    uniform float TIME;
    uniform int PASSINDEX;
    uniform vec4 DATE;
    uniform vec2 RENDERSIZE;
    uniform vec2 MOUSE;
    uniform float AUDIO_VOL;
    uniform vec2 TILT;
    uniform sampler2D AUDIO_SPECTRUM;
    
    // VDMX / ISF Standard Macros & Compatibility
    #define isf_FragNormCoord (gl_FragCoord.xy / RENDERSIZE)
    #define vv_FragNormCoord isf_FragNormCoord
    
    // Image sampling macros - Robust .xy selection
    #define IMG_NORM_PIXEL(sampler, coord) texture2D(sampler, coord)
    #define IMG_THIS_PIXEL(sampler) texture2D(sampler, isf_FragNormCoord)
    #define IMG_PIXEL(sampler, coord) texture2D(sampler, (coord).xy / RENDERSIZE)
    
    // Math Utilities
    #ifndef PI
    #define PI 3.14159265359
    #endif

    #ifndef TWO_PI
    #define TWO_PI 6.28318530718
    #endif

    #ifndef HALF_PI
    #define HALF_PI 1.57079632679
    #endif
    
    // Note: 'rot' macro removed to avoid collisions with user-defined functions
  `;

  if (metadata?.INPUTS) {
    const reserved = ['TIME', 'PASSINDEX', 'RENDERSIZE', 'DATE', 'MOUSE', 'AUDIO_VOL', 'TILT', 'AUDIO_SPECTRUM'];
    metadata.INPUTS.forEach((input: ISFInput) => {
      if (reserved.includes(input.NAME)) return;
      if (input.TYPE === 'float') preamble += `uniform float ${input.NAME};\n`;
      else if (input.TYPE === 'bool') preamble += `uniform bool ${input.NAME};\n`; 
      else if (input.TYPE === 'long') preamble += `uniform int ${input.NAME};\n`; 
      else if (input.TYPE === 'point2D') preamble += `uniform vec2 ${input.NAME};\n`;
      else if (input.TYPE === 'color') preamble += `uniform vec4 ${input.NAME};\n`;
      else if (input.TYPE === 'image') preamble += `uniform sampler2D ${input.NAME};\n`;
      else if (input.TYPE === 'event') preamble += `uniform bool ${input.NAME};\n`; // Handle events as bools
    });
  }

  return preamble;
};

export const cleanISFCode = (code: string): string => {
    let clean = code;
    
    // Remove #version directives (WebGL 1.0 does not support them in the way modern GLSL does, or conflicts with preamble)
    clean = clean.replace(/^\s*#version\s+.*$/gm, '// #version removed for WebGL 1.0 compatibility');

    // Remove precision declarations (handled in preamble)
    clean = clean.replace(/^\s*precision\s+\w+\s+float\s*;/gm, '');
    
    // Remove built-in uniforms that we provide
    const reserved = ['TIME', 'RENDERSIZE', 'MOUSE', 'AUDIO_VOL', 'TILT', 'AUDIO_SPECTRUM', 'PASSINDEX'];
    reserved.forEach(u => {
        const re = new RegExp(`^\\s*uniform\\s+\\w+\\s+${u}\\s*;`, 'gm');
        clean = clean.replace(re, '');
    });

    // Remove const/define PI collisions which cause "syntax error" when macro expands 'const float 3.14...'
    clean = clean.replace(/^\s*#define\s+(PI|TWO_PI|HALF_PI)\s+.*$/gm, '// $1 macro removed (predefined)');
    clean = clean.replace(/^\s*const\s+float\s+(PI|TWO_PI|HALF_PI)\s*=.*$/gm, '// $1 const removed (predefined)');

    return clean;
};