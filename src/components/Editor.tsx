import React, { useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { BrainCircuit } from 'lucide-react';

interface EditorProps {
    value: string;
    onChange: (value: string | undefined) => void;
    onMount?: (editor: any, monaco: Monaco) => void;
    onInsertDecision?: () => void;
}

const PRDEditor: React.FC<EditorProps> = ({ value, onChange, onMount, onInsertDecision }) => {
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

        if (onMount) onMount(editor, monaco);
    };

    return (
        <div className="h-full w-full border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col bg-white">
            {/* Toolbar */}
            <div className="h-9 border-b border-gray-100 flex items-center px-2 bg-gray-50 gap-2">
                <span className="text-xs text-gray-400 font-medium px-2">编辑器</span>
                <div className="h-4 w-px bg-gray-300 mx-1"></div>
                <button 
                    onClick={onInsertDecision}
                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-orange-100 text-orange-700 rounded text-xs transition-colors border border-transparent hover:border-orange-200"
                    title="插入决策锚点"
                >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span className="font-bold">插入决策</span>
                </button>
            </div>
            
            <div className="flex-1 relative">
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
                        padding: { top: 20, bottom: 20 },
                        scrollBeyondLastLine: false,
                        overviewRulerLanes: 0
                    }}
                />
            </div>
        </div>
    );
};

export default PRDEditor;