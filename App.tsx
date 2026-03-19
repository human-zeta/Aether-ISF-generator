import React, { useState, useEffect, useRef } from 'react';
import { 
  Wand2, Download, Upload, RefreshCw, Copy, Check, 
  Mic, MicOff, Video, VideoOff, ChevronLeft, ChevronRight,
  Monitor, Maximize, Image as ImageIcon, Sparkles, Layers, Box, Zap, X, Dice5, Wrench, Save, Library
} from 'lucide-react';
import { generateShader, repairShader } from './services/gemini';
import { parseISF } from './utils/isf';
import { DEFAULT_SHADER } from './constants';
import ShaderCanvas from './components/ShaderCanvas';
import Controls from './components/Controls';
import Gallery from './components/Gallery';
import { ParsedShader, UniformValues, TextureSettings, SavedShader } from './types';
import { useMedia } from './hooks/useMedia';

const STYLES = [
  { id: 'none', label: 'Raw', icon: <Zap size={14} /> },
  { id: 'organic', label: 'Organic', icon: <Sparkles size={14} /> },
  { id: 'geometric', label: 'Geo', icon: <Box size={14} /> },
  { id: 'raymarched', label: '3D', icon: <Layers size={14} /> },
];

const RANDOM_PROMPTS = [
  "Bioluminescent deep sea jellyfish pulsing with neon energy",
  "Cyberpunk city rain on glass with neon reflections",
  "Glitch art datamosh datastream error with chromatic aberration",
  "Liquid metal ferrofluid responding to magnetic fields",
  "Retro 80s synthwave grid horizon with sunset and palm trees",
  "Fractal mandelbrot zoom with iridescent colors and feedback",
  "Abstract geometric bauhaus composition in motion",
  "VHS tape tracking distortion, static noise and scanlines",
  "Psilocybin visual drift breathing walls texture",
  "Kaleidoscope crystal light refraction with spectral dispersion",
  "ASCII art terminal waterfall matrix style green code",
  "Oil painting impressionist style flowing water and ripples",
  "Voronoi cellular biology microscope view of tissue",
  "Laser show fog beams scanning thru volumetric smoke",
  "CRT monitor phosphor burn-in ghosting trail effect",
  "Procedural clouds forming and dissolving in a surreal sky",
  "Digital pixel sorting flowing downwards like sand",
  "Reaction diffusion pattern evolving like coral growth",
  "Holographic interference patterns oscillating",
  "Liquid marble texture swirling with gold veins",
  "Ethereal aurora borealis dancing across a starry night sky",
  "Lava lamp blobs merging and separating in slow motion",
  "Microscopic view of crystalline structures forming",
  "Neon wireframe terrain flying through a digital canyon",
  "Psychedelic tie-dye colors melting and blending together",
  "Steampunk gears and cogs rotating with steam particle effects",
  "Cosmic nebula gas clouds expanding with stardust",
  "Abstract fluid dynamics simulation with turbulent vortices",
  "Retro arcade pixel art space shooter background scrolling",
  "Stained glass window illuminated by moving sunlight",
  "Quantum foam bubbling at the subatomic level",
  "Cybernetic neural network synapses firing with electrical pulses",
  "Origami paper folding and unfolding in geometric patterns",
  "Bismuth crystal hopper growth with iridescent metallic sheen",
  "Vaporwave aesthetic greek statues with palm leaves and grids",
  "Cinematic lens flare anamorphic streaks with dust motes",
  "Topographical map contour lines shifting and morphing",
  "Sound wave oscilloscope green line dancing to audio",
  "Gothic cathedral architecture morphing into organic shapes",
  "Bioluminescent fungi glowing in a dark enchanted forest",
  "Abstract expressionist paint splatters forming dynamic shapes",
  "Geometric sacred geometry mandalas rotating and interlocking",
  "Liquid chrome ripples responding to bass frequencies",
  "Ethereal ghostly apparitions floating in a misty graveyard"
];

