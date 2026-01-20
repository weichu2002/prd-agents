
/**
 * Aliyun ESA Edge Function Entry Point
 * Handles API routing for PRD-Agents with State Persistence and AI Integration
 */

import { EdgeKV } from '@aliyun/esa-kv';

// Configuration
// Note: In a production environment, use ESA Environment Variables for secrets.
const API_KEY = "sk-26d09fa903034902928ae380a56ecfd3"; 
// Aliyun Bailian (DashScope) Compatible Endpoint for DeepSeek
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
    try {
        // Ensure you have created the 'prd-kv' namespace in ESA Console -> EdgeKV
        const kv = new EdgeKV({ namespace: "prd-kv" });
        const data = await kv.get(`room:${roomId}`, { type: "json" });
        return data;
    } catch (e) { 
        console.error(`KV Read Error (Namespace 'prd-kv'): ${e.message}`);
        // Return null if not found or error, to allow initialization
        return null; 
    }
}

async function saveRoomState(roomId, state) {
    state.lastUpdated = Date.now();
    try {
        const kv = new EdgeKV({ namespace: "prd-kv" });
        // TTL 7 days (604800 seconds)
        await kv.put(`room:${roomId}`, JSON.stringify(state), { expirationTtl: 604800 });
    } catch (e) { 
        console.error(`KV Write Error: ${e.message}`);
        throw new Error(`KV存储写入失败: ${e.message}`);
    }
    return state;
}

// --- AI Helper ---
async function callAI(messages, model = "deepseek-v3") {
    // 60s timeout for AI response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        // Aliyun Bailian expects "model" parameter to match the deployed model name.
        // Assuming "deepseek-v3" is the valid model code on Bailian. 
        // If using qwen, change to "qwen-plus" or "qwen-max".
        const payload = {
            model: model,
            messages: messages,
            temperature: 0.3
        };

        const response = await fetch(DASHSCOPE_URL, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${API_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`AI API Error (${response.status}): ${errText}`);
        }

        const result = await response.json();
        if (!result.choices || result.choices.length === 0) {
             throw new Error("AI Provider returned empty choices.");
        }
        return result.choices[0].message.content;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

// --- Handlers ---

async function handleRoomSync(request, url) {
    const urlObj = new URL(url);
    const roomId = urlObj.searchParams.get("roomId");
    if (!roomId) return corsResponse({ error: "Missing roomId" }, 400);

    try {
        let state = await getRoomState(roomId);
        if (!state) return corsResponse({ exists: false });
        return corsResponse({ exists: true, state });
    } catch (e) {
        return corsResponse({ error: e.message }, 500);
    }
}

async function handleRoomUpdate(request) {
    try {
        const { roomId, updates, userRole } = await request.json();
        let state = await getRoomState(roomId);
        
        // Initialize if new
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
            // Permission Check (skip for Owner)
            if (userRole !== 'OWNER' && !state.settings.allowGuestEdit && updates.content) {
                return corsResponse({ error: "无权编辑文档" }, 403);
            }
        }

        // Apply Updates
        if (updates.content !== undefined) state.content = updates.content;
        if (updates.kbFiles !== undefined) state.kbFiles = updates.kbFiles;
        if (updates.decisions !== undefined) state.decisions = updates.decisions;
        if (updates.impactGraph !== undefined) state.impactGraph = updates.impactGraph;
        if (updates.settings !== undefined && userRole === 'OWNER') state.settings = { ...state.settings, ...updates.settings };

        if (!state.comments) state.comments = [];
        if (updates.newComment) state.comments.push(updates.newComment);
        if (updates.newComments) state.comments.push(...updates.newComments);
        if (updates.comments !== undefined) state.comments = updates.comments;
        
        state.version++;
        await saveRoomState(roomId, state);
        
        return corsResponse({ success: true, version: state.version, state });
    } catch (e) {
        return corsResponse({ error: e.message }, 500);
    }
}

