
import React, { useState, useEffect, useRef } from 'react';
import { Bot, FileText, Database, Share2, Link as LinkIcon, Users, FileUp, User, MessageSquarePlus, Lock, Unlock, LogOut, Settings, Quote, X, Plus, CheckCircle, Trash2, Download, ChevronDown, Network, Wand2, Loader2, Pencil, Check, RefreshCw } from 'lucide-react';
import PRDEditor from './components/Editor';
import DecisionWidget from './components/DecisionWidget';
import ImpactGraph from './components/ImpactGraph';
import { LandingPage } from './components/LandingPage';
import { LINGJING_PRD_CONTENT, DEMO_PROJECT_NAME } from './constants';
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
  
  // Refs for State Consistency
  const contentRef = useRef('');
  const lastEditedAtRef = useRef(0);
  const skipNextPollRef = useRef(false); // Optimization: Skip poll after immediate update
  useEffect(() => { contentRef.current = content; }, [content]);

  // Room & Identity
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
  
  // UI Flags
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isKBUploading, setIsKBUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingGraph, setIsGeneratingGraph] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<any>(null);
  
  // Inputs
  const [decisionAnchors, setDecisionAnchors] = useState<string[]>([]);
  const [newComment, setNewComment] = useState('');
  const [quotedText, setQuotedText] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  
  // Comment Editing State
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

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

  const initializeRoom = async (id: string, isCreate = false, initialSettings?: RoomSettings) => {
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
              await pushRoomUpdate(id, { 
                content: LINGJING_PRD_CONTENT,
                comments: [],
                kbFiles: [], 
                decisions: {},
                impactGraph: { nodes: [], links: [] },
                settings: settingsToUse
              }, 'OWNER');
              setContent(LINGJING_PRD_CONTENT);
          }
      } else {
          setRole('GUEST');
      }
      
      await fetchState(id, true);
      setLoadingRoom(false);
  };

  const fetchState = async (id: string = roomId, force = false) => {
      if (!id) return;

      // Optimization: Skip poll if we just pushed an update to prevent stale read
      if (skipNextPollRef.current && !force) {
          // If a minute has passed since the skip was set, force reset it just in case
          // But usually the timeout in pushRoomUpdate handles this.
          return;
      }

      setIsSyncing(true);
      try {
          const res = await fetch(`/api/room/sync?roomId=${id}`);
          const data = await res.json();

          if (data.exists && data.state) {
              if (!data.state.settings.isActive) {
                  alert("房主已结束该协作房间。");
                  window.location.href = "/"; 
                  return;
              }
              
              const state = data.state;

              // 1. Content Sync: only if user is idle or force sync
              const timeSinceEdit = Date.now() - lastEditedAtRef.current;
              if (state.content !== contentRef.current) {
                  if (force || timeSinceEdit > 5000) {
                      setContent(state.content);
                  }
              }

              // 2. Data Sync: Always update these to ensure real-time feel for votes/comments
              // We compare JSON string to avoid unnecessary re-renders if possible, but React handles that mostly.
              if (state.comments) setComments(state.comments);
              if (state.settings) setRoomSettings(state.settings);
              if (state.kbFiles) setKbFiles(state.kbFiles);
              if (state.decisions) setDecisions(state.decisions);
              if (state.impactGraph) setImpactGraph(state.impactGraph);
          }
      } catch (e) {
          console.error("Sync error", e);
      } finally {
          setIsSyncing(false);
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

  // --- Periodic Sync ---
  useEffect(() => {
      if (view !== 'WORKSPACE' || !roomId) return;
      // Poll every 1.5s for better "real-time" feel
      const interval = setInterval(() => fetchState(roomId), 1500); 
      return () => clearInterval(interval);
  }, [roomId, view]); 

  const pushRoomUpdate = async (rId: string, updates: any, uRole: string) => {
      setIsSaving(true);
      try {
          const res = await fetch('/api/room/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId: rId, updates, userRole: uRole })
          });
          
          const data = await res.json();
          if (data.success && data.state) {
              // Immediate sync from write response
              const state = data.state;
              
              // Skip next polling to prevent jitter
              skipNextPollRef.current = true;
              // Reset flag after 2 seconds (covering standard poll interval)
              setTimeout(() => { skipNextPollRef.current = false; }, 2000);

              // Update local state with authoritative server state
              if (state.content !== undefined && state.content !== content) setContent(state.content);
              if (state.comments) setComments(state.comments);
              if (state.decisions) setDecisions(state.decisions);
              if (state.kbFiles) setKbFiles(state.kbFiles);
              if (state.impactGraph) setImpactGraph(state.impactGraph);
              if (state.settings) setRoomSettings(state.settings);
          }
      } catch (e) {
          console.error("Push update failed", e);
      } finally {
          setTimeout(() => setIsSaving(false), 500);
      }
  };

  const handleContentChange = (newVal: string | undefined) => {
      const val = newVal || '';
      setContent(val);
      lastEditedAtRef.current = Date.now();
      
      if (roomSettings.status === 'APPROVED') return;
      if (role === 'OWNER' || roomSettings.allowGuestEdit) {
           pushRoomUpdate(roomId, { content: val }, role);
      }
  };

  // --- Voting Logic ---
  const handleVote = async (index: number, question: string, options: string[]) => {
      const anchorKey = question.trim();
      try {
          const res = await fetch('/api/vote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId, anchorKey, optionIndex: index, question, options })
          });
          const data = await res.json();
          if (data.success) {
              // Optimistic update
              setDecisions(prev => ({ ...prev, [anchorKey]: data.decision }));
              // Force sync immediately to confirm
              setTimeout(() => fetchState(roomId, true), 100);
          } else {
             alert("投票失败: " + data.error);
          }
      } catch (e) {
          console.error("Vote network failed", e);
          alert("网络错误");
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
        body: JSON.stringify({ prdContent: content, kbFiles: kbFiles })
      });
      const data = await res.json();
      const newComments = data.comments.map((c: any) => ({
          ...c, id: uuidv4(), author: 'AI 评审副驾', timestamp: Date.now()
      }));
      
      // Optimistic update (for immediate feedback)
      const merged = [...comments, ...newComments];
      setComments(merged);
      
      // Use atomic append
      pushRoomUpdate(roomId, { newComments: newComments }, role);
      
      setActiveTab('EDITOR');
    } catch (error) {
      alert("AI 服务繁忙，请稍后重试");
    } finally {
      setIsReviewing(false);
    }
  };

  // --- Impact Graph Logic ---
  const handleGenerateGraph = async () => {
      if (role !== 'OWNER') return alert("仅房主可操作");
      setIsGeneratingGraph(true);
      try {
          const res = await fetch('/api/impact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prdContent: content })
          });
          const data = await res.json();
          if (data.impactGraph) {
              setImpactGraph(data.impactGraph);
              pushRoomUpdate(roomId, { impactGraph: data.impactGraph }, role);
          } else if (data.error) {
              alert("分析失败: " + data.error);
          }
      } catch (e) {
          alert("生成图谱失败");
      } finally {
          setIsGeneratingGraph(false);
      }
  };

  const handleAddManualNode = () => {
      if (!newNodeName.trim()) return;
      const newNode = { id: newNodeName, group: 1, val: 10 };
      if (impactGraph.nodes.find(n => n.id === newNode.id)) return;
      
      const newGraph = {
          nodes: [...impactGraph.nodes, newNode],
          links: [...impactGraph.links]
      };
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

  // --- KB Upload ---
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
          pushRoomUpdate(roomId, { kbFiles: updatedKB }, role);
      } catch (err) { alert("文件解析失败"); } finally { setIsKBUploading(false); }
  };

  // --- Misc Helpers ---
  const changeStatus = async (newStatus: ProjectStatus) => {
      if (role !== 'OWNER') return;
      const newSettings = { ...roomSettings, status: newStatus };
      setRoomSettings(newSettings);
      await pushRoomUpdate(roomId, { settings: newSettings }, role);
  };
  
  const handleInsertDecision = () => {
      if (roomSettings.status === 'APPROVED') return alert("文档已锁定");
      const input = prompt("请输入决策配置\n格式: 问题 | 选项A | 选项B\n示例: 部署方案? | 云端 | 本地");
      if (!input) return;
      
      const anchor = `{{DECISION: ${input}}}`;
      if (editorRef.current) {
          const selection = editorRef.current.getSelection();
          const op = {identifier: {major:1, minor:1}, range: selection, text: anchor, forceMoveMarkers: true};
          editorRef.current.executeEdits("my-source", [op]);
      }
  };

  // --- Comment Management ---

  const handleManualComment = () => {
      if (!newComment.trim()) return;
      const comment: AIReviewComment = {
          id: uuidv4(), type: 'HUMAN', severity: 'INFO', position: quotedText ? 'Contextual' : 'General',
          originalText: quotedText || 'User Comment', comment: newComment, author: username || (role === 'OWNER' ? '房主' : '匿名用户'),
          timestamp: Date.now()
      };
      
      // Optimistic update
      const updated = [...comments, comment];
      setComments(updated);
      setNewComment('');
      setQuotedText('');
      
      // Use Atomic Append
      pushRoomUpdate(roomId, { newComment: comment }, role);
  };

  const captureSelection = () => {
      if (editorRef.current) {
          const val = editorRef.current.getModel().getValueInRange(editorRef.current.getSelection());
          if (val) setQuotedText(val);
      }
  };

  const formatRelativeTime = (timestamp?: number) => {
      if (!timestamp) return '未知时间';
      const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (diff < 60) return '刚刚';
      if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
      return new Date(timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  };

  const handleDeleteComment = (commentId: string) => {
      const comment = comments.find(c => c.id === commentId);
      if (!comment) return;
      
      // Strict frontend guard
      const isOwner = role === 'OWNER';
      const isAuthor = comment.author === (username || (isOwner ? '房主' : '匿名用户'));
      if (comment.type !== 'HUMAN' && !isOwner) return; 
      if (comment.type !== 'HUMAN') return; 
      if (!isOwner && !isAuthor) return;

      if (!confirm("确定删除此评论？")) return;
      const updatedComments = comments.filter(c => c.id !== commentId);
      setComments(updatedComments);
      pushRoomUpdate(roomId, { comments: updatedComments }, role);
  };

  const startEditingComment = (comment: AIReviewComment) => {
      setEditingCommentId(comment.id);
      setEditCommentText(comment.comment);
  };

  const saveEditedComment = (commentId: string) => {
      const comment = comments.find(c => c.id === commentId);
      if (!comment) return;

      const isOwner = role === 'OWNER';
      const isAuthor = comment.author === (username || (isOwner ? '房主' : '匿名用户'));
      if (comment.type !== 'HUMAN') return;
      if (!isAuthor) return; 

      if (!editCommentText.trim()) return;
      const updatedComments = comments.map(c => {
          if (c.id === commentId) {
              return { ...c, comment: editCommentText, lastUpdated: Date.now() };
          }
          return c;
      });
      setComments(updatedComments);
      pushRoomUpdate(roomId, { comments: updatedComments }, role);
      setEditingCommentId(null);
      setEditCommentText('');
  };

  const cancelEditComment = () => {
      setEditingCommentId(null);
      setEditCommentText('');
  };

  if (view === 'LANDING') return <LandingPage onCreate={handleCreateRoom} onJoin={handleJoinRoom} />;

  if (loadingRoom) {
      return (
          <div className="flex h-screen items-center justify-center bg-gray-50 flex-col gap-4">
              <div className="w-12 h-12 border-4 border-aliyun border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 font-medium">正在进入协作空间...</p>
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

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 flex-shrink-0">
         <div className="p-4 flex items-center gap-2 border-b border-slate-800 cursor-pointer" onClick={() => window.location.href="/"}>
            <div className="w-8 h-8 bg-aliyun rounded-lg flex items-center justify-center"><Bot className="w-5 h-5"/></div>
            <span className="font-bold text-lg">PRD-Agents</span>
         </div>
         <div className="p-4 bg-slate-800/50">
            <div className="flex justify-between mb-2"><span className="text-xs text-slate-400 font-bold">身份</span><span className="text-[10px] bg-slate-600 px-2 rounded-full">{role === 'OWNER' ? '房主' : '访客'}</span></div>
            <div className="text-xs text-slate-300 mb-2 truncate">👤 {username}</div>
         </div>
         <nav className="flex-1 p-4 space-y-2">
            <button onClick={() => setActiveTab('EDITOR')} className={`w-full flex gap-3 px-3 py-2 rounded text-sm ${activeTab === 'EDITOR' ? 'bg-aliyun' : 'hover:bg-slate-800 text-slate-400'}`}><FileText className="w-4 h-4"/> PRD 编辑器</button>
            <button onClick={() => setActiveTab('KNOWLEDGE')} className={`w-full flex gap-3 px-3 py-2 rounded text-sm ${activeTab === 'KNOWLEDGE' ? 'bg-aliyun' : 'hover:bg-slate-800 text-slate-400'}`}><Database className="w-4 h-4"/> 知识库</button>
            <button onClick={() => setActiveTab('IMPACT')} className={`w-full flex gap-3 px-3 py-2 rounded text-sm ${activeTab === 'IMPACT' ? 'bg-aliyun' : 'hover:bg-slate-800 text-slate-400'}`}><Share2 className="w-4 h-4"/> 影响面分析</button>
         </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden w-0 relative">
        {isGlobalReadOnly && <div className="bg-green-50 border-b border-green-200 text-green-800 px-4 py-2 text-xs text-center font-bold">🔒 文档已锁定</div>}
        
        <header className="h-14 bg-white border-b flex items-center justify-between px-6 shadow-sm z-20">
            <div className="flex items-center gap-4">
                <div className="relative group">
                    <button className="flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold bg-gray-100">{roomSettings.status === 'DRAFT' ? '草稿' : roomSettings.status === 'REVIEW' ? '评审中' : '已锁定'}</button>
                    {role === 'OWNER' && (
                        <div className="absolute top-full left-0 mt-2 w-32 bg-white rounded shadow-xl border hidden group-hover:block p-1">
                            {['DRAFT', 'REVIEW', 'APPROVED'].map(s => <button key={s} onClick={() => changeStatus(s as ProjectStatus)} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">{s}</button>)}
                        </div>
                    )}
                </div>
                <h1 className="font-semibold text-gray-700 truncate">{DEMO_PROJECT_NAME}</h1>
            </div>
            
            {/* Sync Status Indicator */}
            <div className="flex items-center gap-4">
                 <div className="flex items-center gap-1.5 text-xs font-medium">
                    {isSaving || isSyncing ? (
                        <>
                            <RefreshCw className="w-3 h-3 animate-spin text-aliyun" />
                            <span className="text-gray-500">同步中...</span>
                        </>
                    ) : (
                        <>
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span className="text-gray-400">已同步</span>
                        </>
                    )}
                 </div>

                 <div className="h-4 w-px bg-gray-200"></div>

                 <div className="flex gap-3">
                     <button onClick={() => {navigator.clipboard.writeText(window.location.href); alert("Copied!")}} className="flex items-center gap-2 text-gray-600 hover:text-aliyun text-sm"><LinkIcon className="w-4 h-4"/> 邀请</button>
                     {role === 'OWNER' && <button onClick={handleAIReview} disabled={isReviewing} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium">{isReviewing ? 'AI 思考中...' : 'AI 评审'}</button>}
                </div>
            </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
            {/* EDITOR */}
            <div className={`flex-1 flex flex-col bg-white ${activeTab !== 'EDITOR' ? 'hidden' : ''}`}>
                 <div className="h-10 border-b bg-gray-50 flex items-center px-4 justify-between">
                     <span className="text-xs text-gray-400 font-bold">MARKDOWN</span>
                     {role === 'OWNER' && !isGlobalReadOnly && (
                        <div className="flex gap-2">
                             <input type="file" ref={prdFileInputRef} className="hidden" onChange={(e) => {
                                 if(e.target.files?.[0]) parseFileToText(e.target.files[0]).then(t => {setContent(t); pushRoomUpdate(roomId, {content:t}, role)})
                             }} />
                             <button onClick={() => prdFileInputRef.current?.click()} className="text-xs flex items-center gap-1 text-gray-600"><FileUp className="w-3 h-3"/> 导入</button>
                        </div>
                     )}
                 </div>
                 <div className="flex-1 relative">
                    <PRDEditor value={content} onChange={handleContentChange} onMount={(e) => editorRef.current = e} onInsertDecision={handleInsertDecision} />
                 </div>
            </div>

            {/* KNOWLEDGE */}
            <div className={`flex-1 p-8 bg-gray-50 overflow-auto ${activeTab !== 'KNOWLEDGE' ? 'hidden' : ''}`}>
                <div className="flex justify-between mb-6">
                    <h2 className="text-xl font-bold">企业知识库 (RAG)</h2>
                    {role === 'OWNER' && !isGlobalReadOnly && (
                        <div>
                             <input type="file" multiple ref={kbFileInputRef} className="hidden" onChange={handleKBUpload}/>
                             <button onClick={() => kbFileInputRef.current?.click()} disabled={isKBUploading} className="bg-white border px-4 py-2 rounded text-sm hover:bg-gray-50">{isKBUploading ? '上传中...' : '上传新文档'}</button>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {kbFiles.map(f => (
                        <div key={f.id} className="bg-white p-4 rounded border flex items-center gap-3">
                            <FileText className="w-8 h-8 text-blue-500 bg-blue-50 p-1.5 rounded"/>
                            <div className="flex-1 truncate"><div className="text-sm font-bold truncate">{f.name}</div><div className="text-xs text-gray-400">{(f.size/1024).toFixed(0)}KB</div></div>
                        </div>
                    ))}
                </div>
            </div>

            {/* IMPACT */}
            <div className={`flex-1 p-6 bg-white overflow-auto flex flex-col ${activeTab !== 'IMPACT' ? 'hidden' : ''}`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">智能影响面图谱</h2>
                    {role === 'OWNER' && !isGlobalReadOnly && (
                        <div className="flex gap-2">
                             <div className="flex border rounded overflow-hidden">
                                 <input placeholder="节点名称" className="px-2 py-1 text-sm outline-none" value={newNodeName} onChange={e=>setNewNodeName(e.target.value)}/>
                                 <button onClick={handleAddManualNode} className="px-2 bg-gray-100 hover:bg-gray-200 border-l"><Plus className="w-4 h-4"/></button>
                             </div>
                             <button onClick={handleGenerateGraph} disabled={isGeneratingGraph} className="bg-aliyun text-white px-3 py-1.5 rounded text-sm flex items-center gap-2">
                                 {isGeneratingGraph ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                                 AI 构建
                             </button>
                        </div>
                    )}
                </div>
                <div className="flex-1 border rounded bg-gray-50 relative">
                     <ImpactGraph data={impactGraph} onDeleteNode={handleDeleteNode}/>
                </div>
            </div>

            {/* RIGHT PANEL */}
            {activeTab === 'EDITOR' && (
                <div className="w-96 bg-gray-50 border-l flex flex-col z-20 shadow-lg">
                    <div className="p-4 border-b bg-white font-bold text-gray-700 flex justify-between">
                        <span>讨论区</span><span className="text-xs font-normal text-gray-400">{comments.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* DECISIONS */}
                        {decisionAnchors.map((raw, idx) => {
                             const question = raw.replace('{{DECISION:', '').replace('}}', '').split('|')[0].trim();
                             // Pass the real-time server data for this specific question
                             return <DecisionWidget key={idx} rawAnchor={raw} serverData={decisions[question]} onVote={handleVote} />;
                        })}
                        <div className="border-t border-dashed my-2"></div>
                        {/* COMMENTS */}
                        {comments.map(c => {
                            const isAI = c.type !== 'HUMAN';
                            const isOwner = role === 'OWNER';
                            const isAuthor = c.author === (username || (isOwner ? '房主' : '匿名用户'));
                            const canDelete = isAI ? false : (isOwner || isAuthor);
                            const canEdit = isAI ? false : isAuthor;
                            
                            return (
                                <div key={c.id} className={`p-3 rounded border text-sm bg-white group ${isAI ? 'border-orange-200' : 'border-blue-200'}`}>
                                    <div className="flex justify-between mb-1 items-start">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-xs">{c.author}</span>
                                            <span className={`text-[10px] px-1 rounded ${isAI ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                                                {c.severity}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                             <span className="text-[10px] text-gray-400">
                                                {c.lastUpdated ? `编辑于 ${formatRelativeTime(c.lastUpdated)}` : formatRelativeTime(c.timestamp)}
                                             </span>
                                             {!isGlobalReadOnly && (
                                                <>
                                                    {canEdit && editingCommentId !== c.id && (
                                                        <button 
                                                            onClick={() => startEditingComment(c)} 
                                                            className="p-1 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="编辑"
                                                        >
                                                            <Pencil className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button 
                                                            onClick={() => handleDeleteComment(c.id)}
                                                            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="删除"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </>
                                             )}
                                        </div>
                                    </div>
                                    
                                    {c.originalText && c.originalText !== 'User Comment' && (
                                        <div className="text-xs text-gray-400 italic mb-2 border-l-2 pl-2 truncate">
                                            "{c.originalText}"
                                        </div>
                                    )}

                                    {editingCommentId === c.id ? (
                                        <div className="flex items-center gap-2 mt-2">
                                            <input 
                                                autoFocus
                                                value={editCommentText}
                                                onChange={(e) => setEditCommentText(e.target.value)}
                                                className="flex-1 border rounded px-2 py-1 text-xs"
                                                onKeyDown={(e) => e.key === 'Enter' && saveEditedComment(c.id)}
                                            />
                                            <button onClick={() => saveEditedComment(c.id)} className="text-green-600 hover:bg-green-50 p-1 rounded"><Check className="w-3 h-3"/></button>
                                            <button onClick={cancelEditComment} className="text-red-600 hover:bg-red-50 p-1 rounded"><X className="w-3 h-3"/></button>
                                        </div>
                                    ) : (
                                        <div className="break-words">{c.comment}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {/* INPUT */}
                    {!isGlobalReadOnly && (role === 'OWNER' || roomSettings.allowGuestComment) && (
                        <div className="p-3 bg-white border-t">
                             {quotedText && <div className="bg-gray-100 p-2 text-xs flex justify-between rounded mb-2 italic">"{quotedText}" <X className="w-3 h-3 cursor-pointer" onClick={()=>setQuotedText('')}/></div>}
                             <div className="flex gap-2">
                                 <button onClick={captureSelection} className={`p-2 rounded border ${quotedText?'bg-blue-50 border-blue-200 text-blue-600':'hover:bg-gray-50'}`}><Quote className="w-4 h-4"/></button>
                                 <input value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleManualComment()} className="flex-1 border rounded px-2 text-sm" placeholder="输入评论..."/>
                                 <button onClick={handleManualComment} className="bg-slate-900 text-white px-3 rounded"><MessageSquarePlus className="w-4 h-4"/></button>
                             </div>
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
