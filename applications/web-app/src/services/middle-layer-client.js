class MiddleLayerClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || 'http://localhost:3001';
    this.sessionId = null;
  }

  async sendMessage(message, conversationHistory, onStream) {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          session_id: this.sessionId,
          conversation_history: conversationHistory
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // The current API returns a simple JSON response, not a stream
      const data = await response.json();
      
      if (data.status === 'success' && data.response) {
        // Store session ID for future requests
        if (data.session_id) {
          this.sessionId = data.session_id;
        }
        
        // Simulate streaming by sending the entire response as one chunk
        onStream?.({ type: 'content', content: data.response });
        onStream?.({ type: 'done' });
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
  
  // Method to clear session (start a new conversation)
  clearSession() {
    this.sessionId = null;
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'error', error: error.message };
    }
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${error}`);
    }

    return await response.json();
  }
}

export default MiddleLayerClient;