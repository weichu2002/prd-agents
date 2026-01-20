import React, { useState, useEffect, useRef } from 'react';
import { Bot, FileText, Database, Share2, Zap, AlertTriangle, CheckCircle, Info, Upload, Link as LinkIcon, Users, FileUp, Download, User, MessageSquarePlus, Lock, Unlock, LogOut, Settings, X, Plus } from 'lucide-react';
import PRDEditor from './components/Editor';
import DecisionWidget from './components/DecisionWidget';
import ImpactGraph from './components/ImpactGraph';
import { LandingPage } from './components/LandingPage'; // Import Landing Page
import { LINGJING_PRD_CONTENT, DEMO_PROJECT_NAME, KNOWLEDGE_BASE_FILES } from './constants';
import { AIReviewComment, VoteData, UserRole, RoomSettings, DecisionAnchor } from './types';
import { parseFileToText } from './utils/fileParsing';
import { v4 as uuidv4 } from 'uuid';

function App() {
  // --- View State ---
  // If no room ID in URL, show 'LANDING'. If ID exists, show 'WORKSPACE'.
  const [view, setView] = useState<'LANDING' | 'WORKSPACE'>('LANDING');

  // --- Workspace State ---
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState<'EDITOR' | 'KNOWLEDGE' | 'IMPACT'>('EDITOR');
  const [comments, setComments] = useState<AIReviewComment[]>([]);
  const [kbFiles, setKbFiles] = useState(KNOWLEDGE_BASE_FILES); // Mock KB state
  
  // Room & User Identity
  const [roomId, setRoomId] = useState<string>('');
  const [role, setRole] = useState<UserRole>('GUEST');
  const [username, setUsername] = useState(''); // New: User Identity
  const [showNameModal, setShowNameModal] = useState(false); // New: Name Modal
  
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
      allowGuestEdit: false,
      allowGuestComment: true,
      isActive: true
  });
  
  // UI Flags
  const [isReviewing, setIsReviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Dynamic Decision Anchors
  const [decisionAnchors, setDecisionAnchors] = useState<string[]>([]);
  
  // Inputs
  const [newComment, setNewComment] = useState('');
  const prdFileInputRef = useRef<HTMLInputElement>(null);
  const kbFileInputRef = useRef<HTMLInputElement>(null);

  // --- 1. Init Logic ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoomId = params.get('room');

    if (urlRoomId) {
        setRoomId(urlRoomId);
        setView('WORKSPACE');
        initializeRoom(urlRoomId);
    } else {
        setView('LANDING');
    }
  }, []);

  // --- 2. Dynamic Decision Parsing ---
  useEffect(() => {
    // Regex to find {{DECISION: ...}}
    const regex = /\{\{DECISION:([^}]+)\}\}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        matches.push(match[0]); // Push the full tag
    }
    // Simple deduplication
    setDecisionAnchors([...new Set(matches)]);
  }, [content]);

  // --- Functions ---

  const initializeRoom = (id: string, isCreate = false) => {
      // Check for stored name
      const storedName = localStorage.getItem('prd_username');
      if (storedName) {
          setUsername(storedName);
      } else {
          setShowNameModal(true);
      }

      // Check Ownership
      const ownerKey = `prd_owner_${id}`;
      const isOwner = localStorage.getItem(ownerKey) === 'true' || isCreate;
      
      if (isOwner) {
          setRole('OWNER');
          localStorage.setItem(ownerKey, 'true');
          // If creating, push initial content
          if (isCreate) {
              pushRoomUpdate(id, { 
                content: LINGJING_PRD_CONTENT,
                comments: [],
                settings: { allowGuestEdit: false, allowGuestComment: true, isActive: true }
              }, 'OWNER');
              setContent(LINGJING_PRD_CONTENT);
          }
      } else {
          setRole('GUEST');
      }
  };

  const handleCreateRoom = () => {
      const newId = uuidv4().slice(0, 8);
      const newUrl = `${window.location.pathname}?room=${newId}`;
      window.history.pushState({}, '', newUrl);
      setRoomId(newId);
      setView('WORKSPACE');
      initializeRoom(newId, true);
  };

  const handleJoinRoom = (id: string) => {
      const newUrl = `${window.location.pathname}?room=${id}`;
      window.history.pushState({}, '', newUrl);
      setRoomId(id);
      setView('WORKSPACE');
      initializeRoom(id, false);
  };

  const handleSetUsername = (name: string) => {
      if (!name.trim()) return;
      setUsername(name);
      localStorage.setItem('prd_username', name);
      setShowNameModal(false);
  };

  // --- Sync Logic ---
  useEffect(() => {
      if (view !== 'WORKSPACE' || !roomId) return;

      const interval = setInterval(async () => {
          setIsSyncing(true);
          try {
              const res = await fetch(`/api/room/sync?roomId=${roomId}`);
              const data = await res.json();

              if (data.exists && data.state) {
                  if (!data.state.settings.isActive) {
                      alert("房主已结束该协作房间。");
                      window.location.href = "/"; 
                      return;
                  }
                  
                  // Only update content if changed significantly to avoid cursor jumps
                  // In a real app we'd use CRDTs. Here we just trust server if local is empty 
                  // or if we are a guest pulling latest changes.
                  if (data.state.content !== content) {
                      // Simple collision avoidance: Only overwrite if I am not currently typing? 
                      // For this demo, we accept the server state to ensure viewers see updates.
                      setContent(data.state.content);
                  }

                  setComments(data.state.comments || []);
                  setRoomSettings(data.state.settings);
              }
          } catch (e) {
              console.error("Sync error", e);
          } finally {
              setIsSyncing(false);
          }
      }, 3000); 

      return () => clearInterval(interval);
  }, [roomId, view, content]); 

  const pushRoomUpdate = async (rId: string, updates: any, uRole: string) => {
      try {
          await fetch('/api/room/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId: rId, updates, userRole: uRole })
          });
      } catch (e) {
          console.error("Push update failed", e);
      }
  };

  const handleContentChange = (newVal: string | undefined) => {
      const val = newVal || '';
      setContent(val);
      if (role === 'OWNER' || roomSettings.allowGuestEdit) {
           pushRoomUpdate(roomId, { content: val }, role);
      }
  };

  const handleAIReview = async () => {
    if (role !== 'OWNER') return alert("仅房主可使用 AI 消耗 Token");
    
    setIsReviewing(true);
    try {
      // Send Content + KB Context
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            prdContent: content,
            kbFiles: kbFiles // Send file metadata for RAG context
        })
      });
      const data = await res.json();
      
      const newComments = data.comments.map((c: any) => ({
          ...c, 
          id: uuidv4(), 
          author: 'AI 评审副驾',
          timestamp: Date.now()
      }));
      
      // Preserve existing Human comments, append AI comments
      const merged = [...comments, ...newComments];
      setComments(merged);
      pushRoomUpdate(roomId, { comments: merged }, role);
      
    } catch (error) {
      alert("AI 服务繁忙，请稍后重试");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleManualComment = () => {
      if (!newComment.trim()) return;
      if (role !== 'OWNER' && !roomSettings.allowGuestComment) return alert("房主未开启评论权限");

      const comment: AIReviewComment = {
          id: uuidv4(),
          type: 'HUMAN',
          severity: 'INFO',
          position: 'General',
          originalText: 'User Comment',
          comment: newComment,
          author: username || (role === 'OWNER' ? '房主' : '匿名用户'),
          timestamp: Date.now()
      };

      const updated = [...comments, comment];
      setComments(updated);
      setNewComment('');
      pushRoomUpdate(roomId, { comments: updated }, role);
  };

  const toggleSettings = async (key: keyof RoomSettings) => {
      if (role !== 'OWNER') return;
      const newSettings = { ...roomSettings, [key]: !roomSettings[key] };
      setRoomSettings(newSettings);
      await pushRoomUpdate(roomId, { settings: newSettings }, role);
  };

  const endRoom = async () => {
      if (!confirm("确定要结束协作吗？这将清空所有数据。")) return;
      await fetch('/api/room/close', {
          method: 'POST',
          body: JSON.stringify({ roomId, userRole: role })
      });
      window.location.href = "/";
  };

  const handleImportPRD = async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (role !== 'OWNER') return alert("仅房主可导入文件");
      const file = event.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      try {
          const text = await parseFileToText(file);
          if (content && !confirm("覆盖当前内容？")) return;
          setContent(text);
          pushRoomUpdate(roomId, { content: text }, role);
      } catch (err) {
          alert("导入失败");
      } finally {
          setIsImporting(false);
          if (prdFileInputRef.current) prdFileInputRef.current.value = '';
      }
  };

  const copyRoomLink = () => {
      navigator.clipboard.writeText(window.location.href);
      alert("链接已复制！");
  };

  // --- Render ---

  if (view === 'LANDING') {
      return <LandingPage onCreate={handleCreateRoom} onJoin={handleJoinRoom} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 relative">
      {/* Nickname Modal */}
      {showNameModal && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <h3 className="text-lg font-bold mb-4">欢迎加入协作</h3>
                  <p className="text-sm text-gray-500 mb-4">请输入您的名字以便团队识别身份。</p>
                  <input 
                    type="text" 
                    placeholder="您的昵称 (如: 产品-Kevin)"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:ring-2 focus:ring-aliyun focus:border-transparent outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetUsername((e.target as HTMLInputElement).value);
                    }}
                  />
                  <button 
                    onClick={(e) => handleSetUsername((e.currentTarget.previousElementSibling as HTMLInputElement).value)}
                    className="w-full bg-aliyun text-white py-2 rounded-lg font-bold hover:bg-aliyun-dark transition-colors"
                  >
                      进入工作区
                  </button>
              </div>
          </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 flex-shrink-0">
        <div className="p-4 flex items-center gap-2 border-b border-slate-800">
          <div className="w-8 h-8 bg-aliyun rounded-lg flex items-center justify-center cursor-pointer" onClick={() => window.location.href="/"}>
             <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">PRD-Agents</span>
        </div>
        
        <div className="p-4 bg-slate-800/50">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 uppercase font-bold">当前身份</span>
                {role === 'OWNER' ? (
                    <span className="bg-aliyun text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Users className="w-3 h-3"/> 房主
                    </span>
                ) : (
                    <span className="bg-slate-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <User className="w-3 h-3"/> 访客
                    </span>
                )}
            </div>
            <div className="text-xs text-slate-300 font-medium truncate mb-2">
                👤 {username || '未设置昵称'}
            </div>
            {role === 'OWNER' && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                     <button onClick={() => setShowSettings(!showSettings)} className="bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded text-center transition-colors flex items-center justify-center gap-1">
                         <Settings className="w-3 h-3"/> 权限
                     </button>
                     <button onClick={endRoom} className="bg-red-900/50 hover:bg-red-900 text-red-200 text-xs py-1.5 rounded text-center transition-colors flex items-center justify-center gap-1">
                         <LogOut className="w-3 h-3"/> 结束
                     </button>
                </div>
            )}
        </div>

        {showSettings && role === 'OWNER' && (
            <div className="p-4 bg-slate-800 border-t border-slate-700 animate-in slide-in-from-left-2">
                <h4 className="text-xs font-bold text-slate-300 mb-2">房间权限管理</h4>
                <div className="space-y-2">
                    <button onClick={() => toggleSettings('allowGuestEdit')} className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-white">
                        <span>允许访客编辑文档</span>
                        {roomSettings.allowGuestEdit ? <Unlock className="w-3 h-3 text-green-400"/> : <Lock className="w-3 h-3 text-red-400"/>}
                    </button>
                    <button onClick={() => toggleSettings('allowGuestComment')} className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-white">
                        <span>允许访客评论</span>
                        {roomSettings.allowGuestComment ? <Unlock className="w-3 h-3 text-green-400"/> : <Lock className="w-3 h-3 text-red-400"/>}
                    </button>
                </div>
            </div>
        )}
        
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('EDITOR')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'EDITOR' ? 'bg-aliyun text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <FileText className="w-4 h-4" /> PRD 编辑器
          </button>
          <button onClick={() => setActiveTab('KNOWLEDGE')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'KNOWLEDGE' ? 'bg-aliyun text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <Database className="w-4 h-4" /> 知识库 (RAG)
          </button>
          <button onClick={() => setActiveTab('IMPACT')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'IMPACT' ? 'bg-aliyun text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <Share2 className="w-4 h-4" /> 影响面分析
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
             <div className="flex items-center justify-between">
                 <span>Sync Status:</span>
                 <span className={isSyncing ? "text-green-400" : "text-slate-600"}>{isSyncing ? "Syncing..." : "Idle"}</span>
             </div>
             <div className="truncate mt-1 opacity-50">Room: {roomId}</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden w-0 relative">
        {/* Permission Overlay */}
        {role === 'GUEST' && !roomSettings.allowGuestEdit && activeTab === 'EDITOR' && (
            <div className="absolute top-14 left-0 right-96 bottom-0 z-10 bg-white/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                 <div className="bg-slate-800 text-white px-4 py-2 rounded-lg shadow-xl flex items-center gap-2">
                     <Lock className="w-4 h-4"/> 
                     <span>只读模式 (等待房主授权编辑)</span>
                 </div>
            </div>
        )}

        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-20 flex-shrink-0">
            <div className="flex items-center gap-4 min-w-0">
                <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded border border-orange-200 whitespace-nowrap">ESA 实时协作</span>
                <h1 className="font-semibold text-gray-700 truncate">{DEMO_PROJECT_NAME}</h1>
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap">
                <button onClick={copyRoomLink} className="flex items-center gap-2 text-gray-600 hover:text-aliyun text-sm px-3 py-1.5 rounded-lg border border-transparent hover:bg-gray-50">
                    <LinkIcon className="w-4 h-4" /> 邀请
                </button>
                <div className="h-6 w-px bg-gray-300 mx-1"></div>
                
                {role === 'OWNER' ? (
                     <button onClick={handleAIReview} disabled={isReviewing} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-all text-sm font-medium shadow-md">
                        {isReviewing ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/> : <Bot className="w-4 h-4" />}
                        {isReviewing ? 'AI 审查中...' : '启动 AI 评审'}
                     </button>
                ) : (
                    <button disabled className="flex items-center gap-2 bg-gray-100 text-gray-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed">
                        <Bot className="w-4 h-4" /> 仅房主可用 AI
                    </button>
                )}
            </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
            {/* Editor Tab */}
            <div className={`flex-1 flex flex-col min-w-0 bg-white ${activeTab !== 'EDITOR' ? 'hidden' : ''}`}>
                 <div className="h-10 border-b border-gray-100 bg-gray-50 flex items-center px-4 justify-between z-10">
                     <span className="text-xs text-gray-400 font-medium">MARKDOWN 编辑模式</span>
                     {role === 'OWNER' && (
                        <div className="flex gap-2">
                            <input type="file" accept=".pdf,.docx,.doc,.md" ref={prdFileInputRef} onChange={handleImportPRD} className="hidden" />
                            <button onClick={() => prdFileInputRef.current?.click()} disabled={isImporting} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-aliyun px-2 py-1 rounded hover:bg-gray-100">
                                <FileUp className="w-3.5 h-3.5" /> 导入文档
                            </button>
                        </div>
                     )}
                 </div>
                 <div className="flex-1 relative">
                    <PRDEditor 
                        value={content} 
                        onChange={handleContentChange} 
                    />
                 </div>
            </div>

            {/* Knowledge Tab */}
            <div className={`flex-1 p-8 bg-gray-50 overflow-auto ${activeTab !== 'KNOWLEDGE' ? 'hidden' : ''}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">企业级知识库 (RAG Context)</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {kbFiles.map((file, i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                                <Database className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-gray-700 truncate">{file.name}</h3>
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> 已索引
                                </span>
                            </div>
                        </div>
                    ))}
                    
                    {role === 'OWNER' && (
                        <button className="border-2 border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center text-gray-400 hover:border-aliyun hover:text-aliyun transition-colors min-h-[80px]">
                            <Plus className="w-6 h-6 mb-1 opacity-50" />
                            <span className="text-xs font-medium">添加文档 (Mock)</span>
                        </button>
                    )}
                </div>
            </div>

             {/* Impact Tab */}
             <div className={`flex-1 p-6 bg-white overflow-auto ${activeTab !== 'IMPACT' ? 'hidden' : ''}`}>
                <h2 className="text-xl font-bold mb-4 text-gray-800">决策影响图谱</h2>
                <ImpactGraph />
            </div>

            {/* Right: Collaboration Panel */}
            {activeTab === 'EDITOR' && (
                <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col shadow-inner flex-shrink-0 h-full z-20">
                    <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <MessageSquarePlus className="w-4 h-4 text-aliyun" />
                            协作讨论区
                        </h3>
                        <span className="text-xs text-gray-400">{comments.length} 条记录</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Dynamic Decision Widgets */}
                        {decisionAnchors.length > 0 && (
                            <div className="space-y-3 mb-4">
                                {decisionAnchors.map((anchor, idx) => (
                                    <DecisionWidget 
                                        key={idx} 
                                        anchorText={anchor} 
                                        onVote={async (c) => ({pros:1, cons:0, heatmap:0.8, aiSummary:'已记录您的投票，等待共识计算...'})} 
                                    />
                                ))}
                                <div className="h-px bg-gray-200 my-2"></div>
                            </div>
                        )}

                        {comments.length === 0 && decisionAnchors.length === 0 && (
                             <div className="text-center py-8 text-gray-400 text-xs">暂无讨论或评审意见</div>
                        )}

                        {comments.map((comment) => (
                            <div key={comment.id} className={`p-3 rounded-lg border shadow-sm text-sm bg-white ${comment.type === 'HUMAN' ? 'border-blue-100' : 'border-orange-100'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        {comment.type === 'HUMAN' ? <User className="w-4 h-4 text-blue-500"/> : <Bot className="w-4 h-4 text-aliyun"/>}
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-700 text-xs">{comment.author}</span>
                                            {comment.timestamp && <span className="text-[9px] text-gray-400">{new Date(comment.timestamp).toLocaleTimeString()}</span>}
                                        </div>
                                    </div>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${comment.type === 'HUMAN' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                        {comment.type === 'HUMAN' ? '讨论' : comment.severity}
                                    </span>
                                </div>
                                {comment.originalText && comment.originalText !== 'User Comment' && (
                                     <div className="text-gray-400 text-xs mb-2 pl-2 border-l-2 border-gray-200 italic truncate max-w-[250px]">"{comment.originalText}"</div>
                                )}
                                <div className="text-gray-800 break-words">{comment.comment}</div>
                            </div>
                        ))}
                    </div>

                    {/* Manual Comment Input */}
                    {(role === 'OWNER' || roomSettings.allowGuestComment) ? (
                        <div className="p-3 bg-white border-t border-gray-200">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="输入评论或建议..."
                                    className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-aliyun"
                                    onKeyDown={(e) => e.key === 'Enter' && handleManualComment()}
                                />
                                <button onClick={handleManualComment} className="bg-slate-900 text-white px-3 rounded hover:bg-slate-800">
                                    <MessageSquarePlus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 bg-gray-100 text-center text-xs text-gray-400 border-t border-gray-200">
                            <Lock className="w-3 h-3 inline mr-1"/> 评论权限已关闭
                        </div>
                    )}
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;