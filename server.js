const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

// Ensure the "chats" directory exists
const chatsDir = path.join(__dirname, "chats");
if (!fs.existsSync(chatsDir)) {
  fs.mkdirSync(chatsDir);
}

// Updated /save-chat endpoint
app.post("/save-chat", (req, res) => {
    const { chatId, name, messages } = req.body;
    const filePath = path.join(chatsDir, `${chatId}.json`);
  
    // Merge with existing data if available
    fs.readFile(filePath, 'utf8', (err, data) => {
      const existingData = err ? {} : JSON.parse(data);
      
      const chatData = {
        id: chatId,
        name: name || existingData.name || `Chat - ${new Date().toLocaleString()}`,
        messages: messages || existingData.messages || []
      };
  
      fs.writeFile(filePath, JSON.stringify(chatData), (err) => {
        if (err) return res.status(500).json({ error: "Save failed" });
        res.json({ message: "Chat saved" });
      });
    });
  });
  
  // Updated /load-chats endpoint
  app.get("/load-chats", (req, res) => {
    fs.readdir(chatsDir, (err, files) => {
      const chats = files
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const data = fs.readFileSync(path.join(chatsDir, file), 'utf8');
          return JSON.parse(data);
        });
      res.json(chats);
    });
  });
  
  // Updated /load-chat endpoint
  app.get("/load-chat/:id", (req, res) => {
    const filePath = path.join(chatsDir, `${req.params.id}.json`);
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) return res.status(404).json({ error: "Chat not found" });
      res.json(JSON.parse(data).messages);
    });
  });

app.delete("/delete-chat/:id", (req, res) => {
    const filePath = path.join(chatsDir, `${req.params.id}.json`);
    fs.unlink(filePath, (err) => {
      if (err) return res.status(500).json({ error: "Delete failed" });
      res.json({ message: "Chat deleted" });
    });
  }); 

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});