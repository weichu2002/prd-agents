
import React, { useState, useEffect, useRef } from 'react';
import { Bot, FileText, Database, Share2, Link as LinkIcon, Users, FileUp, User, MessageSquarePlus, Lock, Unlock, LogOut, Settings, Quote, X, Plus, CheckCircle, Trash2, Download, AlertTriangle, ChevronDown } from 'lucide-react';
import PRDEditor from './components/Editor';
import DecisionWidget from './components/DecisionWidget';
import ImpactGraph from './components/ImpactGraph';
import { LandingPage } from './components/LandingPage';
import { LINGJING_PRD_CONTENT, DEMO_PROJECT_NAME } from './constants';
import { AIReviewComment, UserRole, RoomSettings, KBDocument, ProjectStatus } from './types';
import { parseFileToText } from './utils/fileParsing';
import { v4 as uuidv4 } from 'uuid';

function App() {
  // --- View State ---
  const [view, setView] = useState<'LANDING' | 'WORKSPACE'>('LANDING');

  // --- Workspace State ---
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState<'EDITOR' | 'KNOWLEDGE' | 'IMPACT'>('EDITOR');
  const [comments, setComments] = useState<AIReviewComment[]>([]);
  // KB is now dynamic, initialized empty or synced from server
  const [kbFiles, setKbFiles] = useState<KBDocument[]>([]);
  
  // Room & User Identity
  const [roomId, setRoomId] = useState<string>('');
  const [role, setRole] = useState<UserRole>('GUEST');
  const [username, setUsername] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
      allowGuestEdit: false,
      allowGuestComment: true,
      isActive: true,
      status: 'DRAFT'
  });
  
  // UI Flags & Refs
  const [isReviewing, setIsReviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isKBUploading, setIsKBUploading] = useState(false); // New flag for KB upload
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<any>(null);
  
  // Dynamic Decision Anchors
  const [decisionAnchors, setDecisionAnchors] = useState<string[]>([]);
  
  // Inputs
  const [newComment, setNewComment] = useState('');
  const [quotedText, setQuotedText] = useState('');
  const prdFileInputRef = useRef<HTMLInputElement>(null);
  const kbFileInputRef = useRef<HTMLInputElement>(null); // Ref for KB upload

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
    const regex = /\{\{DECISION:([^}]+)\}\}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        matches.push(match[0]);
    }
    setDecisionAnchors([...new Set(matches)]);
  }, [content]);

  // --- Functions ---

  const initializeRoom = (id: string, isCreate = false, initialSettings?: RoomSettings) => {
      const storedName = localStorage.getItem('prd_username');
      if (storedName) {
          setUsername(storedName);
      } else {
          setShowNameModal(true);
      }

      const ownerKey = `prd_owner_${id}`;
      const isOwner = localStorage.getItem(ownerKey) === 'true' || isCreate;
      
      if (isOwner) {
          setRole('OWNER');
          localStorage.setItem(ownerKey, 'true');
          if (isCreate) {
              const settingsToUse = initialSettings || { allowGuestEdit: false, allowGuestComment: true, isActive: true, status: 'DRAFT' };
              setRoomSettings(settingsToUse);
              // Pre-load default KB for demo purposes? No, let's keep it clean or empty.
              // We'll push empty KB list initially.
              pushRoomUpdate(id, { 
                content: LINGJING_PRD_CONTENT,
                comments: [],
                kbFiles: [], 
                settings: settingsToUse
              }, 'OWNER');
              setContent(LINGJING_PRD_CONTENT);
          }
      } else {
          setRole('GUEST');
      }
  };

  const handleCreateRoom = (settings: RoomSettings) => {
      const newId = uuidv4().slice(0, 8);
      const newUrl = `${window.location.pathname}?room=${newId}`;
      window.history.pushState({}, '', newUrl);
      setRoomId(newId);
      setView('WORKSPACE');
      initializeRoom(newId, true, settings);
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

      const fetchState = async () => {
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
                  
                  if (data.state.content !== content) {
                      setContent(data.state.content);
                  }

                  setComments(data.state.comments || []);
                  setRoomSettings(data.state.settings);
                  // Sync KB Files
                  if (data.state.kbFiles) {
                      setKbFiles(data.state.kbFiles);
                  }
              }
          } catch (e) {
              console.error("Sync error", e);
          } finally {
              setIsSyncing(false);
          }
      };

      fetchState();
      const interval = setInterval(fetchState, 3000); 
      return () => clearInterval(interval);
  }, [roomId, view]); 

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
      // Disable update if APPROVED (Locked)
      if (roomSettings.status === 'APPROVED') return;
      
      if (role === 'OWNER' || roomSettings.allowGuestEdit) {
           pushRoomUpdate(roomId, { content: val }, role);
      }
  };

  // --- AI Review ---
  const handleAIReview = async () => {
    if (role !== 'OWNER') return alert("仅房主可使用 AI 消耗 Token");
    
    setIsReviewing(true);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            prdContent: content,
            kbFiles: kbFiles // Send the actual KB file objects (with content)
        })
      });
      const data = await res.json();
      
      const newComments = data.comments.map((c: any) => ({
          ...c, 
          id: uuidv4(), 
          author: 'AI 评审副驾',
          timestamp: Date.now()
      }));
      
      const merged = [...comments, ...newComments];
      setComments(merged);
      pushRoomUpdate(roomId, { comments: merged }, role);
      setActiveTab('EDITOR'); // Switch back to editor to see comments
      
    } catch (error) {
      alert("AI 服务繁忙，请稍后重试");
    } finally {
      setIsReviewing(false);
    }
  };

  // --- KB Upload Handling ---
  const handleKBUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (role !== 'OWNER') return alert("仅房主可上传知识库文件");
      const files = event.target.files;
      if (!files || files.length === 0) return;

      setIsKBUploading(true);
      const newDocs: KBDocument[] = [];

      try {
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              // Client-side extract text
              const text = await parseFileToText(file);
              newDocs.push({
                  id: uuidv4(),
                  name: file.name,
                  content: text,
                  size: file.size,
                  uploadedAt: Date.now()
              });
          }

          const updatedKB = [...kbFiles, ...newDocs];
          setKbFiles(updatedKB);
          pushRoomUpdate(roomId, { kbFiles: updatedKB }, role);
          
      } catch (err) {
          console.error(err);
          alert("部分文件解析失败，请检查格式");
      } finally {
          setIsKBUploading(false);
          if (kbFileInputRef.current) kbFileInputRef.current.value = '';
      }
  };

  const handleDeleteKB = (docId: string) => {
      if (role !== 'OWNER') return;
      if (!confirm("确定移除该知识库文档？")) return;
      const updatedKB = kbFiles.filter(d => d.id !== docId);
      setKbFiles(updatedKB);
      pushRoomUpdate(roomId, { kbFiles: updatedKB }, role);
  };

  // --- Status & Settings ---
  const changeStatus = async (newStatus: ProjectStatus) => {
      if (role !== 'OWNER') return;
      const newSettings = { ...roomSettings, status: newStatus };
      setRoomSettings(newSettings);
      await pushRoomUpdate(roomId, { settings: newSettings }, role);
  };

  const handleExport = () => {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${DEMO_PROJECT_NAME.replace(/\s+/g, '_')}_v${new Date().toISOString().slice(0,10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // --- Comment Logic ---
  const captureSelection = () => {
      if (editorRef.current) {
          const selection = editorRef.current.getSelection();
          const model = editorRef.current.getModel();
          const text = model.getValueInRange(selection);
          if (text && text.length > 0) {
              setQuotedText(text);
          }
      }
  };

  const handleManualComment = () => {
      if (!newComment.trim()) return;
      if (role !== 'OWNER' && !roomSettings.allowGuestComment) return alert("房主未开启评论权限");

      const comment: AIReviewComment = {
          id: uuidv4(),
          type: 'HUMAN',
          severity: 'INFO',
          position: quotedText ? 'Contextual' : 'General',
          originalText: quotedText || 'User Comment',
          comment: newComment,
          author: username || (role === 'OWNER' ? '房主' : '匿名用户'),
          timestamp: Date.now()
      };

      const updated = [...comments, comment];
      setComments(updated);
      setNewComment('');
      setQuotedText('');
      pushRoomUpdate(roomId, { comments: updated }, role);
  };

  const handleInsertDecision = () => {
      if (roomSettings.status === 'APPROVED') return alert("文档已锁定，无法修改");
      const question = prompt("请输入决策问题 (例如: 登录方式采用手机号还是邮箱?)");
      if (!question) return;

      const anchor = `{{DECISION: ${question}}}`;
      if (editorRef.current) {
          const selection = editorRef.current.getSelection();
          const id = { major: 1, minor: 1 };             
          const op = {identifier: id, range: selection, text: anchor, forceMoveMarkers: true};
          editorRef.current.executeEdits("my-source", [op]);
      }
  };

  // --- Misc ---
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

  // --- Helper for Status Colors ---
  const getStatusColor = (s: ProjectStatus) => {
      switch(s) {
          case 'DRAFT': return 'bg-gray-100 text-gray-700 border-gray-200';
          case 'REVIEW': return 'bg-blue-50 text-blue-700 border-blue-200';
          case 'APPROVED': return 'bg-green-50 text-green-700 border-green-200';
          default: return 'bg-gray-100';
      }
  };

  const getStatusLabel = (s: ProjectStatus) => {
      switch(s) {
          case 'DRAFT': return '草稿阶段';
          case 'REVIEW': return '评审中';
          case 'APPROVED': return '已锁定 (Approved)';
      }
  };

  // --- Render ---

  if (view === 'LANDING') {
      return <LandingPage onCreate={handleCreateRoom} onJoin={handleJoinRoom} />;
  }

  // Derived state for read-only
  const isGlobalReadOnly = roomSettings.status === 'APPROVED';

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 relative">
      {/* Nickname Modal */}
      {showNameModal && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <h3 className="text-lg font-bold mb-4">欢迎加入协作</h3>
                  <input 
                    type="text" 
                    placeholder="您的昵称"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:ring-2 focus:ring-aliyun outline-none"
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
            {/* Identity Card */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 uppercase font-bold">当前身份</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${role === 'OWNER' ? 'bg-aliyun text-white' : 'bg-slate-600 text-white'}`}>
                    {role === 'OWNER' ? <Users className="w-3 h-3"/> : <User className="w-3 h-3"/>}
                    {role === 'OWNER' ? '房主' : '访客'}
                </span>
            </div>
            <div className="text-xs text-slate-300 font-medium truncate mb-2">
                👤 {username || '未设置昵称'}
            </div>
            
            {/* Owner Controls */}
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

        {/* Detailed Settings Panel */}
        {showSettings && role === 'OWNER' && (
            <div className="p-4 bg-slate-800 border-t border-slate-700 animate-in slide-in-from-left-2">
                <h4 className="text-xs font-bold text-slate-300 mb-2">权限管理</h4>
                <div className="space-y-2">
                    <button onClick={() => toggleSettings('allowGuestEdit')} className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-white">
                        <span>允许访客编辑</span>
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
        {/* Read-Only Overlay for Global Lock */}
        {isGlobalReadOnly && (
            <div className="bg-green-50 border-b border-green-200 text-green-800 px-4 py-2 text-xs flex items-center justify-center gap-2 font-bold z-30">
                <Lock className="w-3 h-3"/> 文档已达成共识并锁定，目前处于只读存档模式。
            </div>
        )}

        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-20 flex-shrink-0">
            <div className="flex items-center gap-4 min-w-0">
                {/* Status Dropdown */}
                <div className="relative group">
                    <button className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold transition-all ${getStatusColor(roomSettings.status)}`}>
                        {getStatusLabel(roomSettings.status)}
                        {role === 'OWNER' && <ChevronDown className="w-3 h-3 opacity-50"/>}
                    </button>
                    {role === 'OWNER' && (
                        <div className="absolute top-full left-0 mt-2 w-32 bg-white rounded-lg shadow-xl border border-gray-100 hidden group-hover:block p-1">
                            <button onClick={() => changeStatus('DRAFT')} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded text-gray-700">草稿阶段</button>
                            <button onClick={() => changeStatus('REVIEW')} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 rounded text-blue-700">评审中</button>
                            <button onClick={() => changeStatus('APPROVED')} className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 rounded text-green-700">已锁定</button>
                        </div>
                    )}
                </div>
                <h1 className="font-semibold text-gray-700 truncate">{DEMO_PROJECT_NAME}</h1>
            </div>

            <div className="flex items-center gap-3 whitespace-nowrap">
                {/* Export Button */}
                <button onClick={handleExport} className="flex items-center gap-2 text-gray-600 hover:text-aliyun text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:border-aliyun hover:bg-gray-50 transition-all">
                    <Download className="w-4 h-4" /> 导出 MD
                </button>

                <button onClick={copyRoomLink} className="flex items-center gap-2 text-gray-600 hover:text-aliyun text-sm px-3 py-1.5 rounded-lg border border-transparent hover:bg-gray-50">
                    <LinkIcon className="w-4 h-4" /> 邀请
                </button>
                <div className="h-6 w-px bg-gray-300 mx-1"></div>
                
                {role === 'OWNER' ? (
                     <button onClick={handleAIReview} disabled={isReviewing || isGlobalReadOnly} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all ${isReviewing || isGlobalReadOnly ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
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
                     {role === 'OWNER' && !isGlobalReadOnly && (
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
                        onMount={(editor) => editorRef.current = editor}
                        onInsertDecision={handleInsertDecision}
                    />
                    {/* Visual Overlay for Guest Read Only or Global Lock */}
                    {((role === 'GUEST' && !roomSettings.allowGuestEdit) || isGlobalReadOnly) && (
                        <div className="absolute top-2 right-4 pointer-events-none">
                            <div className="bg-slate-800/80 backdrop-blur text-white px-3 py-1 rounded-full text-xs shadow-lg flex items-center gap-2">
                                <Lock className="w-3 h-3"/> 只读模式
                            </div>
                        </div>
                    )}
                 </div>
            </div>

            {/* Knowledge Tab (Real KB) */}
            <div className={`flex-1 p-8 bg-gray-50 overflow-auto ${activeTab !== 'KNOWLEDGE' ? 'hidden' : ''}`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">企业级知识库 (RAG Context)</h2>
                        <p className="text-sm text-gray-500 mt-1">上传 PDF/Word/Markdown 规范文档，AI 评审时将自动引用。</p>
                    </div>
                    {role === 'OWNER' && !isGlobalReadOnly && (
                        <div>
                             <input type="file" multiple accept=".pdf,.docx,.doc,.md,.txt" ref={kbFileInputRef} onChange={handleKBUpload} className="hidden" />
                             <button 
                                onClick={() => kbFileInputRef.current?.click()}
                                disabled={isKBUploading}
                                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 shadow-sm"
                             >
                                {isKBUploading ? <div className="animate-spin w-4 h-4 border-2 border-aliyun border-t-transparent rounded-full"/> : <Plus className="w-4 h-4" />}
                                上传新文档
                             </button>
                        </div>
                    )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {kbFiles.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <Database className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                            <p>暂无知识库文档，请上传文件以增强 AI 评审能力。</p>
                        </div>
                    )}

                    {kbFiles.map((file) => (
                        <div key={file.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-3 relative group hover:border-aliyun/50 transition-all">
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex-shrink-0 flex items-center justify-center text-blue-500">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-gray-700 truncate text-sm" title={file.name}>{file.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-green-600 flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" /> 已索引
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                        {(file.size / 1024).toFixed(0)}KB
                                    </span>
                                </div>
                            </div>
                            {role === 'OWNER' && !isGlobalReadOnly && (
                                <button 
                                    onClick={() => handleDeleteKB(file.id)}
                                    className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
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
                                     <div className="text-gray-400 text-xs mb-2 pl-2 border-l-2 border-gray-200 italic truncate max-w-[250px] bg-gray-50 rounded select-all cursor-text">
                                        <Quote className="w-3 h-3 inline mr-1 text-gray-400"/>
                                        "{comment.originalText}"
                                     </div>
                                )}
                                <div className="text-gray-800 break-words">{comment.comment}</div>
                            </div>
                        ))}
                    </div>

                    {/* Manual Comment Input */}
                    {(role === 'OWNER' || roomSettings.allowGuestComment) && !isGlobalReadOnly ? (
                        <div className="p-3 bg-white border-t border-gray-200">
                            {quotedText && (
                                <div className="bg-gray-100 p-2 rounded mb-2 flex justify-between items-center text-xs">
                                    <div className="truncate max-w-[200px] italic text-gray-600">
                                        "{quotedText}"
                                    </div>
                                    <button onClick={() => setQuotedText('')} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3"/></button>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button 
                                    onClick={captureSelection} 
                                    className={`px-2 rounded border transition-colors ${quotedText ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                    title="引用选中的文本"
                                >
                                    <Quote className="w-4 h-4"/>
                                </button>
                                <input 
                                    type="text" 
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="输入评论..."
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
                            <Lock className="w-3 h-3 inline mr-1"/> {isGlobalReadOnly ? '文档已锁定' : '评论权限已关闭'}
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
