import React from 'react';
import { Bot, Users, Zap, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

interface Props {
    onCreate: () => void;
    onJoin: (id: string) => void;
}

export const LandingPage: React.FC<Props> = ({ onCreate, onJoin }) => {
    const [joinId, setJoinId] = React.useState('');

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-900">
            {/* Nav */}
            <nav className="px-6 h-16 bg-white border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-aliyun rounded-lg flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-bold text-xl tracking-tight text-slate-900">PRD-Agents</span>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium text-gray-600">
                    <a href="#" className="hover:text-aliyun">解决方案</a>
                    <a href="#" className="hover:text-aliyun">企业版</a>
                    <a href="#" className="hover:text-aliyun">文档</a>
                </div>
            </nav>

            {/* Hero */}
            <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50 via-white to-white">
                <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200">
                    <Zap className="w-3 h-3" /> 阿里云 ESA 边缘计算驱动
                </div>
                <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 mb-6 leading-tight">
                    从静态文档到 <span className="text-aliyun">动态决策引擎</span>
                </h1>
                <p className="text-xl text-gray-500 max-w-2xl mb-10">
                    PRD-Agents 是下一代产品协作平台。集成 DeepSeek AI 评审、实时团队共识投票与边缘实时同步，让产品决策有据可依。
                </p>

                <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                    <button 
                        onClick={onCreate}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-xl hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl font-bold text-lg group"
                    >
                        <Sparkles className="w-5 h-5 text-yellow-400 group-hover:animate-pulse" />
                        创建新项目
                    </button>
                    <div className="flex-1 flex gap-2">
                         <input 
                            type="text" 
                            placeholder="输入房间号..."
                            value={joinId}
                            onChange={(e) => setJoinId(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:border-aliyun focus:ring-2 focus:ring-aliyun/20 bg-white"
                         />
                         <button 
                            onClick={() => joinId && onJoin(joinId)}
                            className="bg-white border border-gray-300 text-gray-700 px-4 rounded-xl hover:bg-gray-50 transition-colors"
                         >
                            <ArrowRight className="w-5 h-5" />
                         </button>
                    </div>
                </div>

                {/* Features */}
                <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 text-left max-w-5xl">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                            <Bot className="w-6 h-6 text-blue-600" />
                        </div>
                        <h3 className="font-bold text-lg mb-2">AI 评审副驾</h3>
                        <p className="text-gray-500 text-sm">内置 DeepSeek 大模型，结合企业知识库（RAG），自动审查 PRD 逻辑漏洞与技术风险。</p>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                         <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-4">
                            <Users className="w-6 h-6 text-green-600" />
                        </div>
                        <h3 className="font-bold text-lg mb-2">团队决策共识</h3>
                        <p className="text-gray-500 text-sm">识别文档中的决策锚点，一键发起团队投票，生成共识热力图，避免无效扯皮。</p>
                    </div>
                     <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                         <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4">
                            <ShieldCheck className="w-6 h-6 text-purple-600" />
                        </div>
                        <h3 className="font-bold text-lg mb-2">边缘安全协作</h3>
                        <p className="text-gray-500 text-sm">基于阿里云 ESA 边缘节点部署，数据就近存储，毫秒级同步，支持精细化权限管理。</p>
                    </div>
                </div>
            </main>
            
            <footer className="py-8 text-center text-sm text-gray-400 border-t border-gray-200">
                © 2024 PRD-Agents Demo. Powered by Aliyun ESA & DeepSeek.
            </footer>
        </div>
    );
};