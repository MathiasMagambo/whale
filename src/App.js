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
  const [matrixRain, setMatrixRain] = useState(false); // State for toggling matrix rain animation
  const abortController = useRef(null);

  // Matrix rain animation
  useEffect(() => {
    if (!matrixRain) return;

    const canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops = [];

    for (let i = 0; i < columns; i++) {
      drops[i] = 1;
    }

    const matrixChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";

    const drawMatrix = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#0F0';
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = matrixChars.charAt(Math.floor(Math.random() * matrixChars.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i]++;
      }
    };

    const matrixInterval = setInterval(drawMatrix, 35);

    return () => clearInterval(matrixInterval);
  }, [matrixRain]);

  // Terminal boot sequence
  useEffect(() => {
    const bootSequence = [
      "INITIALIZING DEEPSEEK CORE...",
      "LOADING NEURAL NETWORKS...",
      "ESTABLISHING ENCRYPTED CONNECTION...",
      "SYSTEM READY"
    ];

    let current = 0;
    const bootInterval = setInterval(() => {
      if (current < bootSequence.length) {
        setStreamingResponse(prev => prev + "\n" + bootSequence[current]);
        current++;
      } else {
        clearInterval(bootInterval);
        setStreamingResponse("");
      }
    }, 800);

    return () => clearInterval(bootInterval);
  }, []);

  const openai = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.REACT_APP_DEEPSEEK_API_KEY,
    dangerouslyAllowBrowser: true,
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
    const newChatName = `Session-${new Date().toLocaleString().replace(/[\/,:\s]/g, '-')}`;

    setChats(prev => [...prev, { id: newChatId, name: newChatName }]);
    setActiveChatId(newChatId);
    setMessages([]);

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
      await axios.delete(`http://localhost:5000/delete-chat/${chatId}`);
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
    const files = Array.from(event.target.files).slice(0, 10);
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

    const activeChat = chats.find((chat) => chat.id === activeChatId) || {
      id: activeChatId,
      name: `Session-${new Date().toLocaleString().replace(/[\/,:\s]/g, '-')}`,
    };

    const userMessage = { role: "user", content: prompt };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

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
            { role: "system", content: uploadedFiles.join("\n") },
          ],
          stream: true,
        },
        { signal: abortController.current.signal }
      );

      let assistantMessage = { role: "assistant", content: "" };
      for await (const chunk of stream) {
        if (chunk.choices[0].delta.content) {
          assistantMessage.content += chunk.choices[0].delta.content;
          setStreamingResponse(assistantMessage.content);
        }
      }

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setStreamingResponse("");

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
          { role: "assistant", content: "ERROR: CONNECTION TERMINATED. RETRY SEQUENCE." },
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
    const alertDiv = document.createElement('div');
    alertDiv.textContent = "DATA COPIED TO SYSTEM MEMORY";
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.left = '50%';
    alertDiv.style.transform = 'translateX(-50%)';
    alertDiv.style.backgroundColor = 'rgba(0,50,0,0.8)';
    alertDiv.style.color = '#0F0';
    alertDiv.style.padding = '10px 20px';
    alertDiv.style.borderRadius = '5px';
    alertDiv.style.zIndex = '1000';
    alertDiv.style.fontFamily = 'monospace';
    alertDiv.style.border = '1px solid #0F0';
    alertDiv.style.boxShadow = '0 0 10px #0F0';
    document.body.appendChild(alertDiv);

    setTimeout(() => document.body.removeChild(alertDiv), 2000);
  };

  // Toggle matrix rain animation
  const toggleMatrixRain = () => {
    setMatrixRain(!matrixRain);
  };

  return (
    <div style={{ 
      display: "flex", 
      height: "100vh", 
      fontFamily: "'Courier New', monospace",
      backgroundColor: "#000",
      color: "#0F0",
      position: "relative",
      overflow: "hidden"
    }}>
      {matrixRain && <canvas id="matrix-canvas" style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        opacity: 0.2
      }} />}

      {/* Sidebar for chat history */}
      <div
        style={{
          width: "250px",
          borderRight: "1px solid #0F0",
          padding: "10px",
          overflowY: "auto",
          backgroundColor: "rgba(0, 10, 0, 0.9)",
          zIndex: 1,
          boxShadow: "0 0 15px rgba(0, 255, 0, 0.3)"
        }}
      >
        <div style={{ 
          textAlign: "center", 
          marginBottom: "20px", 
          borderBottom: "1px solid #0F0",
          paddingBottom: "10px"
        }}>
          <h2 style={{ 
            color: "#0F0", 
            fontFamily: "'Courier New', monospace",
            textShadow: "0 0 5px #0F0"
          }}>MATRIX_NETWORK</h2>
        </div>

        <button
          onClick={createNewChat}
          style={{ 
            width: "100%", 
            marginBottom: "15px",
            backgroundColor: "rgba(0, 20, 0, 0.8)",
            color: "#0F0",
            border: "1px solid #0F0",
            padding: "8px",
            cursor: "pointer",
            fontFamily: "'Courier New', monospace",
            boxShadow: "0 0 5px #0F0",
            transition: "all 0.3s ease"
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = "rgba(0, 40, 0, 0.8)";
            e.target.style.boxShadow = "0 0 10px #0F0";
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = "rgba(0, 20, 0, 0.8)";
            e.target.style.boxShadow = "0 0 5px #0F0";
          }}
        >
          INITIALIZE NEW SESSION
        </button>

        <button
          onClick={toggleMatrixRain}
          style={{ 
            width: "100%", 
            marginBottom: "15px",
            backgroundColor: matrixRain ? "rgba(0, 60, 0, 0.8)" : "rgba(0, 20, 0, 0.8)",
            color: "#0F0",
            border: "1px solid #0F0",
            padding: "8px",
            cursor: "pointer",
            fontFamily: "'Courier New', monospace",
            boxShadow: matrixRain ? "0 0 10px #0F0" : "0 0 5px #0F0",
            transition: "all 0.3s ease"
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = "rgba(0, 40, 0, 0.8)";
            e.target.style.boxShadow = "0 0 10px #0F0";
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = matrixRain ? "rgba(0, 60, 0, 0.8)" : "rgba(0, 20, 0, 0.8)";
            e.target.style.boxShadow = matrixRain ? "0 0 10px #0F0" : "0 0 5px #0F0";
          }}
        >
          {matrixRain ? "DISABLE MATRIX RAIN" : "ENABLE MATRIX RAIN"}
        </button>

        <div style={{ marginTop: "20px", marginBottom: "10px", fontSize: "12px" }}>
          SESSION ARCHIVES:
        </div>

        {chats.map((chat) => (
          <div
            key={chat.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
              padding: "8px",
              backgroundColor: activeChatId === chat.id ? "rgba(0, 50, 0, 0.8)" : "rgba(0, 20, 0, 0.6)",
              border: `1px solid ${activeChatId === chat.id ? "#0F0" : "#063"}`,
              borderRadius: "3px",
              cursor: "pointer",
              boxShadow: activeChatId === chat.id ? "0 0 8px #0F0" : "none",
              transition: "all 0.3s ease"
            }}
            onClick={() => switchChat(chat.id)}
            onMouseOver={(e) => {
              if (activeChatId !== chat.id) {
                e.currentTarget.style.backgroundColor = "rgba(0, 30, 0, 0.8)";
                e.currentTarget.style.boxShadow = "0 0 5px #0F0";
              }
            }}
            onMouseOut={(e) => {
              if (activeChatId !== chat.id) {
                e.currentTarget.style.backgroundColor = "rgba(0, 20, 0, 0.6)";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
          >
            <span style={{ fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {chat.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteChat(chat.id);
              }}
              style={{ 
                background: "none", 
                border: "none", 
                cursor: "pointer",
                color: "#F00",
                fontSize: "14px",
                textShadow: "0 0 3px #F00"
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Main chat interface */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 1 }}>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            backgroundColor: "rgba(0, 5, 0, 0.95)",
            borderBottom: "1px solid #0F0",
            position: "relative"
          }}
        >
          <h2 style={{ 
            color: "#0F0", 
            textAlign: "center", 
            marginBottom: "20px", 
            fontFamily: "'Courier New', monospace",
            textShadow: "0 0 5px #0F0",
            letterSpacing: "2px"
          }}>
            DEEPSEEK NEURAL NETWORK INTERFACE v2.1
          </h2>

          <div style={{
            position: "absolute",
            top: "15px",
            right: "15px",
            backgroundColor: "rgba(0, 20, 0, 0.8)",
            padding: "5px 10px",
            border: "1px solid #0F0",
            borderRadius: "3px",
            boxShadow: "0 0 5px #0F0",
            fontSize: "12px"
          }}>
            MODEL: {model === "deepseek-chat" ? "STANDARD" : "R1-ADVANCED"}
          </div>

          {messages.length === 0 && !isStreaming && (
            <div style={{
              textAlign: "center",
              opacity: 0.6,
              marginTop: "50px",
              animation: "pulse 2s infinite",
            }}>
              <div style={{ fontSize: "14px", marginBottom: "10px" }}>NO ACTIVE COMMUNICATION</div>
              <div style={{ fontSize: "12px" }}>INITIALIZE SESSION OR SELECT ARCHIVED SESSION</div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                margin: "10px 0",
                padding: "12px",
                border: `1px solid ${msg.role === "user" ? "#063" : "#0F0"}`,
                borderRadius: "3px",
                backgroundColor: msg.role === "user" ? "rgba(0, 10, 0, 0.7)" : "rgba(0, 20, 0, 0.7)",
                boxShadow: `0 0 10px ${msg.role === "user" ? "rgba(0, 100, 0, 0.2)" : "rgba(0, 255, 0, 0.2)"}`,
                position: "relative",
                animation: index === messages.length - 1 && msg.role === "assistant" ? "fadeIn 0.5s" : "none",
              }}
            >
              <div style={{ 
                marginBottom: "8px", 
                color: msg.role === "user" ? "#8F8" : "#0F0",
                fontSize: "14px",
                fontWeight: "bold",
                textShadow: `0 0 5px ${msg.role === "user" ? "#8F8" : "#0F0"}`
              }}>
                {msg.role === "user" ? "USER_INPUT:" : "DEEPSEEK_OUTPUT:"}
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  margin: "0",
                  fontFamily: "'Courier New', monospace",
                  fontSize: "14px",
                  lineHeight: "1.5"
                }}
              >
                {msg.content}
              </pre>
              {msg.role === "assistant" && (
                <button
                  onClick={() => handleCopyResponse(msg.content)}
                  style={{
                    position: "absolute",
                    bottom: "8px",
                    right: "8px",
                    background: "rgba(0, 30, 0, 0.8)",
                    border: "1px solid #0F0",
                    borderRadius: "3px",
                    padding: "3px 8px",
                    cursor: "pointer",
                    color: "#0F0",
                    fontSize: "12px",
                    fontFamily: "'Courier New', monospace",
                    boxShadow: "0 0 5px rgba(0, 255, 0, 0.3)",
                    transition: "all 0.3s ease"
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = "rgba(0, 50, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 8px rgba(0, 255, 0, 0.5)";
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = "rgba(0, 30, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 5px rgba(0, 255, 0, 0.3)";
                  }}
                >
                  COPY
                </button>
              )}
            </div>
          ))}

          {isStreaming && (
            <div
              style={{
                margin: "10px 0",
                padding: "12px",
                border: "1px solid #0F0",
                borderRadius: "3px",
                backgroundColor: "rgba(0, 20, 0, 0.7)",
                boxShadow: "0 0 10px rgba(0, 255, 0, 0.2)",
                position: "relative",
                animation: "typing 1s infinite",
              }}
            >
              <div style={{ 
                marginBottom: "8px", 
                color: "#0F0",
                fontSize: "14px",
                fontWeight: "bold",
                textShadow: "0 0 5px #0F0"
              }}>
                DEEPSEEK_OUTPUT:
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  margin: "0",
                  fontFamily: "'Courier New', monospace",
                  fontSize: "14px",
                  lineHeight: "1.5"
                }}
              >
                {streamingResponse}
                <span style={{ 
                  display: "inline-block", 
                  width: "8px", 
                  height: "15px", 
                  backgroundColor: "#0F0", 
                  marginLeft: "3px",
                  animation: "blink 1s infinite",
                }}></span>
              </pre>
            </div>
          )}
        </div>

        {/* Prompt box and buttons at the bottom */}
        <div
          style={{
            padding: "20px",
            backgroundColor: "rgba(0, 10, 0, 0.9)",
            borderTop: "1px solid #0F0",
            boxShadow: "0 -5px 15px rgba(0, 100, 0, 0.2)"
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ENTER COMMAND SEQUENCE..."
            rows={3}
            style={{ 
              width: "100%", 
              marginBottom: "15px", 
              fontSize: "14px",
              padding: "12px",
              backgroundColor: "rgba(0, 20, 0, 0.8)",
              color: "#0F0",
              border: "1px solid #0F0",
              borderRadius: "3px",
              fontFamily: "'Courier New', monospace",
              resize: "none",
              boxShadow: "0 0 10px rgba(0, 255, 0, 0.2)"
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <label 
                htmlFor="file-upload" 
                style={{ 
                  display: "inline-block",
                  backgroundColor: "rgba(0, 20, 0, 0.8)",
                  color: "#0F0",
                  border: "1px solid #0F0",
                  padding: "8px 12px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  marginRight: "10px",
                  fontSize: "13px",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: "0 0 5px rgba(0, 255, 0, 0.3)",
                  transition: "all 0.3s ease"
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = "rgba(0, 40, 0, 0.8)";
                  e.target.style.boxShadow = "0 0 8px rgba(0, 255, 0, 0.5)";
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = "rgba(0, 20, 0, 0.8)";
                  e.target.style.boxShadow = "0 0 5px rgba(0, 255, 0, 0.3)";
                }}
              >
                UPLOAD FILES
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".txt,.js,.py,.java"
                onChange={handleFileUpload}
                multiple
                style={{ display: "none" }}
              />

              <button 
                onClick={handleModelSwitch}
                style={{ 
                  backgroundColor: "rgba(0, 20, 0, 0.8)",
                  color: "#0F0",
                  border: "1px solid #0F0",
                  padding: "8px 12px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: "0 0 5px rgba(0, 255, 0, 0.3)",
                  transition: "all 0.3s ease"
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = "rgba(0, 40, 0, 0.8)";
                  e.target.style.boxShadow = "0 0 8px rgba(0, 255, 0, 0.5)";
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = "rgba(0, 20, 0, 0.8)";
                  e.target.style.boxShadow = "0 0 5px rgba(0, 255, 0, 0.3)";
                }}
              >
                SWITCH TO {model === "deepseek-chat" ? "R1-ADVANCED" : "STANDARD"} MODEL
              </button>
            </div>

            <div>
              {isStreaming && (
                <button 
                  onClick={handleStopStream}
                  style={{ 
                    backgroundColor: "rgba(50, 0, 0, 0.8)",
                    color: "#F66",
                    border: "1px solid #F66",
                    padding: "8px 12px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    marginRight: "10px",
                    fontSize: "13px",
                    fontFamily: "'Courier New', monospace",
                    boxShadow: "0 0 5px rgba(255, 100, 100, 0.3)",
                    transition: "all 0.3s ease"
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = "rgba(70, 0, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 8px rgba(255, 100, 100, 0.5)";
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = "rgba(50, 0, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 5px rgba(255, 100, 100, 0.3)";
                  }}
                >
                  TERMINATE STREAM
                </button>
              )}

              <button 
                onClick={handleSubmit} 
                disabled={isStreaming}
                style={{ 
                  backgroundColor: isStreaming ? "rgba(0, 20, 0, 0.4)" : "rgba(0, 30, 0, 0.8)",
                  color: isStreaming ? "#070" : "#0F0",
                  border: `1px solid ${isStreaming ? "#070" : "#0F0"}`,
                  padding: "8px 16px",
                  borderRadius: "3px",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: "bold",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: isStreaming ? "none" : "0 0 8px rgba(0, 255, 0, 0.4)",
                  transition: "all 0.3s ease"
                }}
                onMouseOver={(e) => {
                  if (!isStreaming) {
                    e.target.style.backgroundColor = "rgba(0, 50, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 12px rgba(0, 255, 0, 0.6)";
                  }
                }}
                onMouseOut={(e) => {
                  if (!isStreaming) {
                    e.target.style.backgroundColor = "rgba(0, 30, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 8px rgba(0, 255, 0, 0.4)";
                  }
                }}
              >
                {isStreaming ? "PROCESSING..." : "EXECUTE"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global scanlines overlay */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: `linear-gradient(0deg, transparent 50%, rgba(0, 255, 0, 0.05) 51%)`,
        backgroundSize: "4px 4px",
        pointerEvents: "none",
        zIndex: 2
      }}></div>

      {/* CRT screen effect */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        boxShadow: "inset 0 0 30px rgba(0, 255, 0, 0.2)",
        pointerEvents: "none",
        zIndex: 3
      }}></div>
    </div>
  );
};

export default App;