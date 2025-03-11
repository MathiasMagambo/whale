import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import OpenAI from "openai";

const App = () => {
  const [chats, setChats] = useState([]); // All chats
  const [activeChatId, setActiveChatId] = useState(null); // Currently active chat
  const [messages, setMessages] = useState([]); // Messages in the active chat
  const [prompt, setPrompt] = useState("");
  const [streamingResponse, setStreamingResponse] = useState(""); // Streaming response
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState("deepseek-chat");
  const abortController = useRef(null);

  const openai = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.REACT_APP_DEEPSEEK_API_KEY, 
    dangerouslyAllowBrowser: true, // Allow API calls from the browser
  });

  // Load saved chats on app startup
  useEffect(() => {
    axios
      .get("http://localhost:5000/load-chats")
      .then((response) => setChats(response.data))
      .catch((error) => console.error("Error loading chats:", error));
  }, []);

  // Create a new chat
  const createNewChat = async () => {
    const newChatId = Date.now().toString();
    const newChatName = `Chat - ${new Date().toLocaleString()}`;
  
    // Update state first
    setChats(prev => [...prev, { id: newChatId, name: newChatName }]);
    setActiveChatId(newChatId);
    setMessages([]);
  
    // Then save to backend with empty messages
    await axios.post("http://localhost:5000/save-chat", {
      chatId: newChatId,
      name: newChatName,
      messages: []
    });
  };

  // Switch to an existing chat
  const switchChat = (chatId) => {
  axios.get(`http://localhost:5000/load-chat/${chatId}`)
    .then(response => {
      setActiveChatId(chatId);
      setMessages(response.data);
    });
};

// Delete a chat
  const deleteChat = async (chatId) => {
    try {
      // Delete the chat from the server
      await axios.delete(`http://localhost:5000/delete-chat/${chatId}`);
      
      // Update the frontend state only if the server deletion is successful
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (chatId === activeChatId) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      alert("Failed to delete chat. Please try again.");
    }
  };


  // Handle file upload
  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files).slice(0, 10); // Limit to 10 files
    if (files.length > 0) {
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          setUploadedFiles((prev) => [...prev, e.target.result]);
        };
        reader.readAsText(file);
      });
    }
  };

  // Handle prompt submission
  const handleSubmit = async () => {
  if (!prompt.trim() && uploadedFiles.length === 0) return;

  // Get current chat data
  const activeChat = chats.find((chat) => chat.id === activeChatId) || {
    id: activeChatId,
    name: `Chat - ${new Date().toLocaleString()}`,
  };

  // Save the user message to the chat history
  const userMessage = { role: "user", content: prompt };
  const updatedMessages = [...messages, userMessage];
  setMessages(updatedMessages);

  // Save the user message to the backend immediately
  await axios.post("http://localhost:5000/save-chat", {
    chatId: activeChatId,
    name: activeChat.name,
    messages: updatedMessages,
  });

  setIsStreaming(true);
  abortController.current = new AbortController();

  try {
    const stream = await openai.chat.completions.create(
      {
        model: model,
        messages: [
          ...updatedMessages,
          { role: "system", content: uploadedFiles.join("\n") }, // Include uploaded files as context
        ],
        stream: true,
      },
      { signal: abortController.current.signal }
    );

    let assistantMessage = { role: "assistant", content: "" };
    for await (const chunk of stream) {
      if (chunk.choices[0].delta.content) {
        assistantMessage.content += chunk.choices[0].delta.content;
        setStreamingResponse(assistantMessage.content); // Update streaming response
      }
    }

    // Save the final response to the chat history
    const finalMessages = [...updatedMessages, assistantMessage];
    setMessages(finalMessages);
    setStreamingResponse(""); // Clear streaming response

    // Save the updated chat (user message + assistant response) to the backend
    await axios.post("http://localhost:5000/save-chat", {
      chatId: activeChatId,
      name: activeChat.name,
      messages: finalMessages,
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "An error occurred. Please try again." },
      ]);
    }
  } finally {
    setIsStreaming(false);
    abortController.current = null;
  }
};

  // Stop the token stream
  const handleStopStream = () => {
    if (abortController.current) {
      abortController.current.abort();
      setIsStreaming(false);
    }
  };

  // Switch between models
  const handleModelSwitch = () => {
    setModel((prev) =>
      prev === "deepseek-chat" ? "deepseek-r1" : "deepseek-chat"
    );
  };

  // Copy response to clipboard
  const handleCopyResponse = (content) => {
    navigator.clipboard.writeText(content);
    alert("Response copied to clipboard!");
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial, sans-serif" }}>
      {/* Sidebar for chat history */}
      <div
        style={{
          width: "250px",
          borderRight: "1px solid #ccc",
          padding: "10px",
          overflowY: "auto",
        }}
      >
        <button
          onClick={createNewChat}
          style={{ width: "100%", marginBottom: "10px" }}
        >
          New Chat
        </button>
        {chats.map((chat) => (
          <div
            key={chat.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
              padding: "5px",
              backgroundColor: activeChatId === chat.id ? "#e6f7ff" : "#f9f9f9",
              borderRadius: "5px",
              cursor: "pointer",
            }}
            onClick={() => switchChat(chat.id)}
          >
            <span>{chat.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteChat(chat.id);
              }}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {/* Main chat interface */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            borderBottom: "1px solid #ccc",
          }}
        >
          <h2>Chat History</h2>
          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                margin: "10px 0",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "5px",
                backgroundColor: msg.role === "user" ? "#f9f9f9" : "#e6f7ff",
                position: "relative",
              }}
            >
              <strong>{msg.role === "user" ? "You" : "DeepSeek"}:</strong>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  margin: "0",
                }}
              >
                {msg.content}
              </pre>
              {msg.role === "assistant" && (
                <button
                  onClick={() => handleCopyResponse(msg.content)}
                  style={{
                    position: "absolute",
                    bottom: "5px",
                    right: "5px",
                    background: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "3px",
                    cursor: "pointer",
                  }}
                >
                  Copy
                </button>
              )}
            </div>
          ))}
          {isStreaming && (
            <div
              style={{
                margin: "10px 0",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "5px",
                backgroundColor: "#e6f7ff",
                position: "relative",
              }}
            >
              <strong>DeepSeek:</strong>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  margin: "0",
                }}
              >
                {streamingResponse}
              </pre>
            </div>
          )}
        </div>

        {/* Prompt box and buttons at the bottom */}
        <div
          style={{
            padding: "20px",
            borderTop: "1px solid #ccc",
            backgroundColor: "#f9f9f9",
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt here..."
            rows={3}
            style={{ width: "100%", marginBottom: "10px", fontSize: "16px" }}
          />
          <div>
            <input
              type="file"
              accept=".txt,.js,.py,.java"
              onChange={handleFileUpload}
              multiple
              style={{ marginBottom: "10px" }}
            />
            <button onClick={handleModelSwitch}>
              Switch to {model === "deepseek-chat" ? "R1 Model" : "Chat Model"}
            </button>
            <button onClick={handleSubmit} disabled={isStreaming}>
              {isStreaming ? "Streaming..." : "Submit"}
            </button>
            {isStreaming && (
              <button onClick={handleStopStream}>Stop Stream</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;