import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useAiAssertions } from './useAiAssertions'
import {
  AssertionAssetStatus,
  AssertionAssetType,
  createAssertionAsset,
  deleteAssertionAsset,
  fetchAssertionAssetList,
  updateAssertionAsset,
} from '@/api/aiScript'

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/api/aiScript', () => {
  const AssertionAssetStatus = {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  }
  const AssertionAssetType = {
    UI_VISIBLE: 'UI_VISIBLE',
    UI_HIDDEN: 'UI_HIDDEN',
    TEXT_CONTAINS: 'TEXT_CONTAINS',
    URL_CONTAINS: 'URL_CONTAINS',
    TABLE_ROW_EXISTS: 'TABLE_ROW_EXISTS',
    TABLE_CELL_EQUALS: 'TABLE_CELL_EQUALS',
    API_FIELD_EQUALS: 'API_FIELD_EQUALS',
    CUSTOM_CODE: 'CUSTOM_CODE',
  }
  return {
    AssertionAssetStatus,
    AssertionAssetType,
    archiveAssertionAsset: vi.fn(),
    createAssertionAsset: vi.fn(),
    deleteAssertionAsset: vi.fn(),
    fetchAssertionAssetDetail: vi.fn(),
    fetchAssertionAssetList: vi.fn(),
    fetchAssertionAssetReferences: vi.fn(),
    publishAssertionAsset: vi.fn(),
    updateAssertionAsset: vi.fn(),
  }
})

const mockedFetchAssertionAssetList = vi.mocked(fetchAssertionAssetList)
const mockedCreateAssertionAsset = vi.mocked(createAssertionAsset)
const mockedUpdateAssertionAsset = vi.mocked(updateAssertionAsset)
const mockedDeleteAssertionAsset = vi.mocked(deleteAssertionAsset)

function selectProject(projectId = 1) {
  const projectStore = useProjectStore()
  projectStore.selectedProjectId = projectId
  return projectStore
}

describe('useAiAssertions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('未选择项目时不请求断言列表', async () => {
    const assertions = useAiAssertions()

    await assertions.fetchAssertions()

    expect(mockedFetchAssertionAssetList).not.toHaveBeenCalled()
    expect(assertions.assertions.value).toEqual([])
    expect(assertions.errorMessage.value).toBe('请先选择项目')
  })

  it('应按筛选条件加载断言资产', async () => {
    selectProject(9)
    mockedFetchAssertionAssetList.mockResolvedValue({
      total: 1,
      list: [
        {
          id: 5,
          projectId: 9,
          assertionKey: 'title_visible',
          assertionName: '标题可见',
          assertionType: AssertionAssetType.TEXT_CONTAINS,
          status: AssertionAssetStatus.PUBLISHED,
          allowAiReuse: true,
          latestValidationStatus: 'PASSED',
          createdBy: 1,
          createdAt: '2026-06-09T10:00:00Z',
          updatedBy: 1,
          updatedAt: '2026-06-09T10:00:00Z',
        },
      ],
    })

    const assertions = useAiAssertions()
    assertions.filters.keyword = '标题'
    assertions.filters.status = AssertionAssetStatus.PUBLISHED
    assertions.filters.assertionType = AssertionAssetType.TEXT_CONTAINS
    await assertions.fetchAssertions(2)

    expect(mockedFetchAssertionAssetList).toHaveBeenCalledWith({
      projectId: 9,
      keyword: '标题',
      status: AssertionAssetStatus.PUBLISHED,
      assertionType: AssertionAssetType.TEXT_CONTAINS,
      pageNo: 2,
      pageSize: 20,
    })
    expect(assertions.total.value).toBe(1)
    expect(assertions.assertions.value[0]?.assertionKey).toBe('title_visible')
  })

  it('新建断言时应整理 Key 和 JSON 契约', async () => {
    selectProject(6)
    mockedCreateAssertionAsset.mockResolvedValue({} as never)
    mockedFetchAssertionAssetList.mockResolvedValue({ list: [], total: 0 })

    const assertions = useAiAssertions()
    assertions.form.assertionKey = 'Title Visible'
    assertions.form.assertionName = '标题可见'
    assertions.form.assertionType = AssertionAssetType.TEXT_CONTAINS
    assertions.form.paramSchemaText = '{"text":{"type":"string"}}'
    assertions.form.implementationText =
      '{"template":"await expect(page.getByText(text)).toBeVisible()"}'
    assertions.form.evidenceConfigText = '{"screenshot":"ON_FAILURE"}'
    assertions.form.failureMessageTpl = '未找到标题'

    await assertions.submitForm()

    expect(mockedCreateAssertionAsset).toHaveBeenCalledWith({
      projectId: 6,
      assertionKey: 'title_visible',
      assertionName: '标题可见',
      assertionType: AssertionAssetType.TEXT_CONTAINS,
      description: undefined,
      paramSchema: { text: { type: 'string' } },
      implementation: { template: 'await expect(page.getByText(text)).toBeVisible()' },
      failureMessageTpl: '未找到标题',
      evidenceConfig: { screenshot: 'ON_FAILURE' },
      allowAiReuse: true,
    })
  })

  it('编辑断言时不应提交 assertionKey', async () => {
    selectProject(6)
    mockedUpdateAssertionAsset.mockResolvedValue({} as never)
    mockedFetchAssertionAssetList.mockResolvedValue({ list: [], total: 0 })

    const assertions = useAiAssertions()
    assertions.openEditDialog({
      id: 7,
      projectId: 6,
      assertionKey: 'title_visible',
      assertionName: '标题可见',
      assertionType: AssertionAssetType.TEXT_CONTAINS,
      paramSchema: { text: { type: 'string' } },
      implementation: { template: 'expect title' },
      status: AssertionAssetStatus.DRAFT,
      allowAiReuse: true,
      latestValidationStatus: 'NOT_VALIDATED',
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    await assertions.submitForm()

    expect(mockedUpdateAssertionAsset).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ assertionKey: undefined }),
    )
  })

  it('删除草稿断言后应刷新当前列表', async () => {
    selectProject(6)
    mockedDeleteAssertionAsset.mockResolvedValue(undefined)
    mockedFetchAssertionAssetList.mockResolvedValue({ list: [], total: 0 })

    const assertions = useAiAssertions()

    await assertions.deleteDraft({
      id: 7,
      projectId: 6,
      assertionKey: 'title_visible',
      assertionName: '标题可见',
      assertionType: AssertionAssetType.TEXT_CONTAINS,
      status: AssertionAssetStatus.DRAFT,
      allowAiReuse: true,
      latestValidationStatus: 'NOT_VALIDATED',
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    expect(mockedDeleteAssertionAsset).toHaveBeenCalledWith(7, 6)
    expect(mockedFetchAssertionAssetList).toHaveBeenCalledWith({
      projectId: 6,
      keyword: undefined,
      status: '',
      assertionType: '',
      pageNo: 1,
      pageSize: 20,
    })
  })
})
