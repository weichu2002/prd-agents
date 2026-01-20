
/**
 * Aliyun ESA Edge Function Entry Point
 * Handles API routing for PRD-Agents with State Persistence
 */

import { EdgeKV } from '@aliyun/esa-kv';

// Configuration
const API_KEY = "sk-26d09fa903034902928ae380a56ecfd3"; 
const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

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
    // CRITICAL FIX: Removed in-memory GLOBAL_ROOM_STORE cache.
    // Edge functions run on different nodes; local cache causes split-brain state.
    // Always read from KV to ensure consistency for new members.
    try {
        const kv = new EdgeKV({ namespace: "prd-kv" });
        const data = await kv.get(`room:${roomId}`, { type: "json" });
        return data;
    } catch (e) { 
        console.warn("KV Get Error", e); 
        return null;
    }
}

async function saveRoomState(roomId, state) {
    state.lastUpdated = Date.now();
    try {
        const kv = new EdgeKV({ namespace: "prd-kv" });
        // Set TTL to 24 hours
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
    
    // Initialize if new (first save)
    if (!state) {
        state = {
            roomId,
            content: updates.content || "",
            comments: [],
            kbFiles: updates.kbFiles || [],
            settings: { allowGuestEdit: false, allowGuestComment: false, isActive: true, status: 'DRAFT' },
            decisions: {},
            impactGraph: { nodes: [], links: [] },
            version: 1,
            lastUpdated: Date.now()
        };
    } else {
        // Strict Permission Check for Content Updates
        if (userRole !== 'OWNER' && !state.settings.allowGuestEdit && updates.content) {
            return corsResponse({ error: "Permission Denied: Guest editing is disabled." }, 403);
        }
        
        // Strict Permission Check for Comment Updates (Prevents guests from modifying comments if disabled)
        // Note: For finer-grained control (user A deleting user B's comment), we rely on frontend logic 
        // combined with this gatekeeper.
        if (userRole !== 'OWNER' && !state.settings.allowGuestComment && updates.comments) {
            return corsResponse({ error: "Permission Denied: Guest commenting is disabled." }, 403);
        }
    }

    // Apply updates
    if (updates.content !== undefined) state.content = updates.content;
    if (updates.comments !== undefined) state.comments = updates.comments;
    if (updates.kbFiles !== undefined) state.kbFiles = updates.kbFiles;
    if (updates.decisions !== undefined) state.decisions = updates.decisions;
    if (updates.impactGraph !== undefined) state.impactGraph = updates.impactGraph;
    if (updates.settings !== undefined && userRole === 'OWNER') state.settings = { ...state.settings, ...updates.settings };
    
    state.version++;
    await saveRoomState(roomId, state);
    return corsResponse({ success: true, version: state.version });
}

async function handleVote(request) {
    const { roomId, anchorKey, optionIndex, question, options } = await request.json();
    let state = await getRoomState(roomId);
    if (!state) return corsResponse({ error: "Room not found" }, 404);

    if (!state.decisions) state.decisions = {};
    
    // Initialize decision entry if not exists
    if (!state.decisions[anchorKey]) {
        state.decisions[anchorKey] = {
            question,
            options,
            votes: {},
            totalVotes: 0,
            aiSummary: "等待更多投票以生成共识..."
        };
    }

    // Increment vote
    const currentVotes = state.decisions[anchorKey].votes[optionIndex] || 0;
    state.decisions[anchorKey].votes[optionIndex] = currentVotes + 1;
    state.decisions[anchorKey].totalVotes = (state.decisions[anchorKey].totalVotes || 0) + 1;

    await saveRoomState(roomId, state);
    return corsResponse({ success: true, decision: state.decisions[anchorKey] });
}

async function handleAIReview(request) {
  try {
    const { prdContent, kbFiles } = await request.json(); 
    let kbContext = "";
    
    if (kbFiles && kbFiles.length > 0) {
        kbContext = `\n\n【已加载的企业知识库】：\n`;
        for (const file of kbFiles) {
            const snippet = file.content ? file.content.substring(0, 2000) : ""; 
            kbContext += `\n--- 文档: ${file.name} ---\n${snippet}\n----------------\n`;
        }
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
      headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`AI API Error: ${response.statusText}`);
    const result = await response.json();
    let contentStr = result.choices[0].message.content;
    contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
    
    return corsResponse({ comments: JSON.parse(contentStr) });

  } catch (e) {
    console.error(e);
    return corsResponse({ comments: [{ type: 'RISK', severity: 'WARNING', position: 'Global', comment: `AI 服务错误: ${e.message}` }] });
  }
}

async function handleAIImpact(request) {
    try {
        const { prdContent } = await request.json();
        
        const systemPrompt = `你是一个资深系统架构师。请分析产品需求文档(PRD)，构建一个“功能-系统模块”的影响面依赖图谱。
        
        返回格式必须是严格的JSON对象，不包含Markdown标记，结构如下：
        {
          "nodes": [
            { "id": "功能或模块名", "group": 1(功能)或2(服务)或3(数据库), "val": 权重(5-20) }
          ],
          "links": [
            { "source": "节点ID", "target": "节点ID" }
          ]
        }
        请提取至少5-8个关键节点和对应的依赖关系。`;

        const payload = {
            model: "deepseek-v3",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `分析此PRD内容并生成图谱:\n${prdContent}` }
            ]
        };

        const response = await fetch(DASHSCOPE_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        let contentStr = result.choices[0].message.content;
        contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
        
        return corsResponse({ impactGraph: JSON.parse(contentStr) });
    } catch (e) {
        return corsResponse({ error: e.message }, 500);
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
    if (url.pathname === "/api/impact") return handleAIImpact(request);
    if (url.pathname === "/api/vote") return handleVote(request);

    return new Response("Not Found", { status: 404 });
  },
};
