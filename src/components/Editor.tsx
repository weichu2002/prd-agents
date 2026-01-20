import React, { useRef, useEffect } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';

interface EditorProps {
    value: string;
    onChange: (value: string | undefined) => void;
}

const PRDEditor: React.FC<EditorProps> = ({ value, onChange }) => {
    const editorRef = useRef<any>(null);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;

        // Register custom language for PRD
        monaco.languages.register({ id: 'prd-markdown' });

        // Define token rules for decision anchors
        monaco.languages.setMonarchTokensProvider('prd-markdown', {
            tokenizer: {
                root: [
                    [/\{\{DECISION:[^}]+\}\}/, 'custom-decision-anchor'],
                    [/#+ .*/, 'markdown-header'],
                    [/\*\*.+\*\*/, 'markdown-bold'],
                    [/.*$/, 'markdown-text']
                ]
            }
        });

        // Define theme colors
        monaco.editor.defineTheme('prd-theme', {
            base: 'vs',
            inherit: false,
            rules: [
                { token: 'custom-decision-anchor', foreground: 'FF6A00', fontStyle: 'bold' },
                { token: 'markdown-header', foreground: '0066CC', fontStyle: 'bold' },
                { token: 'markdown-bold', fontStyle: 'bold' },
                { token: 'markdown-text', foreground: '333333' }
            ],
            colors: {
                'editor.background': '#F9FAFB'
            }
        });

        monaco.editor.setTheme('prd-theme');
    };

    return (
        <div className="h-full w-full border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <Editor
                height="100%"
                defaultLanguage="prd-markdown"
                value={value}
                onChange={onChange}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    padding: { top: 20, bottom: 20 }
                }}
            />
        </div>
    );
};

export default PRDEditor;