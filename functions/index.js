
/**
 * Aliyun ESA Edge Function Entry Point
 * Handles API routing for PRD-Agents with State Persistence and AI Integration
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
    try {
        // 确保您在 ESA 控制台 -> 边缘KV 中创建了名为 "prd-kv" 的命名空间
        const kv = new EdgeKV({ namespace: "prd-kv" });
        const data = await kv.get(`room:${roomId}`, { type: "json" });
        return data;
    } catch (e) { 
        // 抛出具体错误以便前端感知 KV 配置问题
        console.error(`KV Read Error (Namespace 'prd-kv'): ${e.message}`);
        throw new Error(`KV存储读取失败，请检查ESA控制台是否创建了 'prd-kv' 命名空间。详情: ${e.message}`);
    }
}

async function saveRoomState(roomId, state) {
    state.lastUpdated = Date.now();
    try {
        const kv = new EdgeKV({ namespace: "prd-kv" });
        await kv.put(`room:${roomId}`, JSON.stringify(state), { expirationTtl: 86400 });
    } catch (e) { 
        console.error(`KV Write Error: ${e.message}`);
        throw new Error(`KV存储写入失败: ${e.message}`);
    }
    return state;
}

// --- AI Helper ---
async function callAI(messages, model = "deepseek-v3") {
    // 设置较长的超时时间，防止 AI 思考时间过长导致中断
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90秒超时

    try {
        const payload = {
            model: model,
            messages: messages,
            temperature: 0.3
        };

        console.log(`Calling AI Model: ${model}`);
        
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
            console.error(`AI API Error [${model}]: ${response.status} - ${errText}`);
            // 直接抛出上游的错误信息，不要模糊处理
            throw new Error(`Provider Error (${response.status}): ${errText}`);
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
            // Permission Check
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
    let lastError = null;

    // 优先尝试 DeepSeek-V3
    try {
        contentStr = await callAI([
            { role: "system", content: systemPrompt },
            { role: "user", content: `审查PRD:\n${prdContent.substring(0, 15000)}` } // 截断防止超长
        ], "deepseek-v3");
    } catch (e) {
        console.error("DeepSeek-v3 failed:", e.message);
        lastError = e;
        
        // 失败回退到 Qwen-Plus
        try {
            console.log("Fallback to qwen-plus...");
            contentStr = await callAI([
                { role: "system", content: systemPrompt },
                { role: "user", content: `审查PRD:\n${prdContent.substring(0, 15000)}` }
            ], "qwen-plus");
        } catch (finalError) {
             // 构造一个“错误评论”返回给前端，而不是直接 HTTP 500，这样用户能看到原因
             return corsResponse({ 
                 comments: [{ 
                     type: 'RISK', 
                     severity: 'BLOCKER', 
                     position: '系统错误', 
                     comment: `AI 服务调用失败。Primary: ${lastError.message}. Fallback: ${finalError.message}. 请检查 API Key 余额或模型权限。` 
                 }] 
             });
        }
    }

    // 清理 Markdown 代码块格式
    contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
        const comments = JSON.parse(contentStr);
        return corsResponse({ comments });
    } catch (parseError) {
        return corsResponse({ 
            comments: [{ 
                type: 'LANGUAGE', 
                severity: 'INFO', 
                position: 'AI解析警告', 
                comment: `AI 返回了非标准 JSON，原始内容：${contentStr.substring(0, 100)}...` 
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
        ], "qwen-plus"); // 使用 qwen-plus 保证稳定性

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

        // 路由分发
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
