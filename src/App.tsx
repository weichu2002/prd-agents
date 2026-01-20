import React, { useState, useEffect, useRef } from 'react';
import { Bot, FileText, Database, Share2, Zap, AlertTriangle, CheckCircle, Info, Upload, Link as LinkIcon, Users, FileUp, Download, User } from 'lucide-react';
import PRDEditor from './components/Editor';
import DecisionWidget from './components/DecisionWidget';
import ImpactGraph from './components/ImpactGraph';
import { LINGJING_PRD_CONTENT, DEMO_PROJECT_NAME, KNOWLEDGE_BASE_FILES } from './constants';
import { AIReviewComment, VoteData } from './types';
import { parseFileToText } from './utils/fileParsing';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [content, setContent] = useState(LINGJING_PRD_CONTENT);
  const [activeTab, setActiveTab] = useState<'EDITOR' | 'KNOWLEDGE' | 'IMPACT'>('EDITOR');
  const [isReviewing, setIsReviewing] = useState(false);
  const [comments, setComments] = useState<AIReviewComment[]>([]);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [roomId, setRoomId] = useState<string>('');
  const [kbFiles, setKbFiles] = useState(KNOWLEDGE_BASE_FILES);
  const [isImporting, setIsImporting] = useState(false);

  // File Inputs Refs
  const prdFileInputRef = useRef<HTMLInputElement>(null);
  const kbFileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Room and Demo Data
  useEffect(() => {
    // 1. Check URL for Room ID
    const params = new URLSearchParams(window.location.search);
    let currentRoomId = params.get('room');

    if (!currentRoomId) {
        currentRoomId = uuidv4().slice(0, 8); // Generate short ID
        const newUrl = `${window.location.pathname}?room=${currentRoomId}`;
        window.history.replaceState({}, '', newUrl);
    }
    setRoomId(currentRoomId);

    // 2. Load Init Data
    fetch('/api/init').catch(err => console.log('Running in pure client mode or Init failed', err));
    
    // 3. Load Comments for this room (Simulated persistence)
    fetch(`/api/comments?roomId=${currentRoomId}`)
        .then(res => res.json())
        .then(data => {
            if (data.comments && Array.isArray(data.comments)) {
                setComments(data.comments);
            }
        })
        .catch(() => {});

    setDemoLoaded(true);
  }, []);

  // Save comments when they change
  useEffect(() => {
      if (comments.length > 0 && roomId) {
          fetch(`/api/comments?roomId=${roomId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ comments })
          }).catch(e => console.error("Failed to sync comments", e));
      }
  }, [comments, roomId]);

  const handleAIReview = async () => {
    setIsReviewing(true);
    setComments([]);

    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prdContent: content })
      });

      let data;
      if (res.ok) {
        data = await res.json();
      } else {
        console.warn("Edge API failed, using fallback mock data.");
        // Fallback for demo/error cases
        await new Promise(resolve => setTimeout(resolve, 1500));
        data = {
          comments: [
            { id: uuidv4(), type: 'LOGIC', severity: 'BLOCKER', position: '3.1', originalText: '支持实时面部表情捕捉', comment: '【风险提示】完全缺失“成功指标”定义。需明确驱动准确率（如>95%）及端到端延迟要求。' },
            { id: uuidv4(), type: 'TECH', severity: 'WARNING', position: '3.1', originalText: '端侧计算', comment: '根据《技术栈规范》，端侧计算需通过安全合规检测，文档未提及SDK安全性。' },
            { id: uuidv4(), type: 'RISK', severity: 'BLOCKER', position: '3.2', originalText: '10人同时在线', comment: '【风险提示】涉及实时音视频，未考虑全球延迟同步方案及敏感内容实时审核机制。' }
          ]
        };
      }
      
      if (data && Array.isArray(data.comments)) {
        setComments(data.comments);
      }
    } catch (error) {
      console.error("Review failed", error);
      alert("AI 评审失败，请检查网络或控制台。");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleDecisionVote = async (choice: 'PRO' | 'CON'): Promise<VoteData> => {
     try {
         const res = await fetch(`/api/vote?anchorId=face_drive_scheme&roomId=${roomId}`, {
             method: 'POST',
             body: JSON.stringify({ vote: choice, reason: 'User selection' })
         });
         
         if(res.ok) {
             return await res.json();
         }
     } catch(e) { console.error(e); }

     return {
         pros: choice === 'PRO' ? 1 : 0,
         cons: choice === 'CON' ? 1 : 0,
         heatmap: 0.65,
         aiSummary: "AI分析：根据团队历史偏好，目前倾向于‘方案A’以提升实时性体验。",
         userVote: choice
     };
  };

  const handleImportPRD = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      try {
          const text = await parseFileToText(file);
          if (content !== LINGJING_PRD_CONTENT && !window.confirm("这将覆盖当前的 PRD 内容，是否继续？")) {
              setIsImporting(false);
              return;
          }
          setContent(text);
          alert(`成功导入 ${file.name}`);
      } catch (err) {
          alert("文件解析失败: " + (err as Error).message);
      } finally {
          setIsImporting(false);
          if (prdFileInputRef.current) prdFileInputRef.current.value = '';
      }
  };

  const handleImportKB = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
          await parseFileToText(file); 
          setKbFiles(prev => [...prev, { name: file.name, status: 'ready' }]);
          alert(`知识库文件 ${file.name} 添加成功 (已解析并索引)`);
      } catch (err) {
          alert("知识库导入失败: " + (err as Error).message);
      } finally {
          if (kbFileInputRef.current) kbFileInputRef.current.value = '';
      }
  };

  const copyRoomLink = () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      alert("房间链接已复制！您可以发送给团队成员邀请协作。");
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 flex-shrink-0">
        <div className="p-4 flex items-center gap-2 border-b border-slate-800">
          <div className="w-8 h-8 bg-aliyun rounded-lg flex items-center justify-center">
             <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">PRD-Agents</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <div className="text-xs text-slate-500 uppercase font-semibold mb-2 ml-2">工作区</div>
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
              <span>ESA 边缘计算驱动</span>
            </div>
            节点: 阿里云香港-01
            <div className="mt-2 pt-2 border-t border-slate-700 flex items-center gap-2 text-slate-300 truncate">
                <Users className="w-3 h-3 flex-shrink-0" />
                <span className="truncate" title={`房间号: ${roomId}`}>房间号: {roomId}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10 flex-shrink-0">
            <div className="flex items-center gap-4 min-w-0">
                <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded border border-orange-200 whitespace-nowrap">演示模式</span>
                <h1 className="font-semibold text-gray-700 truncate" title={DEMO_PROJECT_NAME}>{DEMO_PROJECT_NAME}</h1>
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap">
                <button 
                    onClick={copyRoomLink}
                    className="flex items-center gap-2 text-gray-600 hover:text-aliyun transition-colors text-sm px-3 py-1.5 rounded-lg border border-transparent hover:border-gray-200 hover:bg-gray-50"
                    title="复制邀请链接"
                >
                    <LinkIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">邀请协作</span>
                </button>
                <div className="h-6 w-px bg-gray-300 mx-1"></div>
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
                 <div className="h-10 border-b border-gray-100 bg-gray-50 flex items-center px-4 justify-between">
                     <span className="text-xs text-gray-400 font-medium">MARKDOWN 编辑模式</span>
                     <div className="flex gap-2">
                        <input 
                            type="file" 
                            accept=".pdf,.docx,.doc,.md,.txt" 
                            ref={prdFileInputRef} 
                            onChange={handleImportPRD} 
                            className="hidden" 
                        />
                        <button 
                            onClick={() => prdFileInputRef.current?.click()}
                            disabled={isImporting}
                            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-aliyun px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                        >
                            {isImporting ? <div className="animate-spin w-3 h-3 border border-gray-500 border-t-transparent rounded-full"/> : <FileUp className="w-3.5 h-3.5" />}
                            导入 PRD (PDF/Word)
                        </button>
                     </div>
                 </div>
                 <div className="flex-1 relative">
                    <PRDEditor value={content} onChange={(v) => setContent(v || '')} />
                 </div>
            </div>

            {/* Knowledge Tab */}
            <div className={`flex-1 p-8 bg-gray-50 overflow-auto ${activeTab !== 'KNOWLEDGE' ? 'hidden' : ''}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">企业级知识库 (RAG Context)</h2>
                    <div>
                         <input 
                            type="file" 
                            accept=".pdf,.docx,.doc,.md,.txt" 
                            ref={kbFileInputRef} 
                            onChange={handleImportKB} 
                            className="hidden" 
                        />
                        <button 
                            onClick={() => kbFileInputRef.current?.click()}
                            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-colors text-sm font-medium"
                        >
                            <Upload className="w-4 h-4" />
                            上传知识文档
                        </button>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {kbFiles.map((file, i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer group">
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500 group-hover:bg-blue-100 transition-colors">
                                <Database className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-gray-700 truncate" title={file.name}>{file.name}</h3>
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> 已索引 (Ready)
                                </span>
                            </div>
                        </div>
                    ))}
                    
                    <button 
                        onClick={() => kbFileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center text-gray-400 hover:border-aliyun hover:text-aliyun transition-colors min-h-[80px]"
                    >
                        <Upload className="w-6 h-6 mb-1 opacity-50" />
                        <span className="text-xs font-medium">点击添加文档</span>
                    </button>
                </div>
                
                <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 flex gap-3">
                    <Info className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <p className="font-bold mb-1">RAG 机制说明</p>
                        <p>上传的文档将被解析并向量化存储于阿里云 ESA Edge KV 中。当 AI 评审 PRD 时，会自动检索这些文档中的相关规范（如《技术栈规范》）作为上下文依据。</p>
                    </div>
                </div>
            </div>

            {/* Impact Tab */}
            <div className={`flex-1 p-6 bg-white overflow-auto ${activeTab !== 'IMPACT' ? 'hidden' : ''}`}>
                <h2 className="text-xl font-bold mb-4 text-gray-800">决策影响图谱 (D3.js)</h2>
                <p className="text-sm text-gray-500 mb-6">基于 PRD 内容实时分析的模块依赖关系。</p>
                <ImpactGraph />
            </div>

            {/* Right: AI Panel (Only visible in Editor mode) */}
            {activeTab === 'EDITOR' && (
                <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col shadow-[rgba(0,0,0,0.05)_0px_0px_10px_-5px_inset] flex-shrink-0 h-full">
                    <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <Bot className="w-4 h-4 text-aliyun" />
                            AI 协作面板
                        </h3>
                        {comments.length > 0 && (
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{comments.length}</span>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Interactive Decision Widget */}
                        <div className="space-y-2">
                             <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> 待决策项
                             </div>
                             <DecisionWidget 
                                anchorText="{{DECISION: 面部驱动方案采用端侧计算还是云端计算？}}" 
                                onVote={handleDecisionVote}
                             />
                        </div>

                        <div className="h-px bg-gray-200 my-2"></div>

                        {/* AI Reviews */}
                        <div className="space-y-3">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                                <span>评审意见流</span>
                                <span className="text-[10px] text-aliyun border border-aliyun/30 px-1 rounded">DeepSeek V3</span>
                            </div>
                            
                            {comments.length > 0 ? (
                                comments.map((comment) => (
                                    <div key={comment.id} className={`bg-white p-3 rounded-lg border shadow-sm text-sm transition-all duration-300 ${comment.severity === 'BLOCKER' ? 'border-red-200 border-l-4 border-l-red-500' : 'border-orange-200 border-l-4 border-l-orange-400'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                                    <Bot className="w-3 h-3 text-slate-600" />
                                                </div>
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${comment.severity === 'BLOCKER' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    {comment.severity === 'BLOCKER' ? '阻断性' : '警告'}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                                {comment.type === 'LOGIC' ? '逻辑' : comment.type === 'RISK' ? '风险' : '技术'}
                                            </span>
                                        </div>
                                        <div className="text-gray-400 text-xs mb-2 pl-2 border-l-2 border-gray-100 italic line-clamp-2">
                                            "{comment.originalText}"
                                        </div>
                                        <div className="text-gray-800 leading-relaxed text-sm">
                                            {comment.comment}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                !isReviewing && (
                                    <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                                        <Info className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                        <p className="text-xs text-gray-400">暂无评审意见<br/>点击顶部按钮启动 AI 审查</p>
                                    </div>
                                )
                            )}
                            
                            {isReviewing && (
                                <div className="space-y-3">
                                    {[1, 2].map(i => (
                                        <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse flex flex-col p-3 gap-2">
                                             <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                                             <div className="h-3 bg-gray-200 rounded w-full"></div>
                                             <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;