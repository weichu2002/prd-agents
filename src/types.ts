
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

// Updated Decision Interface
export interface DecisionData {
    question: string;
    options: string[];
    votes: { [optionIndex: number]: number }; // Map option index to count
    totalVotes: number;
    aiSummary?: string;
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
    lastUpdated?: number;
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

export type UserRole = 'OWNER' | 'GUEST';
export type ProjectStatus = 'DRAFT' | 'REVIEW' | 'APPROVED';

export interface RoomSettings {
    allowGuestEdit: boolean;
    allowGuestComment: boolean;
    isActive: boolean;
    status: ProjectStatus;
}

export interface KBDocument {
    id: string;
    name: string;
    content: string;
    size: number;
    uploadedAt: number;
}

export interface RoomState {
    roomId: string;
    content: string;
    comments: AIReviewComment[];
    settings: RoomSettings;
    kbFiles: KBDocument[];
    decisions: { [anchorKey: string]: DecisionData }; // New: Store votes by anchor question/key
    impactGraph: ImpactData; // New: Persist the graph
    version: number;
    lastUpdated: number;
}
