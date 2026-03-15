import React from 'react';
import { ISFMetadata, UniformValues } from '../types';
import { Camera, Image as ImageIcon, Sparkles } from 'lucide-react';

interface ControlsProps {
  metadata: ISFMetadata | null;
  values: UniformValues;
  sources: Record<string, string>;
  onChange: (name: string, value: any) => void;
  onSourceChange: (name: string, source: string) => void;
  onImageUpload: (name: string, file: File) => void;
}

const Controls: React.FC<ControlsProps> = ({ 
    metadata, 
    values, 
    sources, 
    onChange, 
    onSourceChange,
    onImageUpload
}) => {
  if (!metadata?.INPUTS?.length) return <div className="p-5 text-center text-xs text-white/20 italic">No parameters available.</div>;

  return (
    <div className="p-4 space-y-5">
      {metadata.INPUTS.map((input) => {
        const val = values[input.NAME] ?? input.DEFAULT;

        // Image Input (Simplified)
        if (input.TYPE === 'image') {
            const src = sources[input.NAME] || 'noise';
            return (
                <div key={input.NAME} className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{input.LABEL || input.NAME}</label>
                    <div className="flex bg-black/40 rounded p-1 border border-white/5">
                        <button onClick={() => onSourceChange(input.NAME, 'noise')} className={`flex-1 py-1.5 rounded text-[10px] flex items-center justify-center gap-1.5 transition-all ${src === 'noise' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                            <Sparkles size={12} /> Noise
                        </button>
                        <button onClick={() => onSourceChange(input.NAME, 'webcam')} className={`flex-1 py-1.5 rounded text-[10px] flex items-center justify-center gap-1.5 transition-all ${src === 'webcam' ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:text-gray-300'}`}>
                            <Camera size={12} /> Cam
                        </button>
                        <label className={`flex-1 py-1.5 rounded text-[10px] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${src.startsWith('blob') ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
                            <ImageIcon size={12} /> Img
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onImageUpload(input.NAME, e.target.files[0])} />
                        </label>
                    </div>
                </div>
            );
        }

        // Float Input (Slider)
        if (input.TYPE === 'float') {
            return (
                <div key={input.NAME} className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                        <label className="font-bold text-gray-500 uppercase tracking-wider">{input.LABEL || input.NAME}</label>
                        <span className="font-mono text-cyan-500">{typeof val === 'number' ? val.toFixed(2) : val}</span>
                    </div>
                    <input 
                        type="range" 
                        min={input.MIN ?? 0} 
                        max={input.MAX ?? 1} 
                        step={0.01} 
                        value={Number(val)} 
                        onChange={e => onChange(input.NAME, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-cyan-500 cursor-pointer hover:accent-cyan-400"
                    />
                </div>
            );
        }

        // Bool Input (Toggle)
        if (input.TYPE === 'bool') {
            return (
                <div key={input.NAME} className="flex justify-between items-center py-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{input.LABEL || input.NAME}</label>
                    <button 
                        onClick={() => onChange(input.NAME, !val)}
                        className={`w-8 h-4 rounded-full relative transition-colors ${val ? 'bg-cyan-600' : 'bg-white/10'}`}
                    >
                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${val ? 'translate-x-4' : ''}`} />
                    </button>
                </div>
            );
        }

        // Select Input (Dropdown)
        if (input.TYPE === 'long' && input.VALUES && input.LABELS) {
            return (
                <div key={input.NAME} className="space-y-1">
                     <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{input.LABEL || input.NAME}</label>
                     <select 
                        value={val} 
                        onChange={e => onChange(input.NAME, parseInt(e.target.value))}
                        className="w-full bg-black/40 border border-white/5 rounded px-2 py-1.5 text-xs text-gray-300 outline-none focus:border-cyan-500/50"
                     >
                         {input.VALUES.map((v, i) => <option key={v} value={v}>{input.LABELS![i]}</option>)}
                     </select>
                </div>
            );
        }
        
        return null;
      })}
    </div>
  );
};

export default Controls;