async function handleVote(request) {
    try {
        const body = await request.json();
        const { roomId, anchorKey, optionIndex, question, options } = body;
        
        let state = await getRoomState(roomId);
        if (!state) return corsResponse({ error: "房间不存在，请先创建项目。" }, 404);

        if (!state.decisions) state.decisions = {};
        const safeKey = String(anchorKey).trim();

        if (!state.decisions[safeKey]) {
            state.decisions[safeKey] = {
                question,
                options,
                votes: {},
                totalVotes: 0,
                aiSummary: "等待更多投票..."
            };
        }
        if (!state.decisions[safeKey].votes) state.decisions[safeKey].votes = {};

        const currentVotes = state.decisions[safeKey].votes[optionIndex] || 0;
        state.decisions[safeKey].votes[optionIndex] = currentVotes + 1;
        state.decisions[safeKey].totalVotes = (state.decisions[safeKey].totalVotes || 0) + 1;

        await saveRoomState(roomId, state);
        return corsResponse({ success: true, decision: state.decisions[safeKey] });
    } catch (e) {
        return corsResponse({ error: e.message }, 500);
    }
}

async function handleAIReview(request) {
  try {
    const { prdContent, kbFiles } = await request.json(); 
    let kbContext = "";
    if (kbFiles && kbFiles.length > 0) {
        kbContext = `\n\n【关联知识库文件】：\n` + kbFiles.map(f => `- ${f.name}: ${f.content.substring(0, 500)}...`).join('\n');
    }

    const systemPrompt = `你是一位首席产品架构师。请审查PRD文档。${kbContext}
    必须返回纯JSON数组，格式：[{ "type": "RISK"|"TECH"|"LOGIC", "severity": "BLOCKER"|"WARNING", "position": "位置", "originalText": "原文", "comment": "意见" }]`;

    let contentStr = "";
    
    // Attempt DeepSeek-V3 first
    try {
        contentStr = await callAI([
            { role: "system", content: systemPrompt },
            { role: "user", content: `审查PRD:\n${prdContent.substring(0, 15000)}` } 
        ], "deepseek-v3");
    } catch (e) {
        console.error("DeepSeek-v3 failed, fallback to qwen-plus:", e.message);
        // Fallback to qwen-plus if deepseek model name is different or unavailable
        contentStr = await callAI([
            { role: "system", content: systemPrompt },
            { role: "user", content: `审查PRD:\n${prdContent.substring(0, 15000)}` }
        ], "qwen-plus");
    }

    // Sanitize Markdown code blocks if AI returns them
    contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
        const comments = JSON.parse(contentStr);
        return corsResponse({ comments });
    } catch (parseError) {
        return corsResponse({ 
            comments: [{ 
                type: 'LOGIC', 
                severity: 'INFO', 
                position: '系统', 
                comment: `AI 返回格式解析失败，请重试。原始内容片段: ${contentStr.substring(0, 50)}` 
            }] 
        });
    }

  } catch (e) {
    return corsResponse({ error: `Server Error: ${e.message}` }, 500);
  }
}

async function handleAIImpact(request) {
    try {
        const { prdContent } = await request.json();
        
        const systemPrompt = `生成影响面图谱 JSON。格式：{ "nodes": [{"id":"name", "group":1}], "links": [{"source":"id", "target":"id"}] }`;
        let contentStr = await callAI([
            { role: "system", content: systemPrompt },
            { role: "user", content: prdContent.substring(0, 5000) }
        ], "qwen-plus"); 

        contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
        return corsResponse({ impactGraph: JSON.parse(contentStr) });
    } catch (e) {
        return corsResponse({ error: e.message }, 500);
    }
}

export default {
  async fetch(request) {
    try {
        if (request.method === "OPTIONS") return corsResponse({}, 200);
        const url = new URL(request.url);

        if (url.pathname === "/api/room/sync") return await handleRoomSync(request, url.href);
        if (url.pathname === "/api/room/update") return await handleRoomUpdate(request);
        if (url.pathname === "/api/review") return await handleAIReview(request);
        if (url.pathname === "/api/impact") return await handleAIImpact(request);
        if (url.pathname === "/api/vote") return await handleVote(request);

        return new Response("Not Found", { status: 404 });
    } catch (err) {
        return corsResponse({ error: `Global Error: ${err.message}` }, 500);
    }
  },
};
