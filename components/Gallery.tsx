import React from 'react';
import { X, Trash2, Play } from 'lucide-react';
import { SavedShader } from '../types';

interface GalleryProps {
  isOpen: boolean;
  onClose: () => void;
  savedShaders: SavedShader[];
  onLoad: (shader: SavedShader) => void;
  onDelete: (id: string) => void;
}

const Gallery: React.FC<GalleryProps> = ({ isOpen, onClose, savedShaders, onLoad, onDelete }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-4xl h-[80vh] bg-gray-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/50">
          <h2 className="text-lg font-bold text-white tracking-widest uppercase">Saved Shaders</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors rounded-md hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {savedShaders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <p>No saved shaders yet.</p>
              <p className="text-sm mt-2">Generate a shader and click "Save" to add it here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {savedShaders.map((shader) => (
                <div key={shader.id} className="group relative bg-black/40 border border-white/10 rounded-lg overflow-hidden hover:border-cyan-500/50 transition-colors flex flex-col">
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gray-800 relative">
                    {shader.thumbnail ? (
                      <img src={shader.thumbnail} alt={shader.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No Preview</div>
                    )}
                    
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={() => { onLoad(shader); onClose(); }}
                        className="p-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transform scale-75 group-hover:scale-100 transition-all"
                      >
                        <Play size={20} fill="currentColor" />
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-xs font-bold text-gray-200 line-clamp-2 mb-1" title={shader.name}>{shader.name}</h3>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">{new Date(shader.timestamp).toLocaleDateString()}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(shader.id); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Gallery;
