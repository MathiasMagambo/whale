# whale

A Matrix terminal-inspired chat application that interfaces with the DeepSeek AI API. Features include a retro CRT aesthetic, file uploads for context, chat history management, and a customizable system prompt. Built with React (frontend) and Express (backend). 

### Screenshots
![Screenshot 2025-03-19 152628](https://github.com/user-attachments/assets/951882d0-e7db-4fb3-9169-322eaec9539c) 

![Screenshot 2025-03-19 152652](https://github.com/user-attachments/assets/0ec1e053-876d-412c-be8f-8660a41f5866) 

![Screenshot 2025-03-19 152812](https://github.com/user-attachments/assets/143a51de-0478-4ab3-b936-ecc85c06a277)

## Features
- **Retro UI**: CRT screen effects and scanlines with a green-on-black terminal style.
- **Chat Management**: Create, switch, and delete chat sessions with persistent history.
- **File Uploads**: Upload text files (e.g., `.txt`, `.js`, `.py`) to provide context to the AI.
- **Streaming Responses**: Real-time AI responses with a typing animation.
- **Model Switching**: Toggle between `deepseek-chat` (standard) and `deepseek-reasoner` (thinking) models. (`deepseek-reasoner` rarely works with the API idk why)
- **Custom System Prompt**: Configure how the AI responds globally.

## Prerequisites
- **Node.js**: Version 14.x or higher (includes npm).
- **DeepSeek API Key**: Sign up at [DeepSeek](https://platform.deepseek.com/) to get an API key.

## Setup Instructions
### Step 1: Download and Extract
1. Download the ZIP file from the GitHub repository (click "Code" > "Download ZIP").
2. Extract the ZIP to a folder (e.g., `whale`).

There are two methods of doing the next steps. I prefer the first (and fastest) one.

### Fastest Method
1. Navigate to the Project Folder  
   Open a terminal and change to the project directory:
   ```bash
   cd whale

2. Run the following command to install all required dependencies listed in package.json:
   ```bash
   npm install
  This installs both backend dependencies (e.g., express, cors) and frontend dependencies (e.g., react, react-dom, axios, openai) in one go. The package-lock.json ensures the exact versions I tested are used.
  
3. Create a .env file in the root directory and add your DeepSeek API key:
    ```plaintext
    REACT_APP_DEEPSEEK_API_KEY=your-api-key-here
    Replace your-api-key-here with your actual DeepSeek API key.

4. Launch both the backend server and frontend app with a single command:
    ```bash
   npm run dev

If you prefer to run them separately, refer to the steps in the step by step.

### Step-by-step

### Step 2: Set Up the Backend
1. Open a terminal and navigate to the project folder:
   ```bash
   cd whale
   
2. Install backend dependencies:
    ```bash
    npm install express cors

3. Create a .env file in the root directory and add your DeepSeek API key:
    ```plaintext
    REACT_APP_DEEPSEEK_API_KEY=your-api-key-here
    Replace your-api-key-here with your actual DeepSeek API key.

4. Start the backend server:
    ```bash
     cd whale
The server will run on http://localhost:5000.

### Step 3: Set Up the Frontend
1. Open a new terminal window (keep the backend running).
2. Navigate to the project folder again:
    ```bash
     cd whale
    
3. Install frontend dependencies:
     ```bash
     npm install react react-dom axios openai

4. Start the React app:
     ```bash
     npm start
     
The app will open in your browser at http://localhost:3000.

### Step 4: Using the App
1. The app starts with a boot sequence ("INITIALIZING DEEPSEEK CORE...").
2. Click "INITIALIZE NEW SESSION" to start a chat or type in the prompt box and hit send.
3. Upload files via "UPLOAD FILES" to add context (supports .txt, .js, .py, .java).
4. Type a prompt in the textarea and click "EXECUTE" to get a response. Pressing enter doesn't send the prompt. I found that annoying using other chat interfaces. Enter starts a new line.
5. Switch models with "SWITCH TO THINKING/STANDARD MODEL".
6. Set a system prompt via "SET SYSTEM PROMPT" (e.g., "Be concise").
7. Copy responses with the "COPY" button.
8. Code is highlighted in a black box with white text like this.![Screenshot 2025-03-19 105430](https://github.com/user-attachments/assets/38a5d963-5b56-4145-b295-4ab09b50408b)

### How It Works
- **Frontend (React)**: Handles the UI, sends requests to the backend, and streams AI responses using the OpenAI SDK configured for DeepSeek's API.

- **Backend (Express)**: Manages chat history and file storage in the /chats directory, serving as a local persistence layer.

- **API Integration**: Uses the DeepSeek API (https://api.deepseek.com) for AI responses, with streaming enabled for real-time output.

- **File Context**: Uploaded files are appended to the chat context sent to the AI.

### Project Structure
- App.js: Main React component with UI and logic.
- App.css: Styles for the terminal aesthetic and animations.
- server.js: Express backend for chat and file management.
- /chats/: Directory where chat data and files are stored (created on first run).



**Contributing**

Feel free to fork this repository, submit issues, or send pull requests to improve the project!

