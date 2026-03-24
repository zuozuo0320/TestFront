export type LoginResp = {
  access_token: string
  user_id: number
  user: {
    id: number
    name: string
    email: string
    role: string
  }
}

export type Project = {
  id: number
  name: string
  description: string
  avatar?: string
  status: 'active' | 'archived'
  archived_at?: string | null
  created_at?: string
  updated_at?: string
  member_count: number
  testcase_count: number
}

export type ProjectMember = {
  id: number
  project_id: number
  user_id: number
  role: 'owner' | 'member'
  created_at?: string
  updated_at?: string
  user: User
}

export type TestCase = {
  id: number
  project_id: number
  title: string
  level: string
  review_result: string
  exec_result: string
  module_id: number
  module_path: string
  tags: string
  precondition: string
  steps: string
  remark: string
  priority: string
  created_by: number
  created_by_name?: string
  updated_by: number
  updated_by_name?: string
  created_at?: string
  updated_at?: string
}

export type TestCaseListResp = {
  items: TestCase[]
  total: number
  page: number
  pageSize: number
}

export type Role = {
  id: number
  name: string
  display_name?: string
  description?: string
  user_count?: number
}

export type User = {
  id: number
  name: string
  email: string
  phone?: string
  avatar?: string
  role: string
  role_names?: string[]
  active: boolean
  last_login_at?: string | null
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
}

// Module (directory tree node)
export type Module = {
  id: number
  project_id: number
  parent_id: number
  name: string
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type ModuleTreeNode = {
  id: number
  parent_id: number
  name: string
  sort_order: number
  case_count: number
  children: ModuleTreeNode[]
}

// Attachment
export type CaseAttachment = {
  id: number
  testcase_id: number
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_by: number
  created_at?: string
}

// History
export type CaseHistory = {
  id: number
  testcase_id: number
  action: string
  field_name: string
  old_value: string
  new_value: string
  changed_by: number
  created_at?: string
}

export type CaseHistoryListResp = {
  items: CaseHistory[]
  total: number
  page: number
  page_size: number
}

// Relation
export type CaseRelation = {
  id: number
  source_case_id: number
  target_case_id: number
  relation_type: string
  created_by: number
  created_at?: string
}
