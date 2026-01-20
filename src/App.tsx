import React, { useState, useEffect } from 'react';
import { Bot, FileText, Database, Share2, Zap, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import PRDEditor from './components/Editor';
import DecisionWidget from './components/DecisionWidget';
import ImpactGraph from './components/ImpactGraph';
import { LINGJING_PRD_CONTENT, DEMO_PROJECT_NAME, KNOWLEDGE_BASE_FILES } from './constants';
import { AIReviewComment, VoteData } from './types';

function App() {
  const [content, setContent] = useState(LINGJING_PRD_CONTENT);
  const [activeTab, setActiveTab] = useState<'EDITOR' | 'KNOWLEDGE' | 'IMPACT'>('EDITOR');
  const [isReviewing, setIsReviewing] = useState(false);
  const [comments, setComments] = useState<AIReviewComment[]>([]);
  const [demoLoaded, setDemoLoaded] = useState(false);

  // Initialize Demo Data (simulating Edge Function call)
  useEffect(() => {
    fetch('/api/init').catch(err => console.log('Running in pure client mode or Init failed', err));
    setDemoLoaded(true);
  }, []);

  const handleAIReview = async () => {
    setIsReviewing(true);
    setComments([]);

    try {
      // Call Edge Function
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prdContent: content })
      });

      let data;
      if (res.ok) {
        data = await res.json();
      } else {
        // Fallback mock if Edge Function isn't reachable (e.g. local dev without esa emulator)
        console.warn("Edge API failed, using fallback mock data.");
        await new Promise(resolve => setTimeout(resolve, 2000));
        data = {
          comments: [
            { id: '1', type: 'LOGIC', severity: 'BLOCKER', position: '3.1', originalText: '支持实时面部表情捕捉', comment: '【风险提示】完全缺失“成功指标”定义。需明确驱动准确率（如>95%）及端到端延迟要求。' },
            { id: '2', type: 'TECH', severity: 'WARNING', position: '3.1', originalText: '端侧计算', comment: '根据《技术栈规范》，端侧计算需通过安全合规检测，文档未提及SDK安全性。' },
            { id: '3', type: 'RISK', severity: 'BLOCKER', position: '3.2', originalText: '10人同时在线', comment: '【风险提示】涉及实时音视频，未考虑全球延迟同步方案及敏感内容实时审核机制。' }
          ]
        };
      }
      
      setComments(data.comments);
    } catch (error) {
      console.error("Review failed", error);
      alert("AI Review failed. Check console.");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleDecisionVote = async (choice: 'PRO' | 'CON'): Promise<VoteData> => {
     // Call Edge Function
     try {
         const res = await fetch(`/api/vote?anchorId=face_drive_scheme`, {
             method: 'POST',
             body: JSON.stringify({ vote: choice, reason: 'User selection' })
         });
         
         if(res.ok) {
             return await res.json();
         }
     } catch(e) { console.error(e); }

     // Fallback
     return {
         pros: choice === 'PRO' ? 1 : 0,
         cons: choice === 'CON' ? 1 : 0,
         heatmap: 0.65,
         aiSummary: "AI分析：根据团队历史偏好，目前倾向于‘方案A’以提升实时性体验。",
         userVote: choice
     };
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800">
        <div className="p-4 flex items-center gap-2 border-b border-slate-800">
          <div className="w-8 h-8 bg-aliyun rounded-lg flex items-center justify-center">
             <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">PRD-Agents</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <div className="text-xs text-slate-500 uppercase font-semibold mb-2 ml-2">Work Space</div>
          <button 
            onClick={() => setActiveTab('EDITOR')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'EDITOR' ? 'bg-aliyun text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <FileText className="w-4 h-4" />
            PRD 编辑器
          </button>
          <button 
             onClick={() => setActiveTab('KNOWLEDGE')}
             className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'KNOWLEDGE' ? 'bg-aliyun text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Database className="w-4 h-4" />
            知识库 (RAG)
          </button>
          <button 
             onClick={() => setActiveTab('IMPACT')}
             className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'IMPACT' ? 'bg-aliyun text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Share2 className="w-4 h-4" />
            影响面分析
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800 rounded p-3 text-xs text-slate-400">
            <div className="flex items-center gap-2 mb-1 text-white">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span>ESA Edge Powered</span>
            </div>
            Node: aliyun-hk-01
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
            <div className="flex items-center gap-4">
                <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded border border-orange-200">DEMO</span>
                <h1 className="font-semibold text-gray-700 truncate">{DEMO_PROJECT_NAME}</h1>
            </div>
            <div className="flex items-center gap-3">
                <button 
                    onClick={handleAIReview}
                    disabled={isReviewing}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-all text-sm font-medium shadow-md hover:shadow-lg disabled:opacity-50"
                >
                    {isReviewing ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/> : <Bot className="w-4 h-4" />}
                    {isReviewing ? 'AI 深度审查中...' : '启动 AI 评审副驾'}
                </button>
            </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
            {/* Center: Editor */}
            <div className={`flex-1 flex flex-col min-w-0 bg-white ${activeTab !== 'EDITOR' ? 'hidden' : ''}`}>
                 <PRDEditor value={content} onChange={(v) => setContent(v || '')} />
            </div>

            {/* Knowledge Tab */}
            <div className={`flex-1 p-8 bg-gray-50 overflow-auto ${activeTab !== 'KNOWLEDGE' ? 'hidden' : ''}`}>
                <h2 className="text-xl font-bold mb-6 text-gray-800">企业级知识库 (模拟ESA KV存储)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {KNOWLEDGE_BASE_FILES.map((file, i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                                <Database className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-medium text-gray-700">{file.name}</h3>
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> Ready for RAG
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Impact Tab */}
            <div className={`flex-1 p-6 bg-white overflow-auto ${activeTab !== 'IMPACT' ? 'hidden' : ''}`}>
                <h2 className="text-xl font-bold mb-4 text-gray-800">决策影响图谱 (D3.js)</h2>
                <p className="text-sm text-gray-500 mb-6">基于PRD内容实时分析的模块依赖关系。</p>
                <ImpactGraph />
            </div>

            {/* Right: AI Panel (Only visible in Editor mode) */}
            {activeTab === 'EDITOR' && (
                <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col shadow-[rgba(0,0,0,0.05)_0px_0px_10px_-5px_inset]">
                    <div className="p-4 border-b border-gray-200 bg-white">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <Bot className="w-4 h-4 text-aliyun" />
                            AI 协作面板
                        </h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Interactive Decision Widget */}
                        <div className="space-y-2">
                             <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">需决策项</div>
                             <DecisionWidget 
                                anchorText="{{DECISION: 面部驱动方案采用端侧计算还是云端计算？}}" 
                                onVote={handleDecisionVote}
                             />
                        </div>

                        {/* AI Reviews */}
                        {comments.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex justify-between">
                                    <span>审查意见 ({comments.length})</span>
                                    <span className="text-aliyun">DeepSeek V3</span>
                                </div>
                                {comments.map((comment) => (
                                    <div key={comment.id} className={`bg-white p-3 rounded-lg border shadow-sm text-sm ${comment.severity === 'BLOCKER' ? 'border-red-200 border-l-4 border-l-red-500' : 'border-orange-200 border-l-4 border-l-orange-400'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${comment.severity === 'BLOCKER' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                                                {comment.severity}
                                            </span>
                                            <span className="text-xs text-gray-400">{comment.type}</span>
                                        </div>
                                        <div className="text-gray-500 text-xs mb-1 italic">"{comment.originalText}"</div>
                                        <div className="text-gray-800 leading-relaxed">{comment.comment}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {!isReviewing && comments.length === 0 && (
                            <div className="text-center py-10 text-gray-400">
                                <Info className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">点击上方 "启动 AI 评审" <br/>让 Agent 分析当前 PRD</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;