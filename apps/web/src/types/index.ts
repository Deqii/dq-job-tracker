export enum ApplicationStatus {
  WISHLIST = 'WISHLIST',
  APPLIED = 'APPLIED',
  ASSESSMENT = 'ASSESSMENT',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  createdAt: string;
  applicationCount?: number;
}

export interface CompanyInput {
  name: string;
  website?: string | null;
  industry?: string | null;
  notes?: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface StatusHistoryEntry {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  changedAt: string;
}

export interface Application {
  id: string;
  userId: string;
  companyId: string;
  roleTitle: string;
  jobDescription: string;
  postingUrl: string | null;
  location: string | null;
  isRemote: boolean;
  salaryRange: string | null;
  resumeVersion: string | null;
  currentStatus: ApplicationStatus;
  appliedAt: string;
  createdAt: string;
  company?: Company;
  statusHistory?: StatusHistoryEntry[];
  tags?: Tag[];
}

export interface ApplicationInput {
  companyId?: string;
  newCompanyName?: string;
  roleTitle: string;
  jobDescription: string;
  postingUrl?: string | null;
  location?: string | null;
  isRemote: boolean;
  salaryRange?: string | null;
  resumeVersion?: string | null;
  currentStatus: ApplicationStatus;
  appliedAt?: string;
  tags?: string[];
}

export interface ApplicationUpdateInput {
  roleTitle?: string;
  postingUrl?: string | null;
  location?: string | null;
  isRemote?: boolean;
  salaryRange?: string | null;
  resumeVersion?: string | null;
  companyId?: string;
  appliedAt?: string;
  tags?: string[];
}

export interface StatusChangeInput {
  status: ApplicationStatus;
  note?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DashboardCounts {
  [ApplicationStatus.WISHLIST]: number;
  [ApplicationStatus.APPLIED]: number;
  [ApplicationStatus.ASSESSMENT]: number;
  [ApplicationStatus.INTERVIEW]: number;
  [ApplicationStatus.OFFER]: number;
  [ApplicationStatus.REJECTED]: number;
  [ApplicationStatus.WITHDRAWN]: number;
}

export interface DashboardStats {
  counts: DashboardCounts;
  total: number;
  recentActivity: Application[];
}

export interface ApplicationFilters {
  search?: string;
  status?: '' | ApplicationStatus;
  tag?: string;
  from?: string;
  to?: string;
}