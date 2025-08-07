import { useState, useRef } from 'react';
import { Upload, X, FileText, Image, CheckCircle, AlertCircle } from 'lucide-react';

const FileUpload = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    addFiles(selectedFiles);
  };

  const addFiles = (newFiles) => {
    const fileItems = newFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: 'pending', // pending, uploading, success, error
      error: null
    }));

    setFiles(prev => [...prev, ...fileItems]);
    fileItems.forEach(uploadFile);
  };

  const uploadFile = async (fileItem) => {
    setFiles(prev => prev.map(f => 
      f.id === fileItem.id ? { ...f, status: 'uploading' } : f
    ));

    try {
      const middleLayerUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const formData = new FormData();
      formData.append('file', fileItem.file);

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, progress } : f
          ));
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, status: 'success', progress: 100 } : f
          ));
          if (onUploadComplete) {
            onUploadComplete();
          }
        } else {
          throw new Error(`Upload failed with status ${xhr.status}`);
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'error', error: 'Upload failed' } : f
        ));
      });

      xhr.open('POST', `${middleLayerUrl}/api/upload`);
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, status: 'error', error: error.message } : f
      ));
    }
  };

  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return Image;
    return FileText;
  };

  const getStatusIcon = (status) => {
    if (status === 'success') return CheckCircle;
    if (status === 'error') return AlertCircle;
    return null;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-4 border-t bg-gray-50">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept=".txt,.md,.pdf,.json,.csv,.png,.jpg,.jpeg,.gif,.webp"
        />
        
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600 mb-1">
          Drag and drop files here, or
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          browse files
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Supports documents and images
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
          {files.map((file) => {
            const Icon = getFileIcon(file.type);
            const StatusIcon = getStatusIcon(file.status);
            
            return (
              <div
                key={file.id}
                className="bg-white border rounded-lg p-3 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center flex-1 min-w-0">
                    <Icon className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center ml-2">
                    {StatusIcon && (
                      <StatusIcon 
                        className={`w-4 h-4 mr-2 ${
                          file.status === 'success' ? 'text-green-500' : 'text-red-500'
                        }`} 
                      />
                    )}
                    {file.status !== 'uploading' && (
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {file.status === 'uploading' && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {file.progress}%
                    </p>
                  </div>
                )}

                {/* Error Message */}
                {file.status === 'error' && file.error && (
                  <p className="text-xs text-red-600 mt-1">{file.error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FileUpload;