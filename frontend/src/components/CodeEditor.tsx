import Editor from '@monaco-editor/react';
import { useState, useEffect } from 'react';
import { FileItem } from '../types';

interface CodeEditorProps {
  file: FileItem | null;
  onFileChange: (filePath: string, newContent: string) => void;
}

export function CodeEditor({ file, onFileChange }: CodeEditorProps) {
  const [editorValue, setEditorValue] = useState<string>(file?.content || '');

  useEffect(() => {
    if (file) {
      setEditorValue(file.content || '');
    }
  }, [file]);

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Select a file to view its contents
      </div>
    );
  }

  const handleEditorChange = (value: string | undefined) => {
    if (file && value !== undefined) {
      setEditorValue(value);
      onFileChange(file.path, value);
    }
  };

  return (
    <div className="h-full">
      <Editor
        height="100%"
        defaultLanguage="typescript"
        theme="vs-dark"
        value={editorValue}
        onChange={handleEditorChange}
        options={{
          readOnly: false,
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true
        }}
      />
    </div>
  );
}