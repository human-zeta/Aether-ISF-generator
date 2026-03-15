import React, { useRef, useEffect, useState } from 'react';
import { ParsedShader, UniformValues, ISFInput, TextureSettings } from '../types';
import { generateWebGLPreamble, cleanISFCode } from '../utils/isf';

interface ShaderCanvasProps {
  parsedShader: ParsedShader;
  uniforms: UniformValues;
  sources: Record<string, string>; // 'noise', 'webcam', or blobUrl
  textureSettings: TextureSettings;
  
  // Real-time sensor data
  videoElement: HTMLVideoElement;
  audioVolume: number; // 0-1
  audioDataArray: Uint8Array | null; // FFT Data
  mouse: { x: number, y: number }; // 0-1
  tilt: { x: number, y: number }; // -1 to 1

  pixelDensity?: number; // New prop for resolution scaling (default 1.0)

  onCompileError: (error: string | null) => void;
  onCanvasRef: (canvas: HTMLCanvasElement | null) => void;
}

const ShaderCanvas: React.FC<ShaderCanvasProps> = ({ 
    parsedShader, 
    uniforms, 
    sources, 
    textureSettings,
    videoElement,
    audioVolume,
    audioDataArray,
    mouse,
    tilt,
    pixelDensity = 1.0,
    onCompileError,
    onCanvasRef
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const programRef = useRef<WebGLProgram | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  
  // Textures
  const defaultTextureRef = useRef<WebGLTexture | null>(null);
  const webcamTextureRef = useRef<WebGLTexture | null>(null);
  const audioSpectrumTextureRef = useRef<WebGLTexture | null>(null);
  const imageTexturesRef = useRef<Record<string, WebGLTexture>>({});

  // Helper to create a noise texture
  const createNoiseTexture = (gl: WebGLRenderingContext) => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.floor(Math.random() * 255);
    }
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    // Initial default, will be overridden by render loop if needed, but good to have defaults
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return texture;
  };

  const createBlankTexture = (gl: WebGLRenderingContext, width = 1, height = 1) => {
      const texture = gl.createTexture();
      if (!texture) return null;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const data = new Uint8Array(width * height * 4).fill(0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
  }

  // Load image texture
  const loadImageTexture = (gl: WebGLRenderingContext, url: string, name: string) => {
      const img = new Image();
      img.onload = () => {
          if (!glRef.current) return;
          const texture = glRef.current.createTexture();
          if (!texture) return;
          
          glRef.current.bindTexture(gl.TEXTURE_2D, texture);
          glRef.current.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          // Initial default
          glRef.current.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          glRef.current.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          glRef.current.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          glRef.current.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

          // Cleanup old
          if (imageTexturesRef.current[name]) {
              glRef.current.deleteTexture(imageTexturesRef.current[name]);
          }
          imageTexturesRef.current[name] = texture;
      };
      img.src = url;
  }

  // Effect to load image textures when sources change
  useEffect(() => {
    if (!glRef.current) return;
    Object.entries(sources).forEach(([name, source]) => {
        const srcStr = source as string;
        if (srcStr.startsWith('blob:')) {
            loadImageTexture(glRef.current!, srcStr, name);
        }
    });
  }, [sources]);


  // Initialize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCanvasRef(canvas);

    let gl = glRef.current;
    if (!gl) {
      gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false });
      if (!gl) {
        onCompileError("WebGL not supported");
        return;
      }
      glRef.current = gl;
    }

    if (!defaultTextureRef.current) defaultTextureRef.current = createNoiseTexture(gl);
    if (!webcamTextureRef.current) webcamTextureRef.current = createBlankTexture(gl, 1, 1);
    if (!audioSpectrumTextureRef.current) audioSpectrumTextureRef.current = createBlankTexture(gl, 128, 1);

    // Helper to compile
    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(info || "Unknown Shader Error");
        }
        return shader;
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const preamble = generateWebGLPreamble(parsedShader.metadata);
    
    // 1. Basic Cleaning
    let cleanRawCode = cleanISFCode(parsedShader.rawCode);

    // 2. Advanced Cleaning: Strip uniforms that overlap with INPUTS to avoid redefinition
    // (Since preamble automatically adds them)
    if (parsedShader.metadata && parsedShader.metadata.INPUTS) {
        parsedShader.metadata.INPUTS.forEach(input => {
            const re = new RegExp(`^\\s*uniform\\s+\\w+\\s+${input.NAME}\\s*;`, 'gm');
            cleanRawCode = cleanRawCode.replace(re, '');
        });
    }

    const fullFragmentSource = `${preamble}\n${cleanRawCode}`;
    const vertexSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    try {
      const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fullFragmentSource);
      
      if (!vs || !fs) throw new Error("Failed to create shaders");

      const program = gl.createProgram();
      if (!program) throw new Error("Failed to create program");
      
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Program Link Error: ${gl.getProgramInfoLog(program)}`);
      }

      programRef.current = program;
      onCompileError(null);

      // Geometry
      const positionLocation = gl.getAttribLocation(program, "position");
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    } catch (err: any) {
      onCompileError(err.message);
      programRef.current = null;
    }

    const render = () => {
        if (!gl || !programRef.current) return;
        gl.useProgram(programRef.current);
        
        // --- RESOLUTION SCALING ---
        // We use clientWidth/Height scaled by pixelDensity
        const displayWidth = Math.floor(canvas.clientWidth * (window.devicePixelRatio || 1) * pixelDensity);
        const displayHeight = Math.floor(canvas.clientHeight * (window.devicePixelRatio || 1) * pixelDensity);

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
        
        // --- BUILT-IN UNIFORMS ---
        const timeLoc = gl.getUniformLocation(programRef.current, "TIME");
        if (timeLoc) gl.uniform1f(timeLoc, (Date.now() - startTimeRef.current) / 1000.0);
        
        const passLoc = gl.getUniformLocation(programRef.current, "PASSINDEX");
        if (passLoc) gl.uniform1i(passLoc, 0);

        const dateLoc = gl.getUniformLocation(programRef.current, "DATE");
        if (dateLoc) {
             const now = new Date();
             const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000.0;
             gl.uniform4f(dateLoc, now.getFullYear(), now.getMonth() + 1, now.getDate(), seconds);
        }

        const resLoc = gl.getUniformLocation(programRef.current, "RENDERSIZE");
        if (resLoc) gl.uniform2f(resLoc, canvas.width, canvas.height);

        // --- SENSOR UNIFORMS (Aether Extras) ---
        const mouseLoc = gl.getUniformLocation(programRef.current, "MOUSE");
        if (mouseLoc) gl.uniform2f(mouseLoc, mouse.x, mouse.y);

        const tiltLoc = gl.getUniformLocation(programRef.current, "TILT");
        if (tiltLoc) gl.uniform2f(tiltLoc, tilt.x, tilt.y);

        const audioLoc = gl.getUniformLocation(programRef.current, "AUDIO_VOL");
        if (audioLoc) gl.uniform1f(audioLoc, audioVolume);

        // --- AUDIO TEXTURE UPDATE ---
        let texUnit = 0;
        
        if (audioDataArray && audioSpectrumTextureRef.current) {
            gl.activeTexture(gl.TEXTURE0 + texUnit);
            gl.bindTexture(gl.TEXTURE_2D, audioSpectrumTextureRef.current);
            
            const spectrumData = new Uint8Array(128 * 4);
            for(let i=0; i<128; i++) {
                const val = audioDataArray[i] || 0;
                spectrumData[i*4] = val;     // R
                spectrumData[i*4+1] = val;   // G
                spectrumData[i*4+2] = val;   // B
                spectrumData[i*4+3] = 255;   // A
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, spectrumData);
            
            const spectrumLoc = gl.getUniformLocation(programRef.current, "AUDIO_SPECTRUM");
            if (spectrumLoc) gl.uniform1i(spectrumLoc, texUnit);
            texUnit++;
        }

        // --- DYNAMIC INPUTS ---
        if (parsedShader.metadata && parsedShader.metadata.INPUTS) {
            const reserved = ['TIME', 'PASSINDEX', 'RENDERSIZE', 'DATE', 'MOUSE', 'AUDIO_VOL', 'TILT', 'AUDIO_SPECTRUM'];
            
            parsedShader.metadata.INPUTS.forEach((input: ISFInput) => {
                if (reserved.includes(input.NAME)) return;

                const loc = gl.getUniformLocation(programRef.current!, input.NAME);
                if (!loc) return;

                if (input.TYPE === 'image') {
                     gl.activeTexture(gl.TEXTURE0 + texUnit);
                     const source = sources[input.NAME];
                     
                     if (source === 'webcam') {
                         gl.bindTexture(gl.TEXTURE_2D, webcamTextureRef.current);
                         if (videoElement.readyState >= 2) {
                             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
                         }
                     } else if (source && source.startsWith('blob:') && imageTexturesRef.current[input.NAME]) {
                         gl.bindTexture(gl.TEXTURE_2D, imageTexturesRef.current[input.NAME]);
                     } else {
                         gl.bindTexture(gl.TEXTURE_2D, defaultTextureRef.current);
                     }

                     // Apply Filter Setting Frame-by-Frame
                     const filterMode = textureSettings[input.NAME]?.filter === 'NEAREST' ? gl.NEAREST : gl.LINEAR;
                     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filterMode);
                     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterMode);
                     
                     // Apply Wrap Setting Frame-by-Frame
                     const wrapMode = textureSettings[input.NAME]?.wrap === 'CLAMP_TO_EDGE' ? gl.CLAMP_TO_EDGE : gl.REPEAT;
                     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
                     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
                     
                     gl.uniform1i(loc, texUnit);
                     texUnit++;
                     return;
                }

                const val = uniforms[input.NAME];
                const safeVal = val !== undefined ? val : input.DEFAULT;

                if (input.TYPE === 'float' && typeof safeVal === 'number') {
                    gl.uniform1f(loc, safeVal);
                } else if (input.TYPE === 'bool') {
                    gl.uniform1i(loc, safeVal ? 1 : 0); 
                } else if (input.TYPE === 'long' && typeof safeVal === 'number') {
                    gl.uniform1i(loc, Math.floor(safeVal));
                } else if (input.TYPE === 'point2D' && Array.isArray(safeVal)) {
                    gl.uniform2f(loc, safeVal[0], safeVal[1]);
                } else if (input.TYPE === 'color' && Array.isArray(safeVal)) {
                    gl.uniform4f(loc, safeVal[0], safeVal[1], safeVal[2], safeVal[3]);
                }
            });
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [parsedShader, uniforms, sources, textureSettings, mouse, tilt, audioVolume, audioDataArray, pixelDensity, onCompileError]); 

  return (
    <canvas 
        ref={canvasRef} 
        className="w-full h-full object-cover block"
    />
  );
};

export default ShaderCanvas;
