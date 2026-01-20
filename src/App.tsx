
import React, { useState, useEffect, useRef } from 'react';
import { Bot, FileText, Database, Share2, Link as LinkIcon, FileUp, MessageSquarePlus, Quote, X, Plus, CheckCircle, Trash2, Wand2, Loader2, Pencil, Check, RefreshCw, BrainCircuit, User } from 'lucide-react';
import PRDEditor from './components/Editor';
import DecisionWidget from './components/DecisionWidget';
import ImpactGraph from './components/ImpactGraph';
import { LandingPage } from './components/LandingPage';
import { LINGJING_PRD_CONTENT, DEMO_PROJECT_NAME, PRESET_KB_FILES } from './constants';
import { AIReviewComment, UserRole, RoomSettings, KBDocument, ProjectStatus, DecisionData, ImpactData } from './types';
import { parseFileToText } from './utils/fileParsing';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [view, setView] = useState<'LANDING' | 'WORKSPACE'>('LANDING');

  // Workspace State
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState<'EDITOR' | 'KNOWLEDGE' | 'IMPACT'>('EDITOR');
  const [comments, setComments] = useState<AIReviewComment[]>([]);
  const [kbFiles, setKbFiles] = useState<KBDocument[]>([]);
  const [decisions, setDecisions] = useState<{ [key: string]: DecisionData }>({});
  const [impactGraph, setImpactGraph] = useState<ImpactData>({ nodes: [], links: [] });
  
  const contentRef = useRef('');
  const lastEditedAtRef = useRef(0);
  const skipNextPollRef = useRef(false); 
  useEffect(() => { contentRef.current = content; }, [content]);

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
  
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isKBUploading, setIsKBUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingGraph, setIsGeneratingGraph] = useState(false);
  const editorRef = useRef<any>(null);
  
  const [decisionAnchors, setDecisionAnchors] = useState<string[]>([]);
  const [newComment, setNewComment] = useState('');
  const [quotedText, setQuotedText] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  const kbFileInputRef = useRef<HTMLInputElement>(null);

  // --- Real API Helper (ESA Backend) ---
  const callApi = async (url: string, options: RequestInit = {}): Promise<any> => {
      try {
          const res = await fetch(url, options);
          
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
              throw new Error("连接失败：后端返回了HTML。请确保 functions/index.js 已部署至 ESA，并且路由配置正确。");
          }

          const data = await res.json();
          if (!res.ok) {
              throw new Error(data.error || `HTTP Error ${res.status}`);
          }
          return data;
      } catch (e) {
          console.error("API Call Failed:", e);
          throw e;
      }
  };

  // --- 1. Init Logic ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoomId = params.get('room');

    if (urlRoomId) {
        setRoomId(urlRoomId);
        setView('WORKSPACE');
        initializeRoom(urlRoomId);
    }
  }, []);

  // --- 2. Dynamic Decision Parsing ---
  useEffect(() => {
    const regex = /\{\{DECISION:([^{}]+)\}\}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        matches.push(match[0]);
    }
    setDecisionAnchors([...new Set(matches)]);
  }, [content]);

  // --- Functions ---

  const initializeRoom = async (id: string, isCreate = false, initialSettings?: RoomSettings, isDemo = false) => {
      setLoadingRoom(true);
      
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
              
              // Seed Data Construction
              const initialContent = isDemo ? LINGJING_PRD_CONTENT : "";
              const initialKB = isDemo ? PRESET_KB_FILES : [];
              
              // Init Room on Server with Real Data
              try {
                  console.log("Initializing room on backend...");
                  await pushRoomUpdate(id, { 
                    content: initialContent,
                    comments: [],
                    kbFiles: initialKB, 
                    decisions: {},
                    impactGraph: { nodes: [], links: [] },
                    settings: settingsToUse
                  }, 'OWNER');
                  
                  // Optimistic Local Update
                  setContent(initialContent);
                  setKbFiles(initialKB);
                  
                  if (isDemo) {
                      setTimeout(() => {
                          alert("🎉 「灵境」演示项目加载成功！\n\n已为您自动上传了：\n1. PRD 需求文档 (含决策点)\n2. 3份技术规范知识库\n\n请尝试点击右上角「AI 深度评审」体验智能分析。");
                      }, 500);
                  }
              } catch (e) {
                  alert(`初始化项目失败: ${(e as Error).message}\n请检查您的网络或 ESA 部署状态。`);
              }
          }
      } else {
          setRole('GUEST');
      }
      
      await fetchState(id, true);
      setLoadingRoom(false);
  };

  const fetchState = async (id: string = roomId, force = false) => {
      if (!id) return;
      if (skipNextPollRef.current && !force) return;

      setIsSyncing(true);
      try {
          const data = await callApi(`/api/room/sync?roomId=${id}`);

          if (data.exists && data.state) {
              if (!data.state.settings.isActive) {
                  alert("房主已结束该协作房间。");
                  window.location.href = "/"; 
                  return;
              }
              const state = data.state;

              // 1. Content Sync
              const timeSinceEdit = Date.now() - lastEditedAtRef.current;
              if (state.content !== contentRef.current) {
                  if (force || timeSinceEdit > 5000) { // Avoid overwriting if user is actively typing
                      setContent(state.content);
                  }
              }

              // 2. Data Sync
              if (state.comments) setComments(state.comments);
              if (state.settings) setRoomSettings(state.settings);
              if (state.kbFiles) setKbFiles(state.kbFiles);
              if (state.decisions) setDecisions(state.decisions);
              if (state.impactGraph) setImpactGraph(state.impactGraph);
          }
      } catch (e) {
          console.error("Sync error:", e);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleCreateRoom = (settings: RoomSettings, isDemo = false) => {
      const newId = uuidv4().slice(0, 8);
      const newUrl = `${window.location.pathname}?room=${newId}`;
      window.history.pushState({}, '', newUrl);
      setRoomId(newId);
      setView('WORKSPACE');
      initializeRoom(newId, true, settings, isDemo);
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

  // --- Periodic Sync (Polling) ---
  useEffect(() => {
      if (view !== 'WORKSPACE' || !roomId) return;
      const interval = setInterval(() => fetchState(roomId), 3000); 
      return () => clearInterval(interval);
  }, [roomId, view]); 

  const pushRoomUpdate = async (rId: string, updates: any, uRole: string) => {
      setIsSaving(true);
      try {
          const data = await callApi('/api/room/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId: rId, updates, userRole: uRole })
          });
          
          if (data.success && data.state) {
              const state = data.state;
              skipNextPollRef.current = true; // Pause polling briefly to avoid jitter
              setTimeout(() => { skipNextPollRef.current = false; }, 2000);

              // Update local state if server returned newer/merged state
              if (state.content !== undefined && state.content !== content) setContent(state.content);
              if (state.comments) setComments(state.comments);
              if (state.decisions) setDecisions(state.decisions);
              if (state.kbFiles) setKbFiles(state.kbFiles);
              if (state.impactGraph) setImpactGraph(state.impactGraph);
              if (state.settings) setRoomSettings(state.settings);
          }
      } catch (e) {
          console.error("Save error", e);
          throw e; 
      } finally {
          setTimeout(() => setIsSaving(false), 500);
      }
  };

  const handleContentChange = (newVal: string | undefined) => {
      const val = newVal || '';
      setContent(val);
      lastEditedAtRef.current = Date.now();
      
      if (roomSettings.status === 'APPROVED') return;
      
      // Auto-save debounce
      const timeoutId = setTimeout(() => {
         if (role === 'OWNER' || roomSettings.allowGuestEdit) {
             pushRoomUpdate(roomId, { content: val }, role).catch(console.error);
         }
      }, 1000);
      return () => clearTimeout(timeoutId);
  };

  const handleVote = async (index: number, question: string, options: string[]) => {
      const anchorKey = question.trim();
      try {
          const data = await callApi('/api/vote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId, anchorKey, optionIndex: index, question, options })
          });
          
          if (data.success) {
              setDecisions(prev => ({ ...prev, [anchorKey]: data.decision }));
              // Force sync to get updated AI summary if available
              setTimeout(() => fetchState(roomId, true), 500);
          }
      } catch (e) {
          alert(`投票失败: ${(e as Error).message}`);
      }
  };

  const handleAIReview = async () => {
    if (role !== 'OWNER') return alert("仅房主可调用 AI");
    setIsReviewing(true);
    try {
      // Send content AND knowledge base files to the backend for RAG
      const data = await callApi('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prdContent: content, kbFiles: kbFiles })
      });
      
      if (data.comments) {
          const newComments = data.comments.map((c: any) => ({
              ...c, 
              id: uuidv4(), 
              author: c.position === '系统错误' ? '⚠️ 系统' : 'AI 评审副驾', 
              timestamp: Date.now()
          }));
          
          // Push new comments to server so everyone sees them
          await pushRoomUpdate(roomId, { newComments: newComments }, role);
          setActiveTab('EDITOR');
      }
    } catch (error) {
      alert(`AI 评审失败: ${(error as Error).message}`);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleGenerateGraph = async () => {
      if (role !== 'OWNER') return alert("仅房主可操作");
      setIsGeneratingGraph(true);
      try {
          const data = await callApi('/api/impact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prdContent: content })
          });
          
          if (data.impactGraph) {
              setImpactGraph(data.impactGraph);
              await pushRoomUpdate(roomId, { impactGraph: data.impactGraph }, role);
          }
      } catch (e) {
          alert("图谱生成失败: " + (e as Error).message);
      } finally {
          setIsGeneratingGraph(false);
      }
  };

  const handleAddManualNode = () => {
      if (!newNodeName.trim()) return;
      const newNode = { id: newNodeName, group: 1, val: 10 };
      if (impactGraph.nodes.find(n => n.id === newNode.id)) return;
      const newGraph = { nodes: [...impactGraph.nodes, newNode], links: [...impactGraph.links] };
      setImpactGraph(newGraph);
      setNewNodeName('');
      pushRoomUpdate(roomId, { impactGraph: newGraph }, role);
  };

  const handleDeleteNode = (nodeId: string) => {
      if (role !== 'OWNER') return; 
      const newNodes = impactGraph.nodes.filter(n => n.id !== nodeId);
      const newLinks = impactGraph.links.filter(l => l.source !== nodeId && l.target !== nodeId);
      const newGraph = { nodes: newNodes, links: newLinks };
      setImpactGraph(newGraph);
      pushRoomUpdate(roomId, { impactGraph: newGraph }, role);
  };

  const handleKBUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (role !== 'OWNER') return alert("仅房主可上传");
      const files = event.target.files;
      if (!files || files.length === 0) return;
      setIsKBUploading(true);
      const newDocs: KBDocument[] = [];
      try {
          for (let i = 0; i < files.length; i++) {
              const text = await parseFileToText(files[i]);
              newDocs.push({ id: uuidv4(), name: files[i].name, content: text, size: files[i].size, uploadedAt: Date.now() });
          }
          const updatedKB = [...kbFiles, ...newDocs];
          setKbFiles(updatedKB);
          await pushRoomUpdate(roomId, { kbFiles: updatedKB }, role);
      } catch (err) { alert("文件解析失败: " + err); } finally { setIsKBUploading(false); }
  };

  const changeStatus = async (newStatus: ProjectStatus) => {
      if (role !== 'OWNER') return;
      const newSettings = { ...roomSettings, status: newStatus };
      setRoomSettings(newSettings);
      await pushRoomUpdate(roomId, { settings: newSettings }, role);
  };

  const handleInsertDecision = () => {
      if (roomSettings.status === 'APPROVED') return alert("文档已锁定");
      const input = prompt("请输入决策配置\n格式: 问题 | 选项A | 选项B");
      if (!input) return;
      const anchor = `{{DECISION: ${input}}}`;
      if (editorRef.current) {
          const selection = editorRef.current.getSelection();
          const op = {identifier: {major:1, minor:1}, range: selection, text: anchor, forceMoveMarkers: true};
          editorRef.current.executeEdits("my-source", [op]);
      }
  };

  const handleManualComment = () => {
      if (!newComment.trim()) return;
      const comment: AIReviewComment = {
          id: uuidv4(), type: 'HUMAN', severity: 'INFO', position: quotedText ? '引用' : '通用',
          originalText: quotedText || '用户评论', comment: newComment, author: username || '匿名',
          timestamp: Date.now()
      };
      // Optimistic update
      const newCommentsList = [...comments, comment];
      setComments(newCommentsList);
      setNewComment('');
      setQuotedText('');
      pushRoomUpdate(roomId, { newComment: comment }, role).catch(() => {
          alert("评论发送失败");
      });
  };

  const captureSelection = () => {
      if (editorRef.current) {
          const val = editorRef.current.getModel().getValueInRange(editorRef.current.getSelection());
          if (val) setQuotedText(val);
      }
  };

  const formatRelativeTime = (timestamp?: number) => {
      if (!timestamp) return '';
      const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (diff < 60) return '刚刚';
      if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
      return new Date(timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  };

  const handleDeleteComment = (commentId: string) => {
     const comment = comments.find(c => c.id === commentId);
     if (!comment) return;
     if (comment.type !== 'HUMAN' && role !== 'OWNER') return;
     if (!confirm("删除此评论？")) return;
     const updated = comments.filter(c => c.id !== commentId);
     setComments(updated);
     pushRoomUpdate(roomId, { comments: updated }, role);
  };

  const startEditingComment = (comment: AIReviewComment) => {
      setEditingCommentId(comment.id);
      setEditCommentText(comment.comment);
  };

  const saveEditedComment = (commentId: string) => {
      if (!editCommentText.trim()) return;
      const updated = comments.map(c => c.id === commentId ? { ...c, comment: editCommentText, lastUpdated: Date.now() } : c);
      setComments(updated);
      pushRoomUpdate(roomId, { comments: updated }, role);
      setEditingCommentId(null);
  };

  if (view === 'LANDING') return <LandingPage onCreate={handleCreateRoom} onJoin={handleJoinRoom} />;

  if (loadingRoom) {
      return (
          <div className="flex h-screen items-center justify-center bg-gray-50 flex-col gap-4">
              <div className="w-12 h-12 border-4 border-aliyun border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 font-medium">正在连接 ESA 边缘节点...</p>
          </div>
      );
  }

  const isGlobalReadOnly = roomSettings.status === 'APPROVED';

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 relative">
      {/* Name Modal */}
      {showNameModal && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                  <h3 className="text-lg font-bold mb-4">设置昵称</h3>
                  <input type="text" placeholder="您的昵称" className="w-full border rounded px-4 py-2 mb-4" onKeyDown={(e) => e.key === 'Enter' && handleSetUsername((e.target as HTMLInputElement).value)} />
                  <button onClick={(e) => handleSetUsername((e.currentTarget.previousElementSibling as HTMLInputElement).value)} className="w-full bg-aliyun text-white py-2 rounded font-bold">进入</button>
              </div>
          </div>
      )}

      <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 flex-shrink-0">
         <div className="p-4 flex items-center gap-2 border-b border-slate-800 cursor-pointer" onClick={() => window.location.href="/"}>
            <div className="w-8 h-8 bg-aliyun rounded-lg flex items-center justify-center"><Bot className="w-5 h-5"/></div>
            <span className="font-bold text-lg">PRD-Agents</span>
         </div>
         <div className="p-4 bg-slate-800/50">
            <div className="flex justify-between mb-2"><span className="text-xs text-slate-400 font-bold">身份</span><span className="text-[10px] bg-slate-600 px-2 rounded-full">{role === 'OWNER' ? '房主' : '访客'}</span></div>
            <div className="text-xs text-slate-300 mb-2 truncate">👤 {username}</div>
            <div className="flex items-center gap-2 mt-2">
                 <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}></div>
                 <span className="text-xs text-slate-400">{isSyncing ? '同步中...' : '已连接'}</span>
            </div>
         </div>
         <nav className="flex-1 p-4 space-y-2">
            <button onClick={() => setActiveTab('EDITOR')} className={`w-full flex gap-3 px-3 py-2 rounded text-sm ${activeTab === 'EDITOR' ? 'bg-aliyun' : 'hover:bg-slate-800 text-slate-400'}`}><FileText className="w-4 h-4"/> PRD 编辑器</button>
            <button onClick={() => setActiveTab('KNOWLEDGE')} className={`w-full flex gap-3 px-3 py-2 rounded text-sm ${activeTab === 'KNOWLEDGE' ? 'bg-aliyun' : 'hover:bg-slate-800 text-slate-400'}`}><Database className="w-4 h-4"/> 知识库</button>
            <button onClick={() => setActiveTab('IMPACT')} className={`w-full flex gap-3 px-3 py-2 rounded text-sm ${activeTab === 'IMPACT' ? 'bg-aliyun' : 'hover:bg-slate-800 text-slate-400'}`}><Share2 className="w-4 h-4"/> 影响面分析</button>
         </nav>
         
         {role === 'OWNER' && (
             <div className="p-4 border-t border-slate-800 space-y-2">
                 <p className="text-xs font-bold text-slate-500 mb-2">项目状态</p>
                 <div className="grid grid-cols-3 gap-1 bg-slate-800 p-1 rounded-lg">
                     {['DRAFT', 'REVIEW', 'APPROVED'].map((s) => (
                         <button 
                            key={s} 
                            onClick={() => changeStatus(s as ProjectStatus)}
                            className={`text-[10px] py-1 rounded ${roomSettings.status === s ? 'bg-aliyun text-white' : 'text-slate-400 hover:text-white'}`}
                         >
                             {s === 'DRAFT' ? '草稿' : s === 'REVIEW' ? '评审' : '锁定'}
                         </button>
                     ))}
                 </div>
             </div>
         )}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden w-0 relative">
        {isGlobalReadOnly && <div className="bg-green-50 border-b border-green-200 text-green-800 px-4 py-2 text-xs text-center font-bold">🔒 文档已锁定 (APPROVED)</div>}
        
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
                <h1 className="font-bold text-gray-800 truncate" title={DEMO_PROJECT_NAME}>{DEMO_PROJECT_NAME}</h1>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-mono">ID: {roomId}</span>
                {isSaving && <span className="text-xs text-gray-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Saving...</span>}
            </div>
            <div className="flex items-center gap-3">
                 <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-transparent hover:bg-gray-50" onClick={() => {
                     navigator.clipboard.writeText(window.location.href);
                     alert("链接已复制，发给团队成员即可加入！");
                 }}>
                    <LinkIcon className="w-4 h-4" /> <span className="hidden sm:inline">邀请成员</span>
                 </button>
                 {role === 'OWNER' && (
                     <button 
                        onClick={handleAIReview} 
                        disabled={isReviewing}
                        className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm px-4 py-1.5 rounded-lg font-bold shadow-lg shadow-slate-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                     >
                        {isReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        {isReviewing ? 'DeepSeek 思考中...' : 'AI 深度评审'}
                     </button>
                 )}
            </div>
        </header>

        <div className="flex-1 overflow-hidden flex relative">
            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ${activeTab === 'EDITOR' ? 'mr-80' : ''}`}>
                
                {/* EDITOR TAB */}
                <div className={`flex-1 p-6 h-full overflow-hidden ${activeTab === 'EDITOR' ? 'block' : 'hidden'}`}>
                    <PRDEditor 
                        value={content} 
                        onChange={handleContentChange}
                        onMount={(editor) => { editorRef.current = editor; editor.onDidChangeCursorSelection(captureSelection); }}
                        onInsertDecision={handleInsertDecision}
                    />
                </div>

                {/* KNOWLEDGE TAB */}
                <div className={`flex-1 p-6 h-full overflow-auto ${activeTab === 'KNOWLEDGE' ? 'block' : 'hidden'}`}>
                    <div className="max-w-4xl mx-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2"><Database className="w-5 h-5"/> 关联知识库</h2>
                            {role === 'OWNER' && (
                                <label className="flex items-center gap-2 bg-white border border-gray-300 px-4 py-2 rounded-lg cursor-pointer hover:bg-gray-50 shadow-sm transition-colors">
                                    {isKBUploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileUp className="w-4 h-4"/>}
                                    <span className="text-sm font-bold">上传文档 (PDF/Word/MD)</span>
                                    <input type="file" ref={kbFileInputRef} className="hidden" multiple accept=".md,.txt,.pdf,.docx" onChange={handleKBUpload} disabled={isKBUploading} />
                                </label>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {kbFiles.map(file => (
                                <div key={file.id} className="bg-white p-4 rounded-xl border border-gray-200 hover:border-aliyun/50 transition-colors shadow-sm group">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-aliyun">
                                                <FileText className="w-5 h-5"/>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-800 text-sm">{file.name}</h4>
                                                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB • {new Date(file.uploadedAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        {role === 'OWNER' && <button className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4"/></button>}
                                    </div>
                                    <div className="mt-3 text-xs text-gray-500 line-clamp-2 bg-gray-50 p-2 rounded">
                                        {file.content.substring(0, 150)}...
                                    </div>
                                </div>
                            ))}
                            {kbFiles.length === 0 && (
                                <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                    <Database className="w-12 h-12 text-gray-300 mx-auto mb-3"/>
                                    <p className="text-gray-500">暂无知识库文件，请上传以增强 AI 评审能力</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* IMPACT TAB */}
                <div className={`flex-1 p-6 h-full overflow-auto ${activeTab === 'IMPACT' ? 'block' : 'hidden'}`}>
                    <div className="max-w-5xl mx-auto h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2"><Share2 className="w-5 h-5"/> 影响面分析图谱</h2>
                                <p className="text-sm text-gray-500 mt-1">可视化 PRD 变更对现有架构模块的影响</p>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2">
                                    <input 
                                        type="text" 
                                        placeholder="添加节点..." 
                                        className="text-sm outline-none py-2 w-32"
                                        value={newNodeName}
                                        onChange={e => setNewNodeName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddManualNode()}
                                    />
                                    <button onClick={handleAddManualNode} className="text-gray-500 hover:text-aliyun"><Plus className="w-4 h-4"/></button>
                                </div>
                                {role === 'OWNER' && (
                                    <button 
                                        onClick={handleGenerateGraph} 
                                        disabled={isGeneratingGraph}
                                        className="flex items-center gap-2 bg-aliyun hover:bg-aliyun-dark text-white text-sm px-4 py-2 rounded-lg font-bold shadow-md transition-all disabled:opacity-70"
                                    >
                                        {isGeneratingGraph ? <Loader2 className="w-4 h-4 animate-spin"/> : <Bot className="w-4 h-4"/>}
                                        AI 自动构建
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-1 relative">
                             <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur p-2 rounded-lg border border-gray-200 text-xs space-y-1 shadow-sm">
                                 <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#FF6A00]"></div><span>功能模块</span></div>
                                 <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div><span>微服务/API</span></div>
                                 <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#10b981]"></div><span>数据库/基建</span></div>
                             </div>
                             <ImpactGraph data={impactGraph} onDeleteNode={handleDeleteNode} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar (Comments & Decisions) */}
            <div className={`w-80 bg-white border-l border-gray-200 flex flex-col absolute right-0 top-0 bottom-0 shadow-xl transform transition-transform duration-300 z-20 ${activeTab === 'EDITOR' ? 'translate-x-0' : 'translate-x-full'}`}>
                
                {/* Decision Widgets Section */}
                {decisionAnchors.length > 0 && (
                    <div className="p-4 bg-orange-50 border-b border-orange-100 max-h-[40%] overflow-y-auto custom-scrollbar">
                        <div className="flex items-center gap-2 mb-3 text-orange-800 font-bold text-xs uppercase tracking-wider">
                            <BrainCircuit className="w-3.5 h-3.5"/> 待决策项 ({decisionAnchors.length})
                        </div>
                        {decisionAnchors.map((anchor, idx) => {
                            const content = anchor.replace('{{DECISION:', '').replace('}}', '').trim();
                            const parts = content.split('|').map(s => s.trim());
                            const questionKey = parts[0];
                            
                            return (
                                <DecisionWidget 
                                    key={idx} 
                                    rawAnchor={anchor} 
                                    serverData={decisions[questionKey]}
                                    onVote={handleVote}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Review Comments Section */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-2 font-bold text-gray-700 text-sm">
                             <MessageSquarePlus className="w-4 h-4"/> 评审意见 ({comments.length})
                        </div>
                        {(role === 'OWNER' || roomSettings.allowGuestComment) && !isGlobalReadOnly && (
                            <button 
                                onClick={() => setQuotedText('')} 
                                className="text-xs text-gray-400 hover:text-aliyun flex items-center gap-1"
                                title="清除引用"
                            >
                                {quotedText && <span className="text-aliyun font-bold bg-orange-100 px-1 rounded">引用中</span>}
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                        {comments.length === 0 && (
                            <div className="text-center py-10 text-gray-400 text-sm">
                                <Bot className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                                <p>暂无评论</p>
                                <p className="text-xs mt-1">选中文字可引用讨论，或点击上方 "AI 深度评审"</p>
                            </div>
                        )}
                        
                        {comments.map((comment) => (
                            <div key={comment.id} className={`p-3 rounded-lg border text-sm group ${comment.type === 'HUMAN' ? 'bg-white border-gray-200' : 'bg-gradient-to-br from-blue-50 to-white border-blue-100'}`}>
                                <div className="flex justify-between items-start mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-bold text-xs ${comment.type === 'HUMAN' ? 'text-gray-700' : 'text-blue-600'}`}>
                                            {comment.author}
                                        </span>
                                        <span className="text-[10px] text-gray-400">{formatRelativeTime(comment.timestamp)}</span>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {(comment.author === username || role === 'OWNER') && (
                                            <>
                                                {comment.type === 'HUMAN' && <button onClick={() => startEditingComment(comment)} className="text-gray-400 hover:text-aliyun"><Pencil className="w-3 h-3"/></button>}
                                                <button onClick={() => handleDeleteComment(comment.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {editingCommentId === comment.id ? (
                                    <div className="space-y-2">
                                        <textarea 
                                            value={editCommentText}
                                            onChange={(e) => setEditCommentText(e.target.value)}
                                            className="w-full text-sm p-2 border rounded focus:border-aliyun focus:outline-none"
                                            rows={2}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setEditingCommentId(null)} className="text-xs text-gray-500">取消</button>
                                            <button onClick={() => saveEditedComment(comment.id)} className="text-xs bg-aliyun text-white px-2 py-1 rounded">保存</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {comment.position && comment.position !== '通用' && comment.position !== '引用' && (
                                            <div className="text-[10px] text-gray-500 bg-gray-100 inline-block px-1.5 py-0.5 rounded mb-1">
                                                📍 {comment.position}
                                            </div>
                                        )}
                                        {comment.originalText && comment.originalText !== '用户评论' && (
                                            <div className="mb-2 pl-2 border-l-2 border-gray-300 text-xs text-gray-500 italic truncate" title={comment.originalText}>
                                                "{comment.originalText}"
                                            </div>
                                        )}
                                        <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                                            {comment.severity === 'BLOCKER' && <span className="text-red-500 font-bold mr-1">!</span>}
                                            {comment.comment}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Comment Input */}
                    {(role === 'OWNER' || roomSettings.allowGuestComment) && !isGlobalReadOnly && (
                        <div className="p-3 bg-white border-t border-gray-200">
                             {quotedText && (
                                <div className="flex items-center justify-between bg-orange-50 px-2 py-1 rounded mb-2 text-xs border border-orange-100 text-orange-800">
                                    <span className="truncate max-w-[200px] flex items-center gap-1"><Quote className="w-3 h-3"/> {quotedText}</span>
                                    <button onClick={() => setQuotedText('')} className="hover:text-red-500"><X className="w-3 h-3"/></button>
                                </div>
                             )}
                             <div className="relative">
                                 <textarea
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleManualComment();
                                        }
                                    }}
                                    placeholder={quotedText ? "针对引用内容发表评论..." : "输入评论 (Enter 发送)..."}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 pr-10 text-sm focus:outline-none focus:border-aliyun resize-none"
                                    rows={2}
                                 />
                                 <button 
                                    onClick={handleManualComment}
                                    disabled={!newComment.trim()}
                                    className="absolute right-2 bottom-2 text-aliyun disabled:opacity-30 hover:bg-orange-50 p-1 rounded transition-colors"
                                 >
                                     <MessageSquarePlus className="w-5 h-5" />
                                 </button>
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}

export default App;
