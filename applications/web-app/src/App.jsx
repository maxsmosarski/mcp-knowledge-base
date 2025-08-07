import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import ChatInterface from './components/ChatInterface';
import DocumentSidebar from './components/DocumentSidebar';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Document Sidebar */}
      <DocumentSidebar key={refreshKey} />
      
      {/* Chat Interface */}
      <div className="flex-1 flex flex-col">
        <ChatInterface />
      </div>
    </div>
  );
}

export default App;