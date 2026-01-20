/**
 * Aliyun ESA Edge Function Entry Point
 * Handles API routing for PRD-Agents with State Persistence
 */

import { EdgeKV } from '@aliyun/esa-kv';

// Configuration
const API_KEY = "sk-26d09fa903034902928ae380a56ecfd3"; 
const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// In-memory fallback (production should rely on KV)
const GLOBAL_ROOM_STORE = new Map();

function corsResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, X-Room-ID, X-User-Role, X-User-Name",
    },
  });
}

// --- Persistence Helpers ---
async function getRoomState(roomId) {
    if (GLOBAL_ROOM_STORE.has(roomId)) return GLOBAL_ROOM_STORE.get(roomId);
    try {
        const kv = new EdgeKV({ namespace: "prd-kv" });
        const data = await kv.get(`room:${roomId}`, { type: "json" });
        if (data) {
            GLOBAL_ROOM_STORE.set(roomId, data);
            return data;
        }
    } catch (e) { console.warn("KV Get Error", e); }
    return null;
}

async function saveRoomState(roomId, state) {
    state.lastUpdated = Date.now();
    GLOBAL_ROOM_STORE.set(roomId, state);
    try {
        const kv = new EdgeKV({ namespace: "prd-kv" });
        await kv.put(`room:${roomId}`, JSON.stringify(state), { expirationTtl: 86400 });
    } catch (e) { console.warn("KV Save Error", e); }
    return state;
}

// --- Handlers ---

async function handleRoomSync(request, url) {
    const urlObj = new URL(url);
    const roomId = urlObj.searchParams.get("roomId");
    if (!roomId) return corsResponse({ error: "No Room ID" }, 400);

    let state = await getRoomState(roomId);
    if (!state) return corsResponse({ exists: false });
    return corsResponse({ exists: true, state });
}

async function handleRoomUpdate(request) {
    const { roomId, updates, userRole } = await request.json();
    let state = await getRoomState(roomId);
    
    if (!state) {
        state = {
            roomId,
            content: updates.content || "",
            comments: [],
            kbFiles: updates.kbFiles || [],
            settings: { allowGuestEdit: false, allowGuestComment: false, isActive: true, status: 'DRAFT' },
            version: 1,
            lastUpdated: Date.now()
        };
    } else {
        // Strict Permission Check
        if (userRole !== 'OWNER' && !state.settings.allowGuestEdit && updates.content) {
            return corsResponse({ error: "Permission Denied: Guest editing is disabled." }, 403);
        }
    }

    if (updates.content !== undefined) state.content = updates.content;
    if (updates.comments !== undefined) state.comments = updates.comments;
    if (updates.kbFiles !== undefined) state.kbFiles = updates.kbFiles; // Sync KB files
    if (updates.settings !== undefined && userRole === 'OWNER') state.settings = { ...state.settings, ...updates.settings };
    
    state.version++;
    await saveRoomState(roomId, state);
    return corsResponse({ success: true, version: state.version });
}

async function handleAIReview(request) {
  try {
    const { prdContent, kbFiles } = await request.json(); 

    // Construct context from REAL uploaded files
    // Limit context size to avoid token overflow (simple truncation strategy)
    const MAX_KB_LENGTH = 10000; 
    let kbContext = "";
    
    if (kbFiles && kbFiles.length > 0) {
        kbContext = `\n\n【已加载的企业知识库】：\n`;
        for (const file of kbFiles) {
            // Take first 2000 chars of each file to save tokens, assuming key info is at top or files are small
            const snippet = file.content ? file.content.substring(0, 2000) : ""; 
            kbContext += `\n--- 文档: ${file.name} ---\n${snippet}\n----------------\n`;
        }
        kbContext += `\n请严格依据上述知识库内容对PRD进行一致性审查。如果PRD内容违背了上述文档中的规范，必须在评论中指出违背了哪个文档的哪条规则。`;
    }

    const systemPrompt = `你是一位来自顶尖科技公司的首席产品架构师。深度审查PRD文档。${kbContext}
    
    核心原则：
    1. 逻辑完备性：检查是否缺失成功指标、异常流程。
    2. 技术一致性：检查是否符合通常的技术架构标准或知识库中的规范。
    3. 风险识别：识别安全、性能、合规风险。
    
    输出格式为严格的JSON数组，不包含Markdown格式标记，每个对象包含：
    {
      "type": "LOGIC" | "TECH" | "RISK" | "LANGUAGE",
      "severity": "BLOCKER" | "WARNING" | "SUGGESTION",
      "position": "章节号或相关文本",
      "originalText": "引用的原文",
      "comment": "具体的修改建议"
    }`;

    const payload = {
      model: "deepseek-v3",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请审查以下PRD片段:\n${prdContent}` }
      ]
    };

    const response = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`AI API Error: ${response.statusText}`);

    const result = await response.json();
    let contentStr = result.choices[0].message.content;
    contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const comments = JSON.parse(contentStr);
    return corsResponse({ comments });

  } catch (e) {
    console.error(e);
    const mockComments = [
        { type: 'RISK', severity: 'WARNING', position: 'Global', originalText: '系统错误', comment: `AI 服务暂时不可用: ${e.message}` }
    ];
    return corsResponse({ comments: mockComments });
  }
}

async function handleRoomClose(request) {
    const { roomId, userRole } = await request.json();
    if (userRole !== 'OWNER') return corsResponse({ error: "Only Owner can close room" }, 403);
    
    let state = await getRoomState(roomId);
    if (state) {
        state.settings.isActive = false;
        await saveRoomState(roomId, state);
    }
    return corsResponse({ success: true });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return corsResponse({}, 200);

    const url = new URL(request.url);

    if (url.pathname === "/api/room/sync") return handleRoomSync(request, url.href);
    if (url.pathname === "/api/room/update") return handleRoomUpdate(request);
    if (url.pathname === "/api/room/close") return handleRoomClose(request);
    if (url.pathname === "/api/review") return handleAIReview(request);
    if (url.pathname === "/api/init") return corsResponse({ message: "ok" });
    if (url.pathname === "/api/vote") return corsResponse({ heatmap: Math.random(), aiSummary: "Mock Vote" });

    return new Response("Not Found", { status: 404 });
  },
};
