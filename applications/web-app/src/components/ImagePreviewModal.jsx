import React from 'react';
import { X } from 'lucide-react';

function ImagePreviewModal({ isOpen, onClose, imageUrl, filename }) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="relative max-w-4xl max-h-full p-4">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 transition-opacity z-10"
        >
          <X className="h-6 w-6" />
        </button>
        
        <img
          src={imageUrl}
          alt={filename}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
        
        {filename && (
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
            {filename}
          </div>
        )}
      </div>
    </div>
  );
}

export default ImagePreviewModal;