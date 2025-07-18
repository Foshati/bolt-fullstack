import "dotenv/config";
import { BASE_PROMPT, getSystemPrompt } from "./prompts";
import express from "express";
import cors from "cors";
import { basePrompt as nodeBasePrompt } from "./defaults/node";
import { basePrompt as reactBasePrompt } from "./defaults/react";
import OpenAI from "openai";

const LIARA_API_KEY = process.env.LIARA_API_KEY;
const PORT = process.env.PORT;

const openai = new OpenAI({
  baseURL: "https://ai.liara.ir/api/v1/686292f29c24698eb55e58c6",
  apiKey: LIARA_API_KEY,
  timeout: 30000, // Increase timeout to 30 seconds
  maxRetries: 3, // Add retry mechanism
});

const app = express();
app.use(cors());
app.use(express.json());

// Helper function to get error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

app.post("/template", async (req, res) => {
  try {
    const prompt = req.body.prompt;

    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        max_tokens: 2000,
        temperature: 1,
        messages: [
          {
            role: "system",
            content:
              "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ 
          message: "No response content received",
          error: "No content in response"
        });
      }

      const answer = content.trim().toLowerCase();

      if (answer === "react") {
        res.json({
          prompts: [
            BASE_PROMPT,
            `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
          ],
          uiPrompts: [reactBasePrompt],
        });
        return;
      }

      if (answer === "node") {
        res.json({
          prompts: [
            BASE_PROMPT,
            `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodeBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
          ],
          uiPrompts: [nodeBasePrompt],
        });
        return;
      }

      res.status(400).json({ message: "Invalid response from AI" });
    } catch (error: unknown) {
      console.error('OpenAI API Error:', error);
      return res.status(500).json({ 
        message: "Failed to connect to AI service",
        error: getErrorMessage(error)
      });
    }
  } catch (error: unknown) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      message: "Internal server error",
      error: getErrorMessage(error)
    });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const messages = req.body.messages;

    // اضافه کردن system message به ابتدای آرایه messages
    const messagesWithSystem = [
      {
        role: "system",
        content: getSystemPrompt(),
      },
      ...messages,
    ];

    try {
      const response = await openai.chat.completions.create({
        model: "openai/gpt-4o-mini",
        max_tokens: 8000,
        messages: messagesWithSystem,
        temperature: 1,
      });

      console.log(response);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ 
          message: "No response content received",
          error: "No content in response"
        });
      }

      res.json({
        response: content,
      });
    } catch (error: unknown) {
      console.error('OpenAI API Error:', error);
      return res.status(500).json({ 
        message: "Failed to connect to AI service",
        error: getErrorMessage(error)
      });
    }
  } catch (error: unknown) {
    console.error('Server Error:', error);
    return res.status(500).json({ 
      message: "Internal server error",
      error: getErrorMessage(error)
    });
  }
});

app.listen(PORT, () => {
  console.info(`Server running on port ${PORT}`);
});