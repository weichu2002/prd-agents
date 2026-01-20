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
    type: 'LOGIC' | 'TECH' | 'RISK' | 'LANGUAGE' | 'HUMAN'; // Added HUMAN
    severity: 'BLOCKER' | 'WARNING' | 'SUGGESTION' | 'INFO';
    position: string;
    originalText: string;
    comment: string;
    question?: string;
    author?: string; // New: who wrote it
    timestamp?: number;
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

// New Types for Collaboration
export type UserRole = 'OWNER' | 'GUEST';

export interface RoomSettings {
    allowGuestEdit: boolean;
    allowGuestComment: boolean;
    isActive: boolean;
}

export interface RoomState {
    roomId: string;
    content: string;
    comments: AIReviewComment[];
    settings: RoomSettings;
    version: number;
    lastUpdated: number;
}