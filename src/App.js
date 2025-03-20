import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import OpenAI from "openai";
import "./App.css";

const App = () => {
  const [chats, setChats] = useState([]); // All chats
  const [activeChatId, setActiveChatId] = useState(null); // Currently active chat
  const [messages, setMessages] = useState([]); // Messages in the active chat
  const [prompt, setPrompt] = useState("");
  const [streamingResponse, setStreamingResponse] = useState(""); // Streaming response
  const [uploadedFiles, setUploadedFiles] = useState([]); // Array of objects: { name: string, content: string }
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState("deepseek-chat");
  const [uploadConfirmation, setUploadConfirmation] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(""); // New state for system prompt
  const [isSystemPromptOverlayOpen, setIsSystemPromptOverlayOpen] = useState(false); // New state for overlay
  const abortController = useRef(null);
  const messagesEndRef = useRef(null);


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


  //remove file function to remove files from context
  const removeFile = async (fileName) => {
    setUploadedFiles((prev) => prev.filter((file) => file.name !== fileName));
    try {
      await axios.delete(`http://localhost:5000/delete-file/${activeChatId}/${fileName}`);
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  };

  // Load saved chats on app startup
  useEffect(() => {
    axios
      .get("http://localhost:5000/load-chats")
      .then((response) => {
        const sortedChats = response.data.sort((a, b) => b.id - a.id); // Sort by ID (descending)
        setChats(sortedChats);
        // Do not set activeChatId or switchChat here; leave it null for home page
        setActiveChatId(null); // Explicitly ensure no default chat
        setMessages([]); // Clear messages for home page
        setUploadedFiles([]); // Clear files for home page
      })
      .catch((error) => console.error("Error loading chats:", error));
  }, []);

  // New useEffect to load system prompt
  useEffect(() => {
    axios
      .get("http://localhost:5000/load-system-prompt")
      .then((response) => {
        setSystemPrompt(response.data.systemPrompt || "");
      })
      .catch((error) => {
        console.error("Error loading system prompt:", error);
        setSystemPrompt(""); // Fallback to empty string
      });
  }, []);

  // Create a new chat
  const createNewChat = async () => {
    const newChatId = Date.now().toString();
    const newChatName = `Session-${new Date().toLocaleString().replace(/[\/,:\s]/g, '-')}`;

    const newChat = { id: newChatId, name: newChatName };

    await axios.post("http://localhost:5000/save-chat", {
      chatId: newChatId,
      name: newChatName,
      messages: []
    });

    setChats(prev => [...prev, newChat]);
    setActiveChatId(newChatId);
    setMessages([]);

    return newChat; // Return the new chat object
  };

  // Switch to an existing chat
  const switchChat = async (chatId) => {
    try { // Wrap in try-catch
      const messagesResponse = await axios.get(`http://localhost:5000/load-chat/${chatId}`);
      setMessages(messagesResponse.data || []); // Fallback to empty array if no data

      const filesResponse = await axios.get(`http://localhost:5000/load-files/${chatId}`);
      setUploadedFiles(filesResponse.data || []); // Fallback to empty array if no data

      setActiveChatId(chatId);
    } catch (error) {
      console.error("Error switching chat:", error);
      setMessages([]); // Reset to avoid layout issues
      setUploadedFiles([]);
      setActiveChatId(chatId); // Still switch, but with safe state
    }
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
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files).slice(0, 10);
    if (files.length > 0) {
      const fileReaders = files.map((file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({ name: file.name, content: e.target.result });
          };
          reader.readAsText(file);
        });
      });
  
      const newFileData = await Promise.all(fileReaders);
  
      // Merge new files with existing ones, replacing duplicates
      const updatedFiles = [...uploadedFiles];
      newFileData.forEach((newFile) => {
        const index = updatedFiles.findIndex((f) => f.name === newFile.name);
        if (index !== -1) {
          updatedFiles[index] = newFile; // Replace if exists
        } else {
          updatedFiles.push(newFile); // Add if new
        }
      });
  
      setUploadedFiles(updatedFiles);
  
      try {
        await axios.post(`http://localhost:5000/save-files/${activeChatId}`, {
          files: updatedFiles, // Send the full list
        });
        console.log("Files uploaded successfully");
      } catch (error) {
        console.error("Error uploading files:", error);
      }
  
      setUploadConfirmation(`${files.length} file(s) uploaded successfully as context.`);
      setTimeout(() => setUploadConfirmation(""), 3000);
    }
  };

  // Handle prompt submission
  const handleSubmit = async () => {
    if (!prompt.trim() && uploadedFiles.length === 0) return;

    let activeChat;
    if (!activeChatId) {
      activeChat = await createNewChat();
    } else {
      activeChat = chats.find((chat) => chat.id === activeChatId) || {
        id: activeChatId,
        name: `Session-${new Date().toLocaleString().replace(/[\/,:\s]/g, '-')}`,
      };
    }

    const userMessage = { role: "user", content: prompt };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setPrompt(""); // Clear the prompt box here

    console.log("Saving chat with body:", {
      chatId: activeChat.id,
      name: activeChat.name,
      messages: updatedMessages
    });

    try {
      await axios.post("http://localhost:5000/save-chat", {
        chatId: activeChat.id,
        name: activeChat.name,
        messages: updatedMessages,
      });
    } catch (error) {
      console.error("Error saving chat:", error.response ? error.response.data : error.message);
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Error: Unable to save chat. Please try again." },
      ]);
      return;
    }

    // Proceed with streaming (assuming this part works fine)
    setIsStreaming(true);
    abortController.current = new AbortController();

    try {
      const fileContext = uploadedFiles.map((file) => file.content).join("\n");

      const streamMessages = [...updatedMessages];
      if (systemPrompt.trim()) {
        streamMessages.unshift({ role: "system", content: systemPrompt });
      }
      if (fileContext.trim()) {
        streamMessages.push({ role: "system", content: fileContext });
      }

      const stream = await openai.chat.completions.create(
        {
          model: model,
          messages: streamMessages,
          stream: true,
        },
        { signal: abortController.current.signal }
      );

      let assistantMessage = { role: "assistant", content: "" };
      for await (const chunk of stream) {
        if (chunk.choices[0].delta.content) {
          assistantMessage.content += chunk.choices[0].delta.content;
          setStreamingResponse(assistantMessage.content);
          scrollToBottom();
        }
      }

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      setStreamingResponse("");
      scrollToBottom();

      await axios.post("http://localhost:5000/save-chat", {
        chatId: activeChat.id,
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
      prev === "deepseek-chat" ? "deepseek-reasoner" : "deepseek-chat"
    );
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current && messagesEndRef.current) {
      const container = messagesContainerRef.current;
      const { scrollTop, scrollHeight, clientHeight } = container;

      // Check if the user is within 50px of the bottom
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 2000;

      if (isNearBottom) {
        container.scrollTo({
          top: messagesEndRef.current.offsetTop,
          behavior: "smooth",
        });
      }
    }
  };

  // Add a new state for the model button visibility
  const [isModelButtonVisible, setIsModelButtonVisible] = useState(true);

  // Add a ref for the scrollable messages container
  const messagesContainerRef = useRef(null);

  // Add a scroll event listener to toggle the model button visibility
  useEffect(() => {
    const handleScroll = () => {
      if (messagesContainerRef.current) {
        const scrollPosition = messagesContainerRef.current.scrollTop;
        // Hide the button if scrolled more than 10px, show if near the top
        setIsModelButtonVisible(scrollPosition <= 10);
      }
    };

    const messagesContainer = messagesContainerRef.current;
    if (messagesContainer) {
      messagesContainer.addEventListener("scroll", handleScroll);
    }

    // Cleanup the event listener on component unmount
    return () => {
      if (messagesContainer) {
        messagesContainer.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

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

  const renderMessageContent = (content) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const boldRegex = /\*\*(.*?)\*\*/g; // Matches text between ** for bold
    const headingRegex = /^###\s*(.+)$/gm; // Matches ### followed by text at the start of a line
    const parts = [];
    let lastIndex = 0;
    let match;

    // First, split content by code blocks
    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before the code block, if any
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        // Split by newlines
        const lines = textBefore.split("\n");
        lines.forEach((line, lineIndex) => {
          if (line.trim() === "---") {
            // Render a divider for "---"
            parts.push(
              <div
                key={`divider-${lastIndex}-${lineIndex}`}
                style={{
                  borderTop: "1px solid #0F0",
                  margin: "20px 0",
                  opacity: 0.5,
                }}
              />
            );
          } else if (line.trim().match(headingRegex)) {
            // Render a heading for "###"
            const headingText = line.replace(/^###\s*/, ""); // Remove "### " prefix
            let textLastIndex = 0;
            let boldMatch;
            const headingParts = [];
            while ((boldMatch = boldRegex.exec(headingText)) !== null) {
              if (boldMatch.index > textLastIndex) {
                headingParts.push(
                  <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                    {headingText.slice(textLastIndex, boldMatch.index)}
                  </span>
                );
              }
              headingParts.push(
                <strong key={`${lastIndex}-${lineIndex}-${boldMatch.index}`}>
                  {boldMatch[1]}
                </strong>
              );
              textLastIndex = boldMatch.index + boldMatch[0].length;
            }
            if (textLastIndex < headingText.length) {
              headingParts.push(
                <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                  {headingText.slice(textLastIndex)}
                </span>
              );
            }
            parts.push(
              <h3
                key={`heading-${lastIndex}-${lineIndex}`}
                style={{
                  color: "#0F0",
                  fontFamily: "'Courier New', monospace",
                  fontSize: "16px",
                  fontWeight: "bold",
                  textShadow: "0 0 5px #0F0",
                  margin: "15px 0",
                  letterSpacing: "1px",
                }}
              >
                {headingParts}
              </h3>
            );
          } else if (line.trim() !== "") {
            // Process regular text lines
            let textLastIndex = 0;
            let boldMatch;
            const lineParts = [];
            while ((boldMatch = boldRegex.exec(line)) !== null) {
              if (boldMatch.index > textLastIndex) {
                lineParts.push(
                  <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                    {line.slice(textLastIndex, boldMatch.index)}
                  </span>
                );
              }
              lineParts.push(
                <strong key={`${lastIndex}-${lineIndex}-${boldMatch.index}`}>
                  {boldMatch[1]}
                </strong>
              );
              textLastIndex = boldMatch.index + boldMatch[0].length;
            }
            if (textLastIndex < line.length) {
              lineParts.push(
                <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                  {line.slice(textLastIndex)}
                </span>
              );
            }
            parts.push(
              <div key={`line-${lastIndex}-${lineIndex}`}>
                {lineParts}
              </div>
            );
          }
          // Add a line break between lines, but not after the last line or headings/dividers
          if (
            lineIndex < lines.length - 1 &&
            line.trim() !== "---" &&
            !line.trim().match(headingRegex) &&
            line.trim() !== ""
          ) {
            parts.push(<br key={`br-${lastIndex}-${lineIndex}`} />);
          }
        });
        // Add spacing after non-code text block
        parts.push(<div key={`spacer-${match.index}`} style={{ marginBottom: "10px" }} />);
      }

      // Add the code block
      const language = match[1] || "";
      const code = match[2];
      parts.push(
        <div
          key={`code-${parts.length}`}
          style={{
            position: "relative",
            margin: "10px 0",
            padding: "10px",
            backgroundColor: "#000", // Solid black background
            border: "1px solid #0F0",
            borderRadius: "3px",
            zIndex: 5, // Ensure it sits above CRT and scanline effects
            overflow: "hidden", // Prevent scanlines from bleeding through
          }}
        >
          <pre
            style={{
              backgroundColor: "transparent", // No additional background
              padding: "0",
              margin: "0",
              overflowX: "auto",
              color: "#FFF", // White text for code
              fontFamily: "'Courier New', monospace",
              fontSize: "14px",
            }}
          >
            <code>{code}</code>
          </pre>
          <button
            onClick={() => handleCopyResponse(code)}
            style={{
              position: "absolute",
              top: "5px",
              right: "5px",
              background: "rgba(0, 30, 0, 0.8)",
              color: "#0F0",
              border: "1px solid #0F0",
              padding: "3px 8px",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "'Courier New', monospace",
              boxShadow: "0 0 5px rgba(0, 255, 0, 0.3)",
              transition: "all 0.3s ease",
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
            COPY CODE
          </button>
        </div>
      );
      lastIndex = codeBlockRegex.lastIndex;
    }

    // Add remaining text after the last code block, if any
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex);
      const lines = remainingText.split("\n");
      lines.forEach((line, lineIndex) => {
        if (line.trim() === "---") {
          // Render a divider for "---"
          parts.push(
            <div
              key={`divider-${lastIndex}-${lineIndex}`}
              style={{
                borderTop: "1px solid #0F0",
                margin: "20px 0",
                opacity: 0.5,
              }}
            />
          );
        } else if (line.trim().match(headingRegex)) {
          // Render a heading for "###"
          const headingText = line.replace(/^###\s*/, ""); // Remove "### " prefix
          let textLastIndex = 0;
          let boldMatch;
          const headingParts = [];
          while ((boldMatch = boldRegex.exec(headingText)) !== null) {
            if (boldMatch.index > textLastIndex) {
              headingParts.push(
                <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                  {headingText.slice(textLastIndex, boldMatch.index)}
                </span>
              );
            }
            headingParts.push(
              <strong key={`${lastIndex}-${lineIndex}-${boldMatch.index}`}>
                {boldMatch[1]}
              </strong>
            );
            textLastIndex = boldMatch.index + boldMatch[0].length;
          }
          if (textLastIndex < headingText.length) {
            headingParts.push(
              <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                {headingText.slice(textLastIndex)}
              </span>
            );
          }
          parts.push(
            <h3
              key={`heading-${lastIndex}-${lineIndex}`}
              style={{
                color: "#0F0",
                fontFamily: "'Courier New', monospace",
                fontSize: "16px",
                fontWeight: "bold",
                textShadow: "0 0 5px #0F0",
                margin: "15px 0",
                letterSpacing: "1px",
              }}
            >
              {headingParts}
            </h3>
          );
        } else if (line.trim() !== "") {
          // Process regular text lines
          let textLastIndex = 0;
          let boldMatch;
          const lineParts = [];
          while ((boldMatch = boldRegex.exec(line)) !== null) {
            if (boldMatch.index > textLastIndex) {
              lineParts.push(
                <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                  {line.slice(textLastIndex, boldMatch.index)}
                </span>
              );
            }
            lineParts.push(
              <strong key={`${lastIndex}-${lineIndex}-${boldMatch.index}`}>
                {boldMatch[1]}
              </strong>
            );
            textLastIndex = boldMatch.index + boldMatch[0].length;
          }
          if (textLastIndex < line.length) {
            lineParts.push(
              <span key={`${lastIndex}-${lineIndex}-${textLastIndex}`}>
                {line.slice(textLastIndex)}
              </span>
            );
          }
          parts.push(
            <div key={`line-${lastIndex}-${lineIndex}`}>
              {lineParts}
            </div>
          );
        }
        // Add a line break between lines, but not after the last line or headings/dividers
        if (
          lineIndex < lines.length - 1 &&
          line.trim() !== "---" &&
          !line.trim().match(headingRegex) &&
          line.trim() !== ""
        ) {
          parts.push(<br key={`br-${lastIndex}-${lineIndex}`} />);
        }
      });
    }

    return parts;
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

      {/* Sidebar for chat history */}
      <div
        style={{
          width: "250px",
          minWidth: "250px", //prevents sidebar shrink
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
          marginBottom: "10px",
          borderBottom: "1px solid #0F0",
          paddingBottom: "10px"
        }}>
          <h2 style={{
            color: "#0F0",
            fontFamily: "'Courier New', monospace",
            textShadow: "0 0 5px #0F0",
            fontSize: "36px"
          }}>WHALE</h2>

          <button
            onClick={() => setIsSystemPromptOverlayOpen(true)}
            style={{
              width: "100%",
              marginTop: "10px",
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
            SET SYSTEM PROMPT
          </button>
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
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          zIndex: 1,
          position: "relative",
          height: "100vh", // Ensure it takes the full viewport height
        }}
      >
        {/* Scrollable Messages Section */}
        <div
          ref={messagesContainerRef} // Attach the ref to the scrollable container
          style={{
            flex: 1, // Take up remaining space
            overflowY: "auto", // Scrollable
            padding: "20px",
            backgroundColor: "rgba(0, 5, 0, 0.95)",
            borderBottom: "1px solid #0F0",
            position: "relative", // Ensure sticky positioning works
          }}
          className="main-content-scroll"
        >
          <h2
            style={{
              color: "#0F0",
              textAlign: "center",
              marginBottom: "20px",
              fontFamily: "'Courier New', monospace",
              textShadow: "0 0 5px #0F0",
              letterSpacing: "2px",
            }}
          >
            DEEPSEEK NEURAL NETWORK INTERFACE v2.1
          </h2>

          {/* Model Button with Sticky Positioning and Visibility Toggle */}
          <div
            style={{
              position: "sticky",
              top: "15px",
              right: "15px",
              alignSelf: "flex-end", // Align to the right
              backgroundColor: "rgba(0, 20, 0, 0.8)",
              padding: "5px 10px",
              border: "1px solid #0F0",
              borderRadius: "3px",
              boxShadow: "0 0 5px #0F0",
              fontSize: "12px",
              opacity: isModelButtonVisible ? 1 : 0, // Toggle visibility
              transition: "opacity 0.3s ease", // Smooth fade effect
              zIndex: 2, // Ensure it stays above messages
            }}
          >
            CURRENT MODEL: {model === "deepseek-chat" ? "STANDARD" : "THINKING"}
          </div>

          {messages.length === 0 && !isStreaming && (
            <div
              style={{
                textAlign: "center",
                opacity: 0.6,
                marginTop: "50px",
                animation: "pulse 2s infinite",
              }}
            >
              <div style={{ fontSize: "14px", marginBottom: "10px" }}>
                NO ACTIVE COMMUNICATION
              </div>
              <div style={{ fontSize: "12px" }}>
                INITIALIZE SESSION OR SELECT ARCHIVED SESSION
              </div>
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
                backgroundColor:
                  msg.role === "user" ? "rgba(0, 10, 0, 0.7)" : "rgba(0, 20, 0, 0.7)",
                boxShadow: `0 0 10px ${msg.role === "user" ? "rgba(0, 100, 0, 0.2)" : "rgba(0, 255, 0, 0.2)"
                  }`,
                position: "relative",
                animation:
                  index === messages.length - 1 && msg.role === "assistant"
                    ? "fadeIn 0.5s"
                    : "none",
              }}
            >
              <div
                style={{
                  marginBottom: "8px",
                  color: msg.role === "user" ? "#8F8" : "#0F0",
                  fontSize: "14px",
                  fontWeight: "bold",
                  textShadow: `0 0 5px ${msg.role === "user" ? "#8F8" : "#0F0"}`,
                }}
              >
                {msg.role === "user" ? "USER_INPUT:" : "DEEPSEEK_OUTPUT:"}
              </div>
              <div
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: "14px",
                  lineHeight: "1.5",
                }}
              >
                {renderMessageContent(msg.content)}
              </div>
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
                    transition: "all 0.3s ease",
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
              <div
                style={{
                  marginBottom: "8px",
                  color: "#0F0",
                  fontSize: "14px",
                  fontWeight: "bold",
                  textShadow: "0 0 5px #0F0",
                }}
              >
                DEEPSEEK_OUTPUT:
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  margin: "0",
                  fontFamily: "'Courier New', monospace",
                  fontSize: "14px",
                  lineHeight: "1.5",
                }}
              >
                {streamingResponse}
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "15px",
                    backgroundColor: "#0F0",
                    marginLeft: "3px",
                    animation: "blink 1s infinite",
                  }}
                ></span>
              </pre>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll-to-Bottom Button */}
        <button
          onClick={() => {
            if (messagesEndRef.current) {
              const scrollContainer = messagesEndRef.current.parentElement;
              scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: "smooth",
              });
            }
          }}
          style={{
            position: "fixed",
            bottom: "175px", // Position just above the prompt box
            left: "85.5%",
            transform: "translateX(50%)",
            backgroundColor: "rgba(0, 30, 0, 0.8)",
            color: "#0F0",
            border: "1px solid #0F0",
            padding: "6px 10px",
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "12px",
            fontFamily: "'Courier New', monospace",
            boxShadow: "0 0 5px rgba(0, 255, 0, 0.3)",
            transition: "all 0.3s ease",
            zIndex: 10,
            width: "auto",
            minWidth: "120px",
            whiteSpace: "nowrap",
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
          SCROLL TO BOTTOM
        </button>
        {uploadConfirmation && (
          <div
            style={{
              position: "absolute",
              bottom: "175px", // Adjust this value to position it above the prompt box
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 20px",
              backgroundColor: "rgba(0, 20, 0, 0.8)",
              color: "#0F0",
              fontFamily: "'Courier New', monospace",
              fontSize: "12px",
              border: "1px solid #0F0", // Changed from borderBottom to full border for a floating box
              borderRadius: "3px",
              textAlign: "center",
              zIndex: 10, // Higher than other elements to ensure visibility
              boxShadow: "0 0 10px rgba(0, 255, 0, 0.3)",
            }}
          >
            {uploadConfirmation}
          </div>
        )}
        {/* Prompt Box Section */}
        <div
          style={{
            padding: "10px 20px 20px 20px",
            backgroundColor: "rgba(0, 10, 0, 0.9)",
            borderTop: "1px solid #0F0",
            boxShadow: "0 -5px 15px rgba(0, 100, 0, 0.2)",
            zIndex: 2,
            height: "180px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {uploadedFiles.length > 0 && (
            <div
              style={{
                marginBottom: "10px",
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                fontSize: "12px",
                color: "#8F8",
                height: "30px", // Fixed height for file display
                overflowY: "hidden",
                overflowX: "auto", // Scroll if too many files
              }}
            >
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "rgba(0, 20, 0, 0.8)",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    border: "1px solid #0F0",
                    boxShadow: "0 0 3px rgba(0, 255, 0, 0.2)",
                  }}
                >
                  <span style={{ marginRight: "5px" }}>{file.name}</span>
                  <button
                    onClick={() => removeFile(file.name)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#F66",
                      fontSize: "12px",
                      cursor: "pointer",
                      padding: "0",
                      lineHeight: "1",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
      
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ENTER COMMAND SEQUENCE..."
            rows={5}
            style={{
              width: "90%",
              marginBottom: "15px",
              fontSize: "14px",
              padding: "12px",
              backgroundColor: "rgba(0, 20, 0, 0.8)",
              color: "#0F0",
              border: "1px solid #0F0",
              borderRadius: "3px",
              fontFamily: "'Courier New', monospace",
              resize: "none",
              boxShadow: "0 0 10px rgba(0, 255, 0, 0.2)",
              height: "100px", // Adjusted from 90px to fit the fixed space
              flex: "1 1 auto", // Allow it to fill available space
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <label
                htmlFor="file-upload"
                style={{
                  backgroundColor: "rgba(0, 20, 0, 0.8)",
                  color: "#0F0",
                  border: "1px solid #0F0",
                  padding: "6px 8px",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: "0 0 5px #0F0",
                  transition: "all 0.3s ease",
                  display: "inline-block",
                  borderRadius: "3px",
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
                UPLOAD FILES
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".txt,.js,.py,.java"
                onChange={handleFileUpload}
                multiple
                style={{ display: "none" }}
                disabled={!activeChatId}
              />

              <button
                onClick={handleModelSwitch}
                style={{
                  backgroundColor: "rgba(0, 20, 0, 0.8)",
                  color: "#0F0",
                  border: "1px solid #0F0",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: "0 0 5px #0F0",
                  transition: "all 0.3s ease",
                  borderRadius: "3px",
                  marginLeft: "10px",
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
                SWITCH TO {model === "deepseek-chat" ? "THINKING" : "STANDARD"} MODEL
              </button>
            </div>
            <div>
              {isStreaming && (
                <button
                  onClick={handleStopStream}
                  style={{
                    backgroundColor: isStreaming ? "rgba(0, 20, 0, 0.8)" : "rgba(0, 20, 0, 0.8)",
                    color: "#F00", // Red to indicate termination/danger
                    border: "1px solid #F00",
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontFamily: "'Courier New', monospace",
                    boxShadow: "0 0 5px #F00",
                    transition: "all 0.3s ease",
                    borderRadius: "3px",
                    marginRight: "10px", // Space before the "EXECUTE" button
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = "rgba(0, 40, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 10px #F00";
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = "rgba(0, 20, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 5px #F00";
                  }}
                >
                  TERMINATE STREAM
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={isStreaming || !prompt.trim()} // Add !prompt.trim() to disable when empty
                style={{
                  backgroundColor: isStreaming
                    ? "rgba(0, 10, 0, 0.8)"
                    : "rgba(0, 20, 0, 0.8)",
                  color: isStreaming ? "#666" : "#0F0",
                  border: "1px solid #0F0",
                  padding: "8px 12px",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: "0 0 5px #0F0",
                  transition: "all 0.3s ease",
                  borderRadius: "3px",
                  marginLeft: "10px",
                }}
                onMouseOver={(e) => {
                  if (!isStreaming) {
                    e.target.style.backgroundColor = "rgba(0, 40, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 10px #0F0";
                  }
                }}
                onMouseOut={(e) => {
                  if (!isStreaming) {
                    e.target.style.backgroundColor = "rgba(0, 20, 0, 0.8)";
                    e.target.style.boxShadow = "0 0 5px #0F0";
                  }
                }}
              >
                {isStreaming ? "PROCESSING..." : "EXECUTE"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {isSystemPromptOverlayOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            zIndex: 10,
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <div
            style={{
              width: "500px",
              padding: "10px 20px",
              backgroundColor: "rgba(0, 10, 0, 0.95)",
              border: "1px solid #0F0",
              borderRadius: "5px",
              boxShadow: "0 0 15px rgba(0, 255, 0, 0.3)",
              color: "#0F0",
              fontFamily: "'Courier New', monospace"
            }}
          >
            <h3 style={{ textAlign: "center", marginBottom: "15px", textShadow: "0 0 5px #0F0" }}>
              SYSTEM PROMPT CONFIGURATION
            </h3>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="ENTER SYSTEM PROMPT (e.g., 'Be concise' or leave blank)..."
              rows={5}
              style={{
                width: "calc(100% - 20px)",
                padding: "10px",
                backgroundColor: "rgba(0, 20, 0, 0.8)",
                color: "#0F0",
                border: "1px solid #0F0",
                borderRadius: "3px",
                fontFamily: "'Courier New', monospace",
                resize: "none",
                boxShadow: "0 0 5px rgba(0, 255, 0, 0.2)"
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "15px" }}>
              <button
                onClick={() => {
                  axios
                    .post("http://localhost:5000/save-system-prompt", {
                      systemPrompt: systemPrompt
                    })
                    .then(() => {
                      console.log("System prompt saved");
                      setIsSystemPromptOverlayOpen(false);
                    })
                    .catch((error) => {
                      console.error("Error saving system prompt:", error);
                    });
                }}
                style={{
                  backgroundColor: "rgba(0, 20, 0, 0.8)",
                  color: "#0F0",
                  border: "1px solid #0F0",
                  padding: "8px 12px",
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
                SAVE AND CLOSE
              </button>

              <button
                onClick={() => {
                  setSystemPrompt("");
                  axios
                    .post("http://localhost:5000/save-system-prompt", {
                      systemPrompt: ""
                    })
                    .then(() => {
                      console.log("System prompt cleared");
                      setIsSystemPromptOverlayOpen(false);
                    })
                    .catch((error) => {
                      console.error("Error clearing system prompt:", error);
                    });
                }}
                style={{
                  backgroundColor: "rgba(0, 20, 0, 0.8)",
                  color: "#F00",
                  border: "1px solid #F00",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  boxShadow: "0 0 5px #F00",
                  transition: "all 0.3s ease"
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = "rgba(0, 40, 0, 0.8)";
                  e.target.style.boxShadow = "0 0 10px #F00";
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = "rgba(0, 20, 0, 0.8)";
                  e.target.style.boxShadow = "0 0 5px #F00";
                }}
              >
                CLEAR AND CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

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