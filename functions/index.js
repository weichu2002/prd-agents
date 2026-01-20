
/**
 * Aliyun ESA Edge Function Entry Point
 * Handles API routing for PRD-Agents with State Persistence
 */

import { EdgeKV } from '@aliyun/esa-kv';

// Configuration
const API_KEY = "sk-26d09fa903034902928ae380a56ecfd3"; 
// 使用兼容模式 Endpoint
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
        const kv = new EdgeKV({ namespace: "prd-kv" });
        const data = await kv.get(`room:${roomId}`, { type: "json" });
        return data;
    } catch (e) { 
        console.warn("KV Get Error (Check if 'prd-kv' namespace exists in ESA console):", e); 
        return null;
    }
}

async function saveRoomState(roomId, state) {
    state.lastUpdated = Date.now();
    try {
        const kv = new EdgeKV({ namespace: "prd-kv" });
        // Set TTL to 24 hours
        await kv.put(`room:${roomId}`, JSON.stringify(state), { expirationTtl: 86400 });
    } catch (e) { console.warn("KV Save Error:", e); }
    return state;
}

// --- AI Helper ---
async function callAI(messages, model = "deepseek-v3") {
    try {
        // DeepSeek V3 in DashScope might need specific parameters or fail on high load
        // Increased timeout to 60s for stability
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); 

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
            console.error(`AI API Error (${model}): ${response.status} - ${errText}`);
            throw new Error(`Cloud API Error: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        if (!result.choices || result.choices.length === 0) {
             throw new Error("Empty response from AI provider");
        }
        return result.choices[0].message.content;
    } catch (e) {
        console.warn(`AI Call Failed (${model}):`, e.message);
        throw e;
    }
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
    try {
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
            if (userRole !== 'OWNER' && !state.settings.allowGuestEdit && updates.content) {
                return corsResponse({ error: "Permission Denied: Guest editing is disabled." }, 403);
            }
            if (userRole !== 'OWNER' && !state.settings.allowGuestComment && (updates.comments || updates.newComment || updates.newComments)) {
                return corsResponse({ error: "Permission Denied: Guest commenting is disabled." }, 403);
            }
        }

        // Apply Updates
        if (updates.content !== undefined) state.content = updates.content;
        if (updates.kbFiles !== undefined) state.kbFiles = updates.kbFiles;
        if (updates.decisions !== undefined) state.decisions = updates.decisions;
        if (updates.impactGraph !== undefined) state.impactGraph = updates.impactGraph;
        if (updates.settings !== undefined && userRole === 'OWNER') state.settings = { ...state.settings, ...updates.settings };

        // Comment Handling: Prioritize APPEND over REPLACE for concurrency
        if (!state.comments) state.comments = [];
        
        if (updates.newComment) {
            // Atomic append for a single comment
            state.comments.push(updates.newComment);
        } else if (updates.newComments) {
            // Atomic append for multiple comments (e.g., AI batch)
            state.comments.push(...updates.newComments);
        } else if (updates.comments !== undefined) {
            // Full replace (fallback or deletion/edit)
            state.comments = updates.comments;
        }
        
        state.version++;
        await saveRoomState(roomId, state);
        
        // Return the FULL updated state to the client so they can sync immediately
        return corsResponse({ success: true, version: state.version, state });
    } catch (e) {
        return corsResponse({ error: "Update failed: " + e.message }, 500);
    }
}

async function handleVote(request) {
    try {
        const body = await request.json();
        const { roomId, anchorKey, optionIndex, question, options } = body;
        
        let state = await getRoomState(roomId);
        // If KV is not configured, state might be null.
        if (!state) return corsResponse({ error: "Room not found (Check if KV namespace 'prd-kv' is created in ESA)" }, 404);

        // Robust initialization
        if (!state.decisions) state.decisions = {};
        
        // Trim key to ensure matching
        const safeKey = String(anchorKey).trim();

        if (!state.decisions[safeKey]) {
            state.decisions[safeKey] = {
                question,
                options,
                votes: {},
                totalVotes: 0,
                aiSummary: "等待更多投票以生成共识..."
            };
        }

        // DOUBLE CHECK: Ensure votes object exists before accessing
        if (!state.decisions[safeKey].votes) {
            state.decisions[safeKey].votes = {};
        }

        const currentVotes = state.decisions[safeKey].votes[optionIndex] || 0;
        state.decisions[safeKey].votes[optionIndex] = currentVotes + 1;
        state.decisions[safeKey].totalVotes = (state.decisions[safeKey].totalVotes || 0) + 1;

        await saveRoomState(roomId, state);
        return corsResponse({ success: true, decision: state.decisions[safeKey] });
    } catch (e) {
        console.error("Vote Handler Error:", e);
        return corsResponse({ error: "Vote failed: " + e.message }, 500);
    }
}

async function handleAIReview(request) {
  try {
    const { prdContent, kbFiles } = await request.json(); 
    let kbContext = "";
    
    if (kbFiles && kbFiles.length > 0) {
        kbContext = `\n\n【已加载的企业知识库】：\n`;
        for (const file of kbFiles) {
            // Limit context size to avoid token overflow
            const snippet = file.content ? file.content.substring(0, 1000) : ""; 
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

    let contentStr = "";
    let lastError = null;

    try {
        // Attempt 1: DeepSeek
        contentStr = await callAI([
            { role: "system", content: systemPrompt },
            { role: "user", content: `请审查以下PRD片段:\n${prdContent}` }
        ], "deepseek-v3");
    } catch (e) {
        console.warn("DeepSeek failed, falling back to Qwen-Plus. Error:", e.message);
        lastError = e;
        // Attempt 2: Qwen Plus (Stable Fallback)
        try {
            contentStr = await callAI([
                { role: "system", content: systemPrompt },
                { role: "user", content: `请审查以下PRD片段:\n${prdContent}` }
            ], "qwen-plus");
        } catch (finalError) {
             // Return the actual error to the user for debugging
             const errMsg = finalError.message.includes("401") ? "API Key 无效或过期" : 
                            finalError.message.includes("404") ? "模型名称错误 (DeepSeek/Qwen)" : 
                            finalError.message;
             
             return corsResponse({ 
                 comments: [{ 
                     type: 'RISK', 
                     severity: 'WARNING', 
                     position: '系统错误', 
                     comment: `AI 服务调用失败: ${errMsg} (Primary Error: ${lastError?.message})` 
                 }] 
             });
        }
    }

    // Cleaning formatting
    contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
        const comments = JSON.parse(contentStr);
        return corsResponse({ comments });
    } catch (parseError) {
        // If JSON parsing fails, wrap the raw text
        return corsResponse({ 
            comments: [{ 
                type: 'LANGUAGE', 
                severity: 'INFO', 
                position: 'AI 建议 (格式解析失败)', 
                comment: contentStr 
            }] 
        });
    }

  } catch (e) {
    return corsResponse({ comments: [{ type: 'RISK', severity: 'WARNING', position: 'Global', comment: `Server Error: ${e.message}` }] });
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

        let contentStr = "";
        try {
             contentStr = await callAI([
                { role: "system", content: systemPrompt },
                { role: "user", content: `分析此PRD内容并生成图谱:\n${prdContent}` }
            ], "deepseek-v3");
        } catch (e) {
             contentStr = await callAI([
                { role: "system", content: systemPrompt },
                { role: "user", content: `分析此PRD内容并生成图谱:\n${prdContent}` }
            ], "qwen-plus");
        }

        contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
        return corsResponse({ impactGraph: JSON.parse(contentStr) });
    } catch (e) {
        return corsResponse({ error: "Graph Gen Failed: " + e.message }, 500);
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
    // Top-level error boundary to ensure JSON responses
    try {
        if (request.method === "OPTIONS") return corsResponse({}, 200);

        const url = new URL(request.url);

        if (url.pathname === "/api/room/sync") return await handleRoomSync(request, url.href);
        if (url.pathname === "/api/room/update") return await handleRoomUpdate(request);
        if (url.pathname === "/api/room/close") return await handleRoomClose(request);
        if (url.pathname === "/api/review") return await handleAIReview(request);
        if (url.pathname === "/api/impact") return await handleAIImpact(request);
        if (url.pathname === "/api/vote") return await handleVote(request);

        return new Response("Not Found", { status: 404 });
    } catch (err) {
        console.error("Global Function Error:", err);
        return corsResponse({ error: "Internal Server Error: " + err.message }, 500);
    }
  },
};