const App: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('Liquid chrome ripples responding to bass');
  const [selectedStyle, setSelectedStyle] = useState('organic');
  const [code, setCode] = useState<string>(DEFAULT_SHADER);
  const [refImage, setRefImage] = useState<string | null>(null);
  
  // History
  const [history, setHistory] = useState<string[]>([DEFAULT_SHADER]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Parsing & State
  const [parsedShader, setParsedShader] = useState<ParsedShader>(parseISF(DEFAULT_SHADER));
  const [uniforms, setUniforms] = useState<UniformValues>({});
  const [inputSources, setInputSources] = useState<Record<string, string>>({});
  const [textureSettings] = useState<TextureSettings>({}); 

  // UI State
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pixelDensity, setPixelDensity] = useState<number>(1.0);
  
  // Gallery State
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [savedShaders, setSavedShaders] = useState<SavedShader[]>(() => {
    const saved = localStorage.getItem('aether_saved_shaders');
    return saved ? JSON.parse(saved) : [];
  });

  // Refs
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shaderInputRef = useRef<HTMLInputElement>(null);

  // Media Hooks
  const { 
    isWebcamActive, toggleWebcam, videoElement,
    isMicActive, toggleMic, audioVolume, audioDataArray
  } = useMedia();

  // Mouse tracking
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePos({ 
        x: (e.clientX - rect.left) / rect.width, 
        y: 1.0 - (e.clientY - rect.top) / rect.height 
    });
  };

  // Code Update & History
  const updateCode = (newCode: string, addToHistory = true) => {
      setCode(newCode);
      if (addToHistory) {
          const newHistory = history.slice(0, historyIndex + 1);
          newHistory.push(newCode);
          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
      }
  };

  const handleUndo = () => historyIndex > 0 && updateCode(history[historyIndex-1], false);
  const handleRedo = () => historyIndex < history.length - 1 && updateCode(history[historyIndex+1], false);

  const handleRandomPrompt = () => {
    const random = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
    setPrompt(random);
  };

  const handleImportShader = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              if (ev.target?.result) {
                  updateCode(ev.target.result as string);
              }
          };
          reader.readAsText(file);
      }
      e.target.value = ''; // Reset input
  };

  const handleRepair = async () => {
    setIsGenerating(true);
    setError(null);
    try {
        // Pass optional compile error if it exists, otherwise it does a general cleanup/fix
        const fixedCode = await repairShader(code, compileError || undefined);
        updateCode(fixedCode);
    } catch (err: any) {
        console.error(err);
        let msg = err.message || "Repair failed";
        if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
             msg = "⚠️ Server busy (Rate Limit). Please wait a few seconds.";
        }
        setError(msg);
    } finally {
        setIsGenerating(false);
    }
  };

  // Parser Effect
  useEffect(() => {
    const parsed = parseISF(code);
    setParsedShader(parsed);
    if (parsed.metadata?.INPUTS) {
      setUniforms(prev => {
          const next = { ...prev };
          parsed.metadata!.INPUTS.forEach(i => {
              if (next[i.NAME] === undefined) next[i.NAME] = i.DEFAULT;
          });
          return next;
      });
    }
  }, [code]);

  // Generation
  const handleGenerate = async () => {
    if (!prompt && !refImage) return;
    setIsGenerating(true);
    setError(null);
    try {
      const newCode = await generateShader(
          prompt, 
          selectedStyle !== 'none' ? selectedStyle : undefined,
          undefined,
          refImage || undefined // Pass reference image if it exists
      );
      updateCode(newCode);
    } catch (err: any) {
      console.error(err);
      let msg = err.message || "Synthesis failed";
      // Better error message for rate limits
      if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
          msg = "⚠️ Server busy (Rate Limit). Please wait a few seconds and try again.";
      }
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aether_ISF_${Date.now()}.fs`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => setRefImage(ev.target?.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleSaveShader = () => {
    let thumbnail = undefined;
    if (canvasRef.current) {
        try {
            thumbnail = canvasRef.current.toDataURL('image/jpeg', 0.5);
        } catch (e) {
            console.warn("Could not capture thumbnail", e);
        }
    }

    const newShader: SavedShader = {
        id: Date.now().toString(),
        name: prompt || 'Untitled Shader',
        code: code,
        timestamp: Date.now(),
        thumbnail
    };

    const updatedShaders = [newShader, ...savedShaders];
    setSavedShaders(updatedShaders);
    localStorage.setItem('aether_saved_shaders', JSON.stringify(updatedShaders));
  };

  const handleDeleteShader = (id: string) => {
      const updatedShaders = savedShaders.filter(s => s.id !== id);
      setSavedShaders(updatedShaders);
      localStorage.setItem('aether_saved_shaders', JSON.stringify(updatedShaders));
  };

  return (
    <div className="relative h-screen w-screen bg-black text-gray-200 font-sans overflow-hidden">
      
      {/* Sidebar - Glassmorphism */}
      <div className="absolute left-0 top-0 h-full w-80 flex flex-col border-r border-white/10 bg-black/40 backdrop-blur-2xl z-20 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        
        {/* Generator Header */}
        <div className="p-5 border-b border-white/10 bg-transparent">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-sm font-bold tracking-widest text-white uppercase">Aether <span className="text-cyan-500">ISF</span></h1>
                <div className="flex gap-1">
                     <button onClick={() => setIsGalleryOpen(true)} className="p-1.5 hover:bg-white/5 rounded text-gray-500 hover:text-cyan-400 transition-colors mr-2" title="Saved Shaders"><Library size={14}/></button>
                     <button onClick={handleUndo} disabled={historyIndex === 0} className="p-1.5 hover:bg-white/5 rounded disabled:opacity-30 text-gray-500 hover:text-white transition-colors"><ChevronLeft size={14}/></button>
                     <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className="p-1.5 hover:bg-white/5 rounded disabled:opacity-30 text-gray-500 hover:text-white transition-colors"><ChevronRight size={14}/></button>
                </div>
            </div>

            <div className="relative group mb-3">
                 <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); }}}
                    className={`w-full bg-black/40 border border-white/10 rounded-lg p-3 text-xs focus:border-cyan-500/50 outline-none resize-none text-gray-300 placeholder:text-gray-700 transition-all ${refImage ? 'h-16 rounded-b-none border-b-0' : 'h-24'}`}
                    placeholder="Describe a visual effect..." 
                />
                
                {refImage && (
                    <div className="relative h-16 w-full bg-black/40 border border-white/10 border-t-0 rounded-b-lg overflow-hidden flex items-center justify-center">
                        <img src={refImage} alt="Reference" className="w-full h-full object-cover opacity-50" />
                        <div className="absolute inset-0 flex items-center justify-center gap-2">
                             <span className="text-[10px] uppercase font-bold text-white shadow-black drop-shadow-md">Image Ref</span>
                             <button onClick={() => setRefImage(null)} className="p-1 bg-black/50 hover:bg-red-500/80 rounded text-white transition-colors"><X size={12}/></button>
                        </div>
                    </div>
                )}

                {/* Random Prompt Button - Visible on Hover */}
                <button 
                    onClick={handleRandomPrompt}
                    className="absolute top-2 right-2 p-1.5 bg-black/20 hover:bg-white/10 rounded-md text-white/30 hover:text-cyan-400 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm z-10"
                    title="Random Aesthetic Prompt"
                >
                    <Dice5 size={14} />
                </button>
                
                <div className="absolute bottom-2 right-2 flex gap-1 z-10">
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className={`p-1.5 rounded transition-colors ${refImage ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                        title="Upload Reference Image"
                    >
                        <ImageIcon size={14} />
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleRefImageUpload} />
                </div>
            </div>

            <div className="flex gap-2 mb-3">
                {STYLES.map(s => (
                    <button 
                        key={s.id}
                        onClick={() => setSelectedStyle(s.id)}
                        className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 text-[10px] uppercase font-bold tracking-wider transition-all ${selectedStyle === s.id ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}
                        title={s.label}
                    >
                        {s.icon}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between mb-3 bg-black/40 border border-white/10 rounded-lg p-2">
                <span className="text-[10px] uppercase font-bold text-gray-400">Resolution</span>
                <select 
                    value={pixelDensity} 
                    onChange={(e) => setPixelDensity(parseFloat(e.target.value))}
                    className="bg-transparent text-xs text-white outline-none cursor-pointer"
                >
                    <option value={0.25}>0.25x (Fast)</option>
                    <option value={0.5}>0.5x (Half)</option>
                    <option value={1.0}>1.0x (Native)</option>
                    <option value={2.0}>2.0x (High)</option>
                </select>
            </div>

            <button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-md text-xs font-bold uppercase tracking-widest shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isGenerating ? <RefreshCw className="animate-spin" size={14} /> : <Wand2 size={14} />}
                Generate
            </button>
            
            {error && <div className="mt-2 text-[10px] text-red-400 bg-red-900/10 p-2 rounded border border-red-900/20">{error}</div>}
        </div>

        {/* Parameters Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent">
            {compileError && (
                <div className="p-3 bg-red-500/10 border-b border-red-500/20">
                     <div className="flex items-center justify-between text-red-400 mb-1">
                        <span className="text-[10px] font-bold uppercase">Shader Error</span>
                        <button onClick={() => repairShader(code, compileError).then(updateCode)} className="text-[9px] underline hover:text-red-300">Auto-Fix</button>
                     </div>
                     <p className="text-[9px] font-mono opacity-70 line-clamp-2">{compileError}</p>
                </div>
            )}
            <Controls 
                metadata={parsedShader.metadata}
                values={uniforms}
                sources={inputSources}
                onChange={(n, v) => setUniforms(p => ({...p, [n]: v}))}
                onSourceChange={(n, s) => setInputSources(p => ({...p, [n]: s}))}
                onImageUpload={(n, f) => setInputSources(p => ({...p, [n]: URL.createObjectURL(f)}))}
            />
        </div>

        {/* Functional Footer */}
        <div className="p-3 bg-transparent border-t border-white/10 grid grid-cols-5 gap-2">
             <button onClick={() => shaderInputRef.current?.click()} className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-xs font-bold transition-all border border-white/5" title="Import Shader">
                <Upload size={14} /> <span className="hidden sm:inline">Import</span>
             </button>
             <input type="file" ref={shaderInputRef} className="hidden" accept=".fs,.txt,.glsl" onChange={handleImportShader} />

             <button onClick={handleDownload} className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-xs font-bold transition-all border border-white/5" title="Export Shader">
                <Download size={14} /> <span className="hidden sm:inline">Export</span>
             </button>

             <button onClick={handleSaveShader} className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-xs font-bold transition-all border border-white/5" title="Save to Gallery">
                <Save size={14} /> <span className="hidden sm:inline">Save</span>
             </button>

             <button onClick={handleRepair} disabled={isGenerating} className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-xs font-bold transition-all border border-white/5 disabled:opacity-50" title="Auto-Repair Shader">
                <Wrench size={14} /> <span className="hidden sm:inline">Repair</span>
             </button>

             <button onClick={() => setShowCode(!showCode)} className={`flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-all border ${showCode ? 'bg-cyan-900/20 text-cyan-400 border-cyan-500/30' : 'bg-white/5 hover:bg-white/10 text-white/70 border-white/5'}`} title="View Code">
                <Monitor size={14} /> <span className="hidden sm:inline">Code</span>
             </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="absolute inset-0 z-0 flex flex-col group">
         
         {/* Hover Controls */}
         <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
             <button onClick={toggleMic} className={`p-2 rounded-full backdrop-blur-md border ${isMicActive ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-black/40 border-white/10 text-white/40 hover:text-white'}`}>
                {isMicActive ? <Mic size={16} /> : <MicOff size={16} />}
             </button>
             <button onClick={toggleWebcam} className={`p-2 rounded-full backdrop-blur-md border ${isWebcamActive ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-black/40 border-white/10 text-white/40 hover:text-white'}`}>
                {isWebcamActive ? <Video size={16} /> : <VideoOff size={16} />}
             </button>
             <button onClick={() => canvasContainerRef.current?.requestFullscreen()} className="p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/40 hover:text-white">
                <Maximize size={16} />
             </button>
         </div>

         {/* Canvas */}
         <div ref={canvasContainerRef} className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden" onMouseMove={handleMouseMove}>
             <ShaderCanvas 
                parsedShader={parsedShader}
                uniforms={uniforms}
                sources={inputSources}
                textureSettings={textureSettings}
                videoElement={videoElement}
                audioVolume={audioVolume}
                audioDataArray={audioDataArray}
                mouse={mousePos}
                tilt={{x:0, y:0}}
                pixelDensity={pixelDensity}
                onCompileError={setCompileError}
                onCanvasRef={r => canvasRef.current = r}
             />
         </div>

         {/* Code View */}
         {showCode && (
             <div className="absolute bottom-0 left-80 right-0 h-1/3 border-t border-white/10 bg-black/50 backdrop-blur-xl flex flex-col animate-in slide-in-from-bottom-10 z-10">
                 <div className="flex justify-between items-center px-4 py-2 border-b border-white/10 bg-transparent">
                     <span className="text-[10px] font-mono text-white/30 uppercase">GLSL Source</span>
                     <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className="text-white/30 hover:text-cyan-400">
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                     </button>
                 </div>
                 <textarea 
                    value={code} 
                    onChange={e => updateCode(e.target.value)} 
                    spellCheck={false}
                    className="flex-1 bg-transparent p-4 font-mono text-xs text-gray-400 outline-none resize-none leading-relaxed"
                 />
             </div>
         )}
      </div>

      <Gallery 
         isOpen={isGalleryOpen} 
         onClose={() => setIsGalleryOpen(false)} 
         savedShaders={savedShaders} 
         onLoad={(shader) => {
             setPrompt(shader.name);
             updateCode(shader.code);
         }} 
         onDelete={handleDeleteShader} 
      />
    </div>
  );
};

export default App;