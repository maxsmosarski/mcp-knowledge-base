import { useState, useEffect } from 'react';
import { FileText, Trash2, RefreshCw, Search, ChevronDown, ChevronRight } from 'lucide-react';
import FileUpload from './FileUpload';

const DocumentSidebar = ({ onDocumentSelect }) => {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    
    const load = async () => {
      try {
        await loadDocuments(controller.signal);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error loading documents:', error);
        }
      }
    };
    
    load();
    
    // Cleanup function to cancel if component unmounts or effect re-runs
    return () => {
      controller.abort();
    };
  }, []);

  const loadDocuments = async (signal) => {
    if (isLoading) return; // Prevent concurrent loads
    
    setIsLoading(true);
    try {
      console.log('Loading documents...');
      
      // Use middle layer instead of direct MCP connection
      const middleLayerUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      const response = await fetch(`${middleLayerUrl}/api/files`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: signal
      });
      
      console.log('Files response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Files result:', data);
        setDocuments(data.files || []);
      } else {
        console.error('Failed to load files:', response.statusText);
        setDocuments([]);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteDocument = async (docId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this document?')) return;

    try {
      const middleLayerUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      const response = await fetch(`${middleLayerUrl}/api/files`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ document_id: docId })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Delete result:', result);
        // Reload the documents list
        await loadDocuments();
      } else {
        const error = await response.json();
        console.error('Failed to delete document:', error);
        alert(`Failed to delete document: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document');
    }
  };

  const toggleDocument = (docId) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId);
    } else {
      newExpanded.add(docId);
    }
    setExpandedDocs(newExpanded);
  };

  const toggleSelectDocument = (docId, e) => {
    e.stopPropagation();
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
  };

  const selectAll = () => {
    if (selectedDocs.size === filteredDocuments.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(filteredDocuments.map(doc => doc.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedDocs.size === 0) return;
    
    const confirmMessage = selectedDocs.size === 1 
      ? 'Are you sure you want to delete the selected document?'
      : `Are you sure you want to delete ${selectedDocs.size} documents?`;
    
    if (!window.confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      const middleLayerUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const documentIds = Array.from(selectedDocs);
      
      const response = await fetch(`${middleLayerUrl}/api/files`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ document_ids: documentIds })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Bulk delete result:', result);
        setSelectedDocs(new Set());
        await loadDocuments();
      } else {
        const error = await response.json();
        console.error('Failed to delete documents:', error);
        alert(`Failed to delete documents: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete documents:', error);
      alert('Failed to delete documents');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );


  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="w-80 bg-white border-r h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">Documents</h3>
          <div className="flex items-center gap-2">
            {selectedDocs.size > 0 && (
              <button
                onClick={deleteSelected}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : `Delete (${selectedDocs.size})`}
              </button>
            )}
            <button
              onClick={() => loadDocuments()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto">
        {filteredDocuments.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {searchQuery ? 'No documents found' : 'No documents uploaded yet'}
          </div>
        ) : (
          <div className="p-2">
            {/* Select All */}
            {filteredDocuments.length > 0 && (
              <div className="mb-2 p-2 bg-gray-50 rounded-lg flex items-center">
                <input
                  type="checkbox"
                  checked={selectedDocs.size === filteredDocuments.length && filteredDocuments.length > 0}
                  onChange={selectAll}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">Select all ({filteredDocuments.length})</span>
              </div>
            )}
            {filteredDocuments.map((doc) => (
              <div key={doc.id} className="mb-2">
                <div
                  className={`p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors ${
                    selectedDocs.has(doc.id) ? 'bg-blue-50 hover:bg-blue-100' : ''
                  }`}
                  onClick={() => toggleDocument(doc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedDocs.has(doc.id)}
                        onChange={(e) => toggleSelectDocument(doc.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5 mr-2 flex-shrink-0"
                      />
                      <button className="mt-1 mr-2 flex-shrink-0">
                        {expandedDocs.has(doc.id) ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      <FileText className="w-4 h-4 text-blue-600 mt-1 mr-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {doc.filename}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(doc.created_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteDocument(doc.id, e)}
                      className="p-1 hover:bg-red-50 rounded transition-colors ml-2 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-600" />
                    </button>
                  </div>
                </div>
                
                {expandedDocs.has(doc.id) && (
                  <div className="ml-9 mr-3 mb-2 p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="space-y-1">
                      <p className="text-gray-600">
                        <span className="font-medium">Document ID:</span> {doc.id}
                      </p>
                      <p className="text-gray-600">
                        <span className="font-medium">Created:</span> {formatDate(doc.created_at)}
                      </p>
                    </div>
                    {onDocumentSelect && (
                      <button
                        onClick={() => onDocumentSelect(doc)}
                        className="mt-3 w-full px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                      >
                        View Details
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t bg-gray-50">
        <div className="text-sm text-gray-600">
          <p>{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* File Upload Section */}
      <FileUpload onUploadComplete={() => loadDocuments()} />
    </div>
  );
};

export default DocumentSidebar;