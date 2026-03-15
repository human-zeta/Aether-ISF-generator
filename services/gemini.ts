import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { cleanISFCode } from "../utils/isf";

const SYSTEM_INSTRUCTION = `
You are a specialized GLSL Shader Generator for VDMX6 using the ISF 2.0 standard.

TARGET SPECIFICATIONS:
1. **Format**: Valid ISF 2.0 file. Must start with a JSON header inside \`/* ... */\` followed by the GLSL code.
2. **GLSL Version**: GLSL ES 1.00 (WebGL 1.0) compatible.
   - **NO** \`#version\` directives.
   - Use \`texture2D\`, NOT \`texture\`.
   - Use \`gl_FragColor\` for output.
   - Use \`varying\` / \`attribute\`, NOT \`in\` / \`out\`.
3. **ISF Built-ins**:
   - Do **NOT** declare the following uniforms (they are automatic): \`TIME\`, \`TIMEDELTA\`, \`RENDERSIZE\`, \`PASSINDEX\`, \`DATE\`, \`AUDIO_VOL\`, \`AUDIO_SPECTRUM\`.
   - Use \`isf_FragNormCoord\` (macro) or \`gl_FragCoord.xy / RENDERSIZE\` for UVs.
4. **Inputs**:
   - Define parameters in the JSON "INPUTS" array.
   - Types: "float", "bool", "long" (for dropdowns), "point2D", "color", "image".
5. **Math/Macros**:
   - Do **NOT** #define PI, TWO_PI, HALF_PI (ISF environment typically defines these, or they cause conflicts).
6. **Passes**: Single-pass only. Do NOT use multi-pass or persistent buffer logic (e.g., PASSES array in JSON), as this is crucial for VDMX compatibility and the web preview.

CREATIVE DIRECTION:
- Create visually stunning, generative, or audio-reactive visuals.
- If an image is provided, replicate its style procedurally.

OUTPUT FORMAT:
- Return **ONLY** the raw shader code (JSON + GLSL). No markdown fences, no explanations.
`;

const REPAIR_INSTRUCTION = `
You are an ISF/GLSL Repair System for VDMX6.

TASK:
Fix the provided ISF shader code to ensure it compiles and runs in a WebGL 1.0 / VDMX6 environment.

RULES:
1. **Preserve Visual Intent**: Do not change the look unless it's broken.
2. **Syntax Fixes**:
   - Convert GLSL 3.0+ to ES 1.00 (e.g., \`texture\` -> \`texture2D\`, \`out\` -> \`gl_FragColor\`).
   - Remove \`#version\`.
   - Fix missing semicolons or type mismatches.
   - **CRITICAL**: WebGL 1.0 does NOT support \`mat2(float, float, float, float)\` or similar constructors with individual floats if it expects vectors, or vice versa depending on the specific error. If you see a \`mat2\` constructor error, ensure it's constructed correctly for WebGL 1.0 (e.g., \`mat2(vec2(a, b), vec2(c, d))\` or \`mat2(a, b, c, d)\` depending on what the compiler is complaining about. Usually, \`mat2(a, b, c, d)\` is valid in WebGL 1.0, but if an error says "constructor not supported for type", check the argument types).
   - **CRITICAL**: If the error is about macro redefinition (e.g., \`"PI" redefined\`), remove the \`#define PI\` or \`#define TWO_PI\` from the shader code, as the environment already provides them.
3. **ISF Compliance**:
   - Ensure valid JSON header.
   - Remove declarations of standard ISF uniforms (\`TIME\`, \`RENDERSIZE\`, etc.).
   - Remove definitions of \`PI\` constants if they cause redefinition errors.
4. **Output**:
   - Return **ONLY** the fixed raw shader code. No prose.
`;

