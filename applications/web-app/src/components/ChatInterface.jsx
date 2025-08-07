import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import MiddleLayerClient from '../services/middle-layer-client';
import ImagePreviewModal from './ImagePreviewModal';

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  
  const messagesEndRef = useRef(null);
  const currentMessageRef = useRef(null);
  const clientRef = useRef(null); // Keep a ref to the client to avoid closure issues

  useEffect(() => {
    initializeClient();
  }, []); // Only run once on mount

  const initializeClient = async () => {
    try {
      const middleLayerUrl = import.meta.env.VITE_MIDDLE_LAYER_URL || 'http://localhost:3001';
      const client = new MiddleLayerClient(middleLayerUrl);
      clientRef.current = client;
      
      // Check health
      const health = await client.checkHealth();
      if (health.status === 'ok') {
        setIsInitialized(true);
      } else {
        throw new Error('Middle layer not healthy');
      }
    } catch (error) {
      console.error('Failed to initialize client:', error);
      setMessages([{
        role: 'system',
        content: 'Failed to connect to the middle layer server. Please check your configuration.',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !clientRef.current || isLoading) return;

    const userMessage = {
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString()
    };

    setMessages([...messages, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const assistantMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      id: Date.now() // Add unique ID
    };

    setMessages(prev => [...prev, assistantMessage]);
    currentMessageRef.current = assistantMessage.id;

    try {
      // Don't send conversation history since we're using sessions
      const conversationHistory = [];

      // Send the message
      await clientRef.current.sendMessage(inputValue, conversationHistory, (chunk) => {
        if (chunk.type === 'content' && currentMessageRef.current) {
          setMessages(prev => {
            return prev.map(msg => 
              msg.id === currentMessageRef.current 
                ? { ...msg, content: msg.content + chunk.content }
                : msg
            );
          });
        } else if (chunk.type === 'tool_call') {
          // Optionally show tool calls in the UI
          console.log('Tool call:', chunk.name, chunk.args);
        }
      });
    } catch (error) {
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = 'Sorry, I encountered an error processing your request.';
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Knowledge Base Assistant</h2>
            <p className="text-sm text-gray-600 mt-1">
              {isInitialized ? 'Connected to knowledge base' : 'Connecting...'}
              {clientRef.current?.sessionId && (
                <span className="ml-2 text-xs text-gray-500">
                  (Session: {clientRef.current.sessionId.slice(0, 8)}...)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              clientRef.current?.clearSession();
              setMessages([]);
            }}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            New Conversation
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6">

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="text-sm mt-2">Ask questions about your knowledge base</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.role === 'system'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-white text-gray-800 shadow-sm border'
                  }`}
                >
                  <MessageContent content={message.content} onImageClick={setSelectedImage} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-800 shadow-sm border px-4 py-3 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t bg-white p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isInitialized ? "Ask a question..." : "Initializing..."}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!isInitialized || isLoading}
          />
          
          <button
            type="submit"
            disabled={!inputValue.trim() || !isInitialized || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
      
      {selectedImage && (
        <ImagePreviewModal
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
          imageUrl={selectedImage.url}
          filename={selectedImage.filename}
        />
      )}
    </div>
  );
};

// Component to parse and render message content with markdown support
const MessageContent = ({ content, onImageClick }) => {
  // Parse markdown images and make them clickable
  const renderContent = () => {
    // Split by markdown image pattern ![alt](url)
    const parts = content.split(/(\!\[([^\]]*)\]\(([^)]+)\))/g);
    
    return parts.map((part, index) => {
      // Check if this part matches the markdown image pattern
      if (index % 4 === 1) { // This is the full match
        const altText = parts[index + 1] || '';
        const imageUrl = parts[index + 2] || '';
        
        return (
          <img
            key={index}
            src={imageUrl}
            alt={altText}
            className="max-w-full h-auto rounded-lg my-2 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onImageClick({ url: imageUrl, filename: altText })}
          />
        );
      } else if (index % 4 === 0) { // This is regular text
        return <span key={index}>{part}</span>;
      }
      return null; // Skip the alt text and URL parts as they're handled above
    });
  };
  
  return <div className="whitespace-pre-wrap">{renderContent()}</div>;
};

export default ChatInterface;