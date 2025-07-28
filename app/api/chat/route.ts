import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs/promises";
import path from "path";

// Initialize Google AI with API key
const API_KEY = "AIzaSyAx34o31vs5bNBpR8BbftYHU-hC4jqOOJQ";
const MODEL_NAME = "gemini-1.5-pro";
const historyFile = path.join(process.cwd(), "chat_history.json");

// Helper function to read file as base64
const readFileAsBase64 = async (buffer: ArrayBuffer): Promise<string> => {
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  uint8Array.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

// Save chat history
async function saveChatHistory(prompt: string, response: string, age?: string) {
  try {
    let history = [];
    try {
      const data = await fs.readFile(historyFile, "utf-8");
      history = JSON.parse(data);
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        console.error("Error reading chat history file:", e);
      }
      history = [];
    }
    history.push({ prompt, response, age, timestamp: new Date().toISOString() });
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error("Error saving chat history:", error);
    // Continue execution even if saving history fails
  }
}

export async function POST(req: NextRequest) {
  try {
    // Handle FormData instead of JSON
    const formData = await req.formData();
    const userPrompt = formData.get("userPrompt") as string;
    const age = formData.get("age") as string;
    const file = formData.get("file") as File | null;

    if (!userPrompt?.trim()) {
      return NextResponse.json({ error: "**Input Required for Consultation**" }, { status: 400 });
    }

    // Initialize Google AI
    let genAI;
    try {
      genAI = new GoogleGenerativeAI(API_KEY);
    } catch (error) {
      console.error("Error initializing Google AI:", error);
      return NextResponse.json({ error: "Failed to initialize AI service" }, { status: 500 });
    }

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.9,
        topP: 0.9,
        topK: 40,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ],
    });

    // Prepare content parts (text and file if present)
    const contentParts = [];
    
    // Add file content if provided
    if (file) {
      try {
        const fileBuffer = await file.arrayBuffer();
        const fileType = file.type;
        const fileName = file.name;
        
        // Process file based on MIME type
        if (fileType.startsWith("text/")) {
          // For text files
          const decoder = new TextDecoder();
          const text = decoder.decode(fileBuffer);
          contentParts.push({
            text: `User uploaded file: ${fileName}\n\nFile content:\n${text}`
          });
        } else {
          // For binary files (images, PDFs, etc)
          const base64Data = await readFileAsBase64(fileBuffer);
          contentParts.push({
            inlineData: {
              data: base64Data,
              mimeType: fileType
            }
          });
        }
      } catch (error) {
        console.error("Error processing file:", error);
        // Continue without the file if processing fails
      }
    }

    // Create prompt and add to content parts
    const fullPrompt = `
**Professional Consultation Protocol:**
• Provide concise, actionable insights in clear, bulleted format
• For mental health: Include symptoms, causes, coping strategies, and specific medication names (e.g., Sertraline for depression)
• For physical health: Suggest specific, widely available medication names (e.g., Ibuprofen for pain) tailored to the condition and age (if provided: ${age || "not specified"})
• Use bold text for critical information (e.g., **DO THIS NOW**)

**Response Format Requirements:**
1. **Key Symptoms**: List observable signs
2. **Potential Causes**: Identify likely triggers or conditions
3. **Immediate Coping Strategies**: Practical steps to manage the issue now
4. **Recommended Interventions**: Specific medication names and product names (e.g., Acetaminophen, Fluoxetine) with age-adjusted notes if applicable, plus therapies
5. **Suggested Consultation/Referral**: Next steps with professionals

**Detailed Analysis Prompt:**
Analyze the following health/mental health concern with maximum precision:
"${userPrompt}"
${age && age !== "not specified" ? `User age: ${age}. Tailor medication suggestions accordingly (e.g., pediatric doses or adult formulations).` : "Age not provided; use general adult recommendations."}

**Additional Guidelines:**
- Be direct, evidence-based, and solution-focused
- Provide specific product/medicine names relevant to the condition (e.g., "Paracetamol" for fever, "Lorazepam" for anxiety)
- Emphasize that medications require a doctor's prescription and approval
- Prioritize user's immediate well-being

If the user's question is not health-related, still provide a helpful and informative response but without the medical format.
`.trim();

    // Add prompt text to content parts
    contentParts.unshift({
      text: fullPrompt
    });

    // Make request with timeout handling
    const timeout = 25000; // 25 seconds
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: contentParts }],
      }, { abortSignal: abortController.signal });
      
      clearTimeout(timeoutId);
      
      const response = result.response;
      const text = response.text();

      if (!text || text.trim() === '') {
        return NextResponse.json({ error: "Empty response received" }, { status: 500 });
      }

      // Save chat history
      await saveChatHistory(userPrompt, text, age);

      // Return formatted response
      const isHealthRelated = /symptoms|illness|disease|pain|anxiety|depression|medical|health|medication|treatment|diagnosis|doctor|physician|hospital|clinic|therapy/i.test(userPrompt);
      
      const formattedResponse = isHealthRelated 
        ? `**Consultation Insights:**\n\n${text}\n\n**DISCLAIMER: This is AI-generated advice. Medications listed (e.g., Ibuprofen, Sertraline) are examples only and MUST be prescribed and approved by a healthcare professional. Consult your doctor before use.**`
        : text;

      return NextResponse.json({
        text: formattedResponse,
        status: "success",
      }, { status: 200 });
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return NextResponse.json({ error: "Request timed out. Please try again." }, { status: 408 });
      }
      throw error; // Re-throw for the outer catch block
    }
  } catch (error: any) {
    console.error("Health Consultation Error:", error);
    
    // Error handling with appropriate status codes
    const statusCode = error.status || 500;
    let errorMessage = "**Consultation Processing Error**";
    let errorDetails = "Unable to generate insights. Please try again.";
    
    if (statusCode === 404) {
      errorMessage = "**Service Temporarily Unavailable**";
      errorDetails = "Unable to process consultation request";
    } else if (statusCode === 429) {
      errorMessage = "**Consultation Overload**";
      errorDetails = "Too many requests. Please try again later.";
    } else if (error.message?.includes("quota")) {
      errorMessage = "**Service Quota Exceeded**";
      errorDetails = "The service is temporarily unavailable due to high demand.";
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails 
    }, { status: statusCode });
  }
}

export async function GET() {
  try {
    const data = await fs.readFile(historyFile, "utf-8");
    const history = JSON.parse(data);
    return NextResponse.json({ history }, { status: 200 });
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      // If file doesn't exist, return empty history
      return NextResponse.json({ history: [] }, { status: 200 });
    }
    // For other errors
    return NextResponse.json({ 
      error: "Failed to retrieve chat history", 
      details: e.message 
    }, { status: 500 });
  }
}
