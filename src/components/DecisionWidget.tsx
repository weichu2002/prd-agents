
import React, { useState, useEffect } from 'react';
import { DecisionData } from '../types';
import { BrainCircuit, Loader2, Check } from 'lucide-react';

interface Props {
    rawAnchor: string;
    serverData?: DecisionData;
    onVote: (optionIndex: number, question: string, options: string[]) => Promise<void>;
}

const DecisionWidget: React.FC<Props> = ({ rawAnchor, serverData, onVote }) => {
    const [loading, setLoading] = useState(false);
    
    // Parse anchor syntax: {{DECISION: Question | Option1 | Option2}}
    // Default options if none provided: Agree, Disagree
    const content = rawAnchor.replace('{{DECISION:', '').replace('}}', '').trim();
    const parts = content.split('|').map(s => s.trim());
    const question = parts[0];
    const options = parts.length > 1 ? parts.slice(1) : ['同意 (Agree)', '反对 (Disagree)'];

    const handleVoteClick = async (index: number) => {
        setLoading(true);
        try {
            await onVote(index, question, options);
        } finally {
            setLoading(false);
        }
    };

    const totalVotes = serverData?.totalVotes || 0;

    return (
        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm mb-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 mb-3">
                <BrainCircuit className="w-5 h-5 text-aliyun" />
                <h4 className="font-bold text-gray-800 text-sm">决策锚点</h4>
            </div>
            
            <p className="text-gray-800 font-bold mb-4 text-sm">{question}</p>

            <div className="space-y-2">
                {options.map((opt, idx) => {
                    const votes = serverData?.votes?.[idx] || 0;
                    const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                    
                    return (
                        <button 
                            key={idx}
                            onClick={() => handleVoteClick(idx)}
                            disabled={loading}
                            className="w-full relative overflow-hidden bg-gray-50 border border-gray-200 rounded-lg p-2 text-left hover:border-aliyun/50 transition-all group"
                        >
                            {/* Progress Bar Background */}
                            <div 
                                className="absolute left-0 top-0 bottom-0 bg-orange-100 transition-all duration-500 opacity-50"
                                style={{ width: `${percentage}%` }}
                            />
                            
                            <div className="relative flex justify-between items-center z-10">
                                <span className="text-sm font-medium text-gray-700 group-hover:text-aliyun-dark">
                                    {opt}
                                </span>
                                <div className="flex items-center gap-2 text-xs">
                                    {loading ? <Loader2 className="w-3 h-3 animate-spin"/> : null}
                                    <span className="font-bold text-gray-600">{votes} 票</span>
                                    <span className="text-gray-400">({percentage.toFixed(0)}%)</span>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {totalVotes > 0 && (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                    <div className="flex gap-2 items-start">
                         <div className="mt-0.5 text-xs">🤖</div>
                         <p className="text-xs text-gray-500 leading-relaxed">
                            {serverData?.aiSummary || "正在根据团队投票生成智能共识..."}
                         </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DecisionWidget;