const extractGLSL = (text: string): string => {
  if (!text) return "";
  
  // 1. Try to extract from markdown code blocks
  const codeBlockRegex = /```(?:glsl|c|cpp)?([\s\S]*?)```/i;
  const match = text.match(codeBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }

  // 2. If no code blocks, check for ISF JSON start
  // ISF files almost always start with /* { ... } */
  const jsonStartIndex = text.indexOf('/*');
  if (jsonStartIndex > -1) {
    return text.substring(jsonStartIndex).trim();
  }

  // 3. Fallback: return raw text but try to strip common conversational prefixes if they exist at the very start
  // This is risky but helps if the model says "Here is the code:\n/*..." without markdown
  return text.replace(/^(Here is|Here's|Sure|Certainly).*?:\s*/is, '').trim();
};

// Retry helper for 429/Resource Exhausted errors
const retryOperation = async <T>(operation: () => Promise<T>, maxRetries: number = 3, initialDelay: number = 2000): Promise<T> => {
    let lastError: any;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            
            // Check for common rate limit indicators
            const isRateLimit = 
                error?.status === 429 || 
                error?.code === 429 || 
                (error?.message && (
                    error.message.includes('429') || 
                    error.message.includes('quota') || 
                    error.message.includes('RESOURCE_EXHAUSTED')
                ));
            
            if (isRateLimit && i < maxRetries - 1) {
                const waitTime = initialDelay * Math.pow(2, i);
                console.warn(`Gemini Rate Limit hit. Retrying in ${waitTime}ms... (Attempt ${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};

export const generateShader = async (prompt: string, style?: string, currentCode?: string, referenceImage?: string): Promise<string> => {
  if (!process.env.API_KEY) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  let userPrompt = prompt;
  if (style) userPrompt = `Style: ${style}. Concept: ${prompt}`;
  if (currentCode) userPrompt = `Update this shader: ${prompt}\n\nExisting Code:\n${currentCode}`;
  if (referenceImage) userPrompt = `Look at this image. Create a procedural GLSL shader that visually replicates this image's style, colors, and patterns. ${prompt}`;

  let contents: any = userPrompt;

  // Handle Multimodal Input
  if (referenceImage) {
      const base64Data = referenceImage.split(',')[1];
      const mimeType = referenceImage.split(';')[0].split(':')[1];
      
      contents = [
          {
              inlineData: {
                  data: base64Data,
                  mimeType: mimeType
              }
          },
          { text: userPrompt }
      ];
  }

  try {
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingBudget: 4096 }, 
        maxOutputTokens: 8192,
      },
    }));

    const text = response.text || "";
    const extracted = extractGLSL(text);
    return cleanISFCode(extracted);
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};

export const repairShader = async (code: string, errorHint?: string): Promise<string> => {
    if (!process.env.API_KEY) throw new Error("API Key is missing");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Pre-process code based on common errors before sending to AI to save tokens/time if possible
    let preProcessedCode = code;
    let specificInstructions = "";

    if (errorHint) {
        if (errorHint.includes("redefined") && (errorHint.includes("PI") || errorHint.includes("TWO_PI") || errorHint.includes("HALF_PI"))) {
            specificInstructions += "\n- The error indicates a macro redefinition. Remove `#define PI`, `#define TWO_PI`, or `#define HALF_PI` from the code.";
            // Try to auto-fix simple redefinitions
            preProcessedCode = preProcessedCode.replace(/#define\s+(PI|TWO_PI|HALF_PI)\s+[\d\.\*\/]+/g, '// $& (removed to fix redefinition)');
        }
        if (errorHint.includes("mat2") && errorHint.includes("constructor")) {
            specificInstructions += "\n- The error indicates an issue with a `mat2` constructor. Ensure you are using a WebGL 1.0 compatible constructor (e.g., `mat2(a, b, c, d)` where a,b,c,d are floats).";
        }
    }

    const prompt = `
    Analyze and repair this ISF shader.
    ${errorHint ? `Reported Compiler Error: ${errorHint}` : 'Perform general validation and fix potential WebGL 1.0 issues.'}
    ${specificInstructions}
    
    BROKEN CODE:
    ${preProcessedCode}
    `;

    try {
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                systemInstruction: REPAIR_INSTRUCTION,
                thinkingConfig: { thinkingBudget: 2048 },
            }
        }));

        const text = response.text || "";
        const extracted = extractGLSL(text);
        return cleanISFCode(extracted);
    } catch (error) {
        console.error("Gemini Repair Error", error);
        throw error;
    }
};