const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure the chats directory exists
const chatsDir = path.join(__dirname, "chats");
if (!fs.existsSync(chatsDir)) {
  fs.mkdirSync(chatsDir);
}

// Save uploaded files for a specific chat
app.post("/save-files/:chatId", (req, res) => {
  const chatId = req.params.chatId;
  const files = req.body.files; // Array of { name, content }

  console.log("Received files for chat:", chatId, files); // Debug log

  // Create a directory for the chat if it doesn't exist
  const chatDir = path.join(chatsDir, chatId);
  if (!fs.existsSync(chatDir)) {
    fs.mkdirSync(chatDir, { recursive: true });
  }

  // Clear existing files in the directory (except chat.json)
  fs.readdirSync(chatDir)
    .filter((fileName) => fileName !== "chat.json")
    .forEach((fileName) => {
      const filePath = path.join(chatDir, fileName);
      fs.unlinkSync(filePath);
      console.log("Deleted existing file:", filePath); // Debug log
    });

  // Save each file in the chat's directory
  files.forEach((file) => {
    const filePath = path.join(chatDir, file.name);
    console.log("Saving file:", filePath); // Debug log
    fs.writeFileSync(filePath, file.content);
  });

  res.send("Files saved successfully");
});

// Load files for a specific chat
app.get("/load-files/:chatId", (req, res) => {
  const chatId = req.params.chatId;
  const chatDir = path.join(chatsDir, chatId);

  console.log("Loading files for chat:", chatId); // Debug log

  // If the chat directory doesn't exist, return an empty array
  if (!fs.existsSync(chatDir)) {
    return res.json([]);
  }

  // Read all files in the chat's directory (excluding chat.json)
  const files = fs.readdirSync(chatDir)
    .filter((fileName) => fileName !== "chat.json")
    .map((fileName) => {
      const filePath = path.join(chatDir, fileName);
      const content = fs.readFileSync(filePath, "utf-8");
      console.log("Loaded file:", fileName, content); // Debug log
      return { name: fileName, content };
    });

  res.json(files);
});

// Save chat messages
app.post("/save-chat", (req, res) => {
  try {
    console.log("Received save-chat request with body:", req.body);
    const { chatId, name, messages } = req.body;

    if (!chatId || !name || !Array.isArray(messages)) {
      throw new Error("Invalid request body: chatId, name, and messages are required");
    }

    const chatDir = path.join(chatsDir, chatId);
    if (!fs.existsSync(chatDir)) {
      fs.mkdirSync(chatDir, { recursive: true });
      console.log(`Created directory: ${chatDir}`);
    }

    const chatFilePath = path.join(chatDir, "chat.json");
    fs.writeFileSync(chatFilePath, JSON.stringify({ id: chatId, name, messages }));
    console.log(`Chat saved: ${chatFilePath}`);

    res.send("Chat saved successfully");
  } catch (error) {
    console.error("Error saving chat:", error.message);
    res.status(500).send(`Error saving chat: ${error.message}`);
  }
});

app.delete("/delete-file/:chatId/:fileName", (req, res) => {
  const chatId = req.params.chatId;
  const fileName = req.params.fileName;
  const filePath = path.join(chatsDir, chatId, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.send("File deleted successfully");
  } else {
    res.status(404).send("File not found");
  }
});

// Load chat messages
app.get("/load-chat/:chatId", (req, res) => {
  const chatId = req.params.chatId;
  const chatFilePath = path.join(chatsDir, chatId, "chat.json");

  // If the chat file doesn't exist, return an empty array
  if (!fs.existsSync(chatFilePath)) {
    return res.json([]);
  }

  // Read the chat file
  const chatData = JSON.parse(fs.readFileSync(chatFilePath, "utf-8"));
  res.json(chatData.messages || []);
});

// Load all chats
app.get("/load-chats", (req, res) => {
  // Read all chat directories
  const chatFolders = fs.readdirSync(chatsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  // Load chat metadata from each folder
  const chats = chatFolders.map((chatId) => {
    const chatFilePath = path.join(chatsDir, chatId, "chat.json");
    if (fs.existsSync(chatFilePath)) {
      return JSON.parse(fs.readFileSync(chatFilePath, "utf-8"));
    }
    return null;
  }).filter((chat) => chat !== null);

  res.json(chats);
});

// Delete a chat
app.delete("/delete-chat/:chatId", (req, res) => {
  const chatId = req.params.chatId;

  // Delete the chat's directory
  const chatDir = path.join(chatsDir, chatId);
  if (fs.existsSync(chatDir)) {
    fs.rmdirSync(chatDir, { recursive: true });
  }

  res.send("Chat deleted successfully");
});

// Define the path for the system prompt file
const systemPromptFilePath = path.join(__dirname, "system_prompt.txt");

// Ensure the system_prompt.txt file exists
if (!fs.existsSync(systemPromptFilePath)) {
  fs.writeFileSync(systemPromptFilePath, "", "utf-8");
  console.log("Created system_prompt.txt");
}

// Endpoint to read the system prompt
app.get("/load-system-prompt", (req, res) => {
  try {
    const systemPrompt = fs.readFileSync(systemPromptFilePath, "utf-8");
    console.log("Loaded system prompt:", systemPrompt);
    res.json({ systemPrompt });
  } catch (error) {
    console.error("Error loading system prompt:", error.message);
    res.status(500).send("Error loading system prompt");
  }
});

// Endpoint to save the system prompt
app.post("/save-system-prompt", (req, res) => {
  try {
    const { systemPrompt } = req.body;
    console.log("Saving system prompt:", systemPrompt);
    fs.writeFileSync(systemPromptFilePath, systemPrompt, "utf-8");
    res.send("System prompt saved successfully");
  } catch (error) {
    console.error("Error saving system prompt:", error.message);
    res.status(500).send("Error saving system prompt");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});