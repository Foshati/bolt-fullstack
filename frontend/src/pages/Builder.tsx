/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { StepsList } from '../components/StepsList';
import { FileExplorer } from '../components/FileExplorer';
import { TabView } from '../components/TabView';
import { CodeEditor } from '../components/CodeEditor';
import { PreviewFrame } from '../components/PreviewFrame';
import { Step, FileItem, StepType } from '../types';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { parseXml } from '../steps';
import { useWebContainer } from '../hooks/useWebContainer';
import { Loader } from '../components/Loader';

export function Builder() {
  const location = useLocation();
  const { prompt } = location.state as { prompt: string };
  const [userPrompt, setUserPrompt] = useState("");
  const [llmMessages, setLlmMessages] = useState<{role: "user" | "assistant", content: string;}[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateSet, setTemplateSet] = useState(false);
  const webcontainer = useWebContainer();

  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  
  const [steps, setSteps] = useState<Step[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);

  // Function to update file content
  const updateFileContent = (filePath: string, newContent: string) => {
    setFiles(prevFiles => {
      const updateFile = (items: FileItem[]): FileItem[] => {
        return items.map(item => {
          if (item.path === filePath && item.type === 'file') {
            return { ...item, content: newContent };
          }
          if (item.type === 'folder' && item.children) {
            return { ...item, children: updateFile(item.children) };
          }
          return item;
        });
      };
      return updateFile(prevFiles);
    });

    // Update selected file if it's the one being edited
    if (selectedFile && selectedFile.path === filePath) {
      setSelectedFile(prev => prev ? { ...prev, content: newContent } : null);
    }
  };

  // Process steps to create/update files
  useEffect(() => {
    const pendingSteps = steps.filter(step => step.status === "pending");
    if (pendingSteps.length === 0) return;

    setFiles(prevFiles => {
      let updatedFiles = [...prevFiles];
      
      pendingSteps.forEach(step => {
        if (step.type === StepType.CreateFile && step.path && step.code) {
          const pathParts = step.path.split("/").filter(part => part.length > 0);
          
          const createOrUpdateFile = (currentFiles: FileItem[], parts: string[], fullPath: string = ""): FileItem[] => {
            if (parts.length === 0) return currentFiles;
            
            const [currentPart, ...remainingParts] = parts;
            const currentPath = fullPath ? `${fullPath}/${currentPart}` : `/${currentPart}`;
            
            if (remainingParts.length === 0) {
              // This is a file
              const existingFileIndex = currentFiles.findIndex(item => item.path === currentPath);
              const fileItem: FileItem = {
                name: currentPart,
                type: 'file',
                path: currentPath,
                content: step.code
              };
              
              if (existingFileIndex >= 0) {
                currentFiles[existingFileIndex] = fileItem;
              } else {
                currentFiles.push(fileItem);
              }
            } else {
              // This is a folder
              const existingFolderIndex = currentFiles.findIndex(item => item.path === currentPath);
              
              if (existingFolderIndex >= 0) {
                // Folder exists, update its children
                const folder = currentFiles[existingFolderIndex];
                if (folder.type === 'folder') {
                  folder.children = createOrUpdateFile(folder.children || [], remainingParts, currentPath);
                }
              } else {
                // Create new folder
                const newFolder: FileItem = {
                  name: currentPart,
                  type: 'folder',
                  path: currentPath,
                  children: createOrUpdateFile([], remainingParts, currentPath)
                };
                currentFiles.push(newFolder);
              }
            }
            
            return currentFiles;
          };
          
          updatedFiles = createOrUpdateFile(updatedFiles, pathParts);
        }
      });
      
      return updatedFiles;
    });

    // Mark steps as completed
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.status === "pending" ? { ...step, status: "completed" as const } : step
      )
    );
  }, [steps]);

  // Create WebContainer mount structure and mount files
  useEffect(() => {
    if (!webcontainer || files.length === 0) return;

    const createMountStructure = (fileItems: FileItem[]): Record<string, any> => {
      const structure: Record<string, any> = {};
      
      fileItems.forEach(item => {
        if (item.type === 'file') {
          structure[item.name] = {
            file: {
              contents: item.content || ''
            }
          };
        } else if (item.type === 'folder' && item.children) {
          structure[item.name] = {
            directory: createMountStructure(item.children)
          };
        }
      });
      
      return structure;
    };

    const mountStructure = createMountStructure(files);
    console.log('Mounting structure:', mountStructure);
    
    webcontainer.mount(mountStructure).catch(error => {
      console.error('Failed to mount files:', error);
    });
  }, [files, webcontainer]);

  // Initialize the builder
  async function init() {
    try {
      setLoading(true);
      
      // Get template type (react or node)
      const templateResponse = await axios.post(`${BACKEND_URL}/template`, {
        prompt: prompt.trim()
      });
      
      setTemplateSet(true);
      const { prompts, uiPrompts } = templateResponse.data;

      // Parse initial steps from UI prompts
      const initialSteps: Step[] = parseXml(uiPrompts[0]).map((step: any) => ({
        ...step,
        status: "pending" as const
      }));
      
      setSteps(initialSteps);

      // Get additional steps from chat
      const chatMessages = [...prompts, prompt].map(content => ({
        role: "user" as const,
        content
      }));

      const stepsResponse = await axios.post(`${BACKEND_URL}/chat`, {
        messages: chatMessages
      });

      const additionalSteps: Step[] = parseXml(stepsResponse.data.response).map((step: any) => ({
        ...step,
        status: "pending" as const
      }));

      setSteps(prev => [...prev, ...additionalSteps]);
      setLlmMessages([...chatMessages, {
        role: "assistant",
        content: stepsResponse.data.response
      }]);

    } catch (error) {
      console.error('Initialization error:', error);
    } finally {
      setLoading(false);
    }
  }

  // Handle sending new messages
  const handleSendMessage = async () => {
    if (!userPrompt.trim() || loading) return;

    const newMessage = {
      role: "user" as const,
      content: userPrompt
    };

    setLoading(true);
    setUserPrompt("");

    try {
      const response = await axios.post(`${BACKEND_URL}/chat`, {
        messages: [...llmMessages, newMessage]
      });

      const newSteps: Step[] = parseXml(response.data.response).map((step: any) => ({
        ...step,
        status: "pending" as const
      }));

      setLlmMessages(prev => [...prev, newMessage, {
        role: "assistant",
        content: response.data.response
      }]);

      setSteps(prev => [...prev, ...newSteps]);

    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-100">Website Builder</h1>
        <p className="text-sm text-gray-400 mt-1">Prompt: {prompt}</p>
      </header>
      
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-4 gap-6 p-6">
          {/* Steps and Chat Panel */}
          <div className="col-span-1 space-y-6 overflow-auto">
            <div className="max-h-[60vh] overflow-y-auto">
              <StepsList
                steps={steps}
                currentStep={currentStep}
                onStepClick={setCurrentStep}
              />
            </div>
            
            {/* Chat Input */}
            <div className="flex flex-col space-y-2">
              {(loading || !templateSet) ? (
                <div className="flex justify-center py-4">
                  <Loader />
                </div>
              ) : (
                <div className="flex space-x-2">
                  <textarea
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="Ask for changes..."
                    className="flex-1 p-2 bg-gray-800 text-gray-100 border border-gray-600 rounded resize-none"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!userPrompt.trim() || loading}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* File Explorer */}
          <div className="col-span-1">
            <FileExplorer 
              files={files} 
              onFileSelect={setSelectedFile}
            />
          </div>

          {/* Code Editor and Preview */}
          <div className="col-span-2 bg-gray-800 rounded-lg shadow-lg p-4 h-[calc(100vh-8rem)]">
            <TabView activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="h-[calc(100%-4rem)]">
              {activeTab === 'code' ? (
                <CodeEditor 
                  file={selectedFile}
                  onFileChange={updateFileContent}
                />
              ) : (
                webcontainer && (
                  <PreviewFrame 
                    webContainer={webcontainer} 
                    files={files}
                  />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}