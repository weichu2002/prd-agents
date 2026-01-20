export interface Project {
    id: string;
    name: string;
    description: string;
    role: string;
}

export interface PRDSection {
    id: string;
    title: string;
    content: string;
}

export interface DecisionAnchor {
    id: string;
    question: string;
    startIndex: number;
    endIndex: number;
}

export interface VoteData {
    pros: number;
    cons: number;
    heatmap: number;
    aiSummary: string;
    userVote?: 'PRO' | 'CON';
}

export interface AIReviewComment {
    id: string;
    type: 'LOGIC' | 'TECH' | 'RISK' | 'LANGUAGE';
    severity: 'BLOCKER' | 'WARNING' | 'SUGGESTION';
    position: string;
    originalText: string;
    comment: string;
    question?: string;
}

export interface ImpactNode {
    id: string;
    group: number;
    val?: number;
}

export interface ImpactLink {
    source: string;
    target: string;
}

export interface ImpactData {
    nodes: ImpactNode[];
    links: ImpactLink[];
}