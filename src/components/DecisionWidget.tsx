import React, { useState } from 'react';
import { VoteData } from '../types';
import { BrainCircuit, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';

interface Props {
    anchorText: string;
    onVote: (choice: 'PRO' | 'CON') => Promise<VoteData>;
}

const DecisionWidget: React.FC<Props> = ({ anchorText, onVote }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<VoteData | null>(null);

    const handleVote = async (choice: 'PRO' | 'CON') => {
        setLoading(true);
        try {
            const result = await onVote(choice);
            setData(result);
        } finally {
            setLoading(false);
        }
    };

    // Clean anchor text
    const question = anchorText.replace('{{DECISION:', '').replace('}}', '').trim();

    return (
        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm mb-4">
            <div className="flex items-center gap-2 mb-3">
                <BrainCircuit className="w-5 h-5 text-aliyun" />
                <h4 className="font-bold text-gray-800 text-sm">决策锚点</h4>
            </div>
            
            <p className="text-gray-700 font-medium mb-4 text-sm">{question}</p>

            {!data ? (
                <div className="flex gap-3">
                    <button 
                        onClick={() => handleVote('PRO')}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-50 text-green-700 border border-green-200 py-2 rounded-lg hover:bg-green-100 transition-colors text-sm"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <ThumbsUp className="w-4 h-4" />}
                        方案 A (端侧)
                    </button>
                    <button 
                        onClick={() => handleVote('CON')}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 py-2 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <ThumbsDown className="w-4 h-4" />}
                        方案 B (云端)
                    </button>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 mb-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>共识热度</span>
                            <span>{(data.heatmap * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                                className="bg-gradient-to-r from-orange-400 to-red-500 h-2 rounded-full transition-all duration-1000" 
                                style={{ width: `${data.heatmap * 100}%` }}
                            ></div>
                        </div>
                    </div>
                    <div className="flex gap-2 items-start">
                         <div className="mt-1 min-w-[20px]">🤖</div>
                         <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-2 rounded">
                            {data.aiSummary}
                         </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DecisionWidget;