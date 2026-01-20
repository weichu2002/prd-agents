
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
    type: 'LOGIC' | 'TECH' | 'RISK' | 'LANGUAGE' | 'HUMAN';
    severity: 'BLOCKER' | 'WARNING' | 'SUGGESTION' | 'INFO';
    position: string;
    originalText: string;
    comment: string;
    question?: string;
    author?: string;
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

// New: Document Status
export type ProjectStatus = 'DRAFT' | 'REVIEW' | 'APPROVED';

export interface RoomSettings {
    allowGuestEdit: boolean;
    allowGuestComment: boolean;
    isActive: boolean;
    status: ProjectStatus; // Added status
}

// New: Real Knowledge Base Document
export interface KBDocument {
    id: string;
    name: string;
    content: string; // Extracted text content
    size: number;
    uploadedAt: number;
}

export interface RoomState {
    roomId: string;
    content: string;
    comments: AIReviewComment[];
    settings: RoomSettings;
    kbFiles: KBDocument[]; // Changed from static list to dynamic objects
    version: number;
    lastUpdated: number;
}
