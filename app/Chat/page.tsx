"use client";

import { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { Input } from "@/components/ui/input";
import { MessageCircleCode, Upload, Copy, Download, History } from "lucide-react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";
import styles from "@/styles/styles.module.css";
import { BeatLoader } from "react-spinners";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [output, setOutput] = useState("The response will appear here...");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const submissionTimeout = useRef<NodeJS.Timeout | null>(null);

  // Fetch chat history on mount
  useEffect(() => {
    fetchChatHistory();
  }, []);

  // Function to fetch chat history
  const fetchChatHistory = async () => {
    try {
      const res = await fetch("/api/chat", { method: "GET" });
      if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
      const data = await res.json();
      setChatHistory(data.history || []);
    } catch (err) {
      console.error("Failed to fetch chat history:", err);
      toast.error("Could not load chat history");
    }
  };

  const onKeyDown = (e: any) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  const onFileChange = (e: any) => {
    const file = e.target.files[0];
    if (!file) return toast.error("No file selected!");

    const supportedExtensions = /\.(txt|pdf|docx|xlsx|pptx|html|epub|mobi|azw|azw3|odt|ods|odp)$/i;
    if (!file.name.match(supportedExtensions)) {
      return toast.error("File type not supported!");
    }

    setFile(file);
    toast.success(`File selected: ${file.name}`);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output)
      .then(() => toast.success("Copied to clipboard!"))
      .catch(() => toast.error("Failed to copy text."));
  };

  const downloadFile = () => {
    const blob = new Blob([output], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `council-chat-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
    toast.success("Downloaded successfully!");
  };

  const onSubmit = async () => {
    if (submissionTimeout.current) clearTimeout(submissionTimeout.current);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return toast.error("Please enter a prompt!");

    setOutput("The response will appear here...");
    setLoading(true);

    const formData = new FormData();
    formData.append("userPrompt", trimmedPrompt);
    formData.append("age", "not specified");
    if (file) {
      formData.append("file", file);
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();
      setLoading(false);

      if (data.error) return toast.error(data.error);
      if (!data.text) return toast.error("No response from server!");

      const fullResponse = data.text;
      setResponse(fullResponse);
      setPrompt("");
      
      // Update local state with new chat entry
      const newChatEntry = { 
        prompt: trimmedPrompt, 
        response: fullResponse, 
        timestamp: new Date().toISOString() 
      };
      
      setChatHistory(prev => [newChatEntry, ...prev]);
      setFile(null);
      
      // Refetch history to ensure it's synchronized with the server
      setTimeout(fetchChatHistory, 1000);
      
    } catch (error) {
      toast.error(`Failed to get response: ${error instanceof Error ? error.message : "Unknown error"}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!response) return;

    setOutput("");
    const charsPerBatch = 5;
    const batchDelay = 12;
    const timeoutIds: NodeJS.Timeout[] = [];

    for (let i = 0; i < response.length; i += charsPerBatch) {
      const timeoutId = setTimeout(() => {
        setOutput(prev => prev + response.slice(i, Math.min(i + charsPerBatch, response.length)));
      }, Math.floor(i / charsPerBatch) * batchDelay);
      timeoutIds.push(timeoutId);
    }

    return () => timeoutIds.forEach(id => clearTimeout(id));
  }, [response]);

  return (
    <main className="flex flex-col items-center h-screen gap-4 mt-10 relative">
      <Toaster position="top-center" />
      <div className="absolute top-4 left-4">
        <Button variant="outline" onClick={() => setShowHistory(!showHistory)} aria-label="Toggle chat history">
          <History size={24} />
        </Button>
      </div>

      {showHistory && (
        <div className="absolute top-16 left-4 w-1/3 h-[80vh] bg-white dark:bg-gray-800 p-4 overflow-y-auto shadow-lg z-10 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Chat History</h2>
            <Button variant="ghost" onClick={() => setShowHistory(false)} size="sm">✕</Button>
          </div>
          {chatHistory.length === 0 ? (
            <p className="text-gray-500 italic">No previous chats found.</p>
          ) : (
            <div className="space-y-4">
              {chatHistory.map((chat, index) => (
                <div key={index} className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg shadow">
                  <p className="font-medium text-sm text-gray-700 dark:text-gray-300">{new Date(chat.timestamp).toLocaleString()}</p>
                  <p className="font-semibold mt-1 mb-1">Q: {chat.prompt}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{chat.response.slice(0, 100)}...</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPrompt(chat.prompt);
                      setOutput(chat.response);
                      setShowHistory(false);
                    }}
                  >
                    Load
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center mb-5">
        <MessageCircleCode size="64" />
        <span className="text-3xl font-bold">Council</span>
      </div>

      <div className="flex gap-2 items-center w-full max-w-[700px]">
        <div className="relative flex-grow">
          <Input
            type="text"
            placeholder="Type your prompt"
            value={prompt}
            className={cn("w-full h-[50px] pr-24")}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="absolute top-1/2 right-2 transform -translate-y-1/2 flex gap-2">
            {loading ? (
              <BeatLoader color="#000" size={8} />
            ) : (
              <Button variant="ghost" onClick={onSubmit} className="p-1">
                <Send size={20} />
              </Button>
            )}
          </div>
        </div>
        <Input
          type="file"
          onChange={onFileChange}
          className="hidden"
          id="file-upload"
          accept=".txt,.pdf,.docx,.xlsx,.pptx,.html,.epub,.mobi,.azw,.azw3,.odt,.ods,.odp"
        />
        <Button
          variant="outline"
          className={cn("w-[40px] p-1")}
          onClick={() => document.getElementById("file-upload")?.click()}
          title="Upload a file"
        >
          <Upload className={cn("w-[20px]")} />
        </Button>
      </div>

      <div className="flex gap-3 items-center w-full max-w-[700px]">
        <Card className={cn("p-5 whitespace-normal w-full min-h-[150px] max-h-[400px] overflow-y-scroll bg-white dark:bg-gray-800")}>
          <div className={`${styles.textwrapper}`}>
            <Markdown className={cn("w-full h-full")}>{output}</Markdown>
          </div>
        </Card>
        <div className="flex flex-col gap-5">
          <Button variant="outline" className={cn("w-[40px] p-1")} onClick={copyToClipboard} title="Copy to clipboard">
            <Copy className={cn("w-[20px]")} />
          </Button>
          <Button variant="outline" className={cn("w-[40px] p-1")} onClick={downloadFile} title="Download as text file">
            <Download className={cn("w-[20px]")} />
          </Button>
        </div>
      </div>
    </main>
  );
}
