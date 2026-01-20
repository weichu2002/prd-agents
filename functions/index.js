/**
 * Aliyun ESA Edge Function Entry Point
 * Handles API routing for PRD-Agents with Room Isolation
 */

import { EdgeKV } from '@aliyun/esa-kv'; // Virtual import for ESA environment

// Configuration
const API_KEY = "sk-26d09fa903034902928ae380a56ecfd3"; 
const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

// Helper for CORS
function corsResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Handler for AI Review
async function handleAIReview(request) {
  try {
    const { prdContent } = await request.json();

    const systemPrompt = `你是一位来自顶尖科技公司的首席产品架构师（CPO/CTO）。你的任务是深度审查PRD文档。
    核心审查维度：
    1. 逻辑完备性审查：检查成功指标、验收标准。
    2. 技术一致性审查：对比技术栈规范（假设Go, gRPC, PostgreSQL）。
    3. 风险与遗漏审查：异常流程、安全隐私、性能成本。
    4. 语言与结构审查。
    
    输出格式为严格的JSON数组，每个对象包含：type, severity, position, originalText, comment, question.`;

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

    if (!response.ok) {
        throw new Error(`AI API Error: ${response.statusText}`);
    }

    const result = await response.json();
    let contentStr = result.choices[0].message.content;
    contentStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const comments = JSON.parse(contentStr);

    return corsResponse({ comments });

  } catch (e) {
    return corsResponse({ error: e.message, stack: e.toString() }, 500);
  }
}

// Handler for Voting (Consensus) with Room Support
async function handleVote(request, url) {
    const urlObj = new URL(url);
    const anchorId = urlObj.searchParams.get("anchorId");
    const roomId = urlObj.searchParams.get("roomId") || "default";
    
    try {
        const body = await request.json(); // { vote: 'PRO' | 'CON', reason: string }
        
        let kv;
        try {
            kv = new EdgeKV({ namespace: "prd-kv" });
            // Key structure includes roomId to isolate data
            const key = `room:${roomId}:decision:${anchorId}:votes`;
            
            let currentVotes = [];
            try {
                const existing = await kv.get(key, { type: "json" });
                if (existing) currentVotes = existing;
            } catch(err) { /* ignore if key not found */ }

            currentVotes.push({ ...body, timestamp: Date.now() });
            
            await kv.put(key, JSON.stringify(currentVotes));
        } catch (kvError) {
            console.warn("KV not available, skipping persistence", kvError);
        }

        // Generate simulated dynamic feedback
        return corsResponse({
            success: true,
            heatmap: Math.random(), 
            aiSummary: body.vote === 'PRO' 
                ? "当前房间共识倾向于方案A（端侧），主要基于用户隐私保护和带宽成本考量。" 
                : "当前房间共识倾向于方案B（云端），技术团队担忧端侧算力不足导致卡顿。"
        });

    } catch (e) {
        return corsResponse({ error: e.message }, 500);
    }
}

// Handler for storing/retrieving comments (Simulated backend for persistence)
async function handleComments(request, url) {
    const urlObj = new URL(url);
    const roomId = urlObj.searchParams.get("roomId") || "default";

    try {
        if (request.method === "POST") {
            const { comments } = await request.json();
             // Store comments in KV
             try {
                const kv = new EdgeKV({ namespace: "prd-kv" });
                const key = `room:${roomId}:comments`;
                await kv.put(key, JSON.stringify(comments));
             } catch(e) { console.warn("KV Save failed", e); }
             
             return corsResponse({ success: true });
        } 
        
        // GET
        try {
            const kv = new EdgeKV({ namespace: "prd-kv" });
            const key = `room:${roomId}:comments`;
            const comments = await kv.get(key, { type: "json" });
            return corsResponse({ comments: comments || [] });
        } catch(e) {
            return corsResponse({ comments: [] });
        }
    } catch(e) {
        return corsResponse({ error: e.message }, 500);
    }
}

// Handler for Demo Init
async function handleInit(request) {
    return corsResponse({ message: "Demo project 'Lingjing' initialized successfully on Edge." });
}

// Main Router
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return corsResponse({}, 200);
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/review") {
      return handleAIReview(request);
    }

    if (url.pathname === "/api/vote") {
      return handleVote(request, url.href);
    }

    if (url.pathname === "/api/comments") {
        return handleComments(request, url.href);
    }
    
    if (url.pathname === "/api/init") {
        return handleInit(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
