// ============================================================
// TaskEventHandler — 整改工作项锁定
// 当工作项被决议人确认锁定后，拦截该工作项的属性/状态修改
// ============================================================
import { Logger } from '@ones-op/node-logger'
import { storage } from '@ones-op/sdk/node'

const linkedIssue = storage.entity('dcp_linked_issue')

async function qAll(e: any, filter?: (v: any) => boolean) {
  const allItems: any[] = []
  let cursor: string | null = null
  let safety = 0
  while (safety < 100) {
    safety++
    const q = e.query().limit(200)
    if (cursor) q.cursor(cursor)
    const result = await q.getMany()
    if (!result || !Array.isArray(result.data)) break
    for (const d of result.data) {
      allItems.push({ _key: d.key, ...(d.value || {}) })
    }
    const pi = result.page_info
    if (pi && pi.has_more && pi.end_cursor) {
      cursor = pi.end_cursor
    } else {
      break
    }
  }
  return filter ? allItems.filter((d: any) => filter(d)) : allItems
}

// 前置处理：工作项变更生效前调用
export async function taskPreAction(request: any): Promise<any> {
  try {
    const body = request?.body as any
    const events = body?.task_events || []

    for (const evt of events) {
      const issueID = evt?.task_uuid
      if (!issueID) continue

      // 检查这个工作项是否被评审锁定
      const items = await qAll(linkedIssue,
        (v: any) => v.issue_uuid === issueID && v.locked === 'locked')

      if (items.length > 0) {
        // 拒绝修改
        return {
          statusCode: 200,
          body: {
            code: 200,
            body: {
              is_follow: true,
              is_reject: true,
              reject_reason: '该工作项已被DCP评审确认锁定，不可修改。如需修改请联系评审发起人。',
              task_events: events,
            },
          },
        }
      }
    }

    // 未锁定，正常放行
    return {
      statusCode: 200,
      body: {
        code: 200,
        body: {
          is_follow: false,
          is_reject: false,
          reject_reason: '',
          task_events: events,
        },
      },
    }
  } catch (e: any) {
    Logger.error(`[DCP] taskPreAction error: ${e?.message || e}`)
    // 出错时放行，避免影响正常工作项操作
    return {
      statusCode: 200,
      body: {
        code: 200,
        body: {
          is_follow: false,
          is_reject: false,
          reject_reason: '',
          task_events: request?.body?.task_events || [],
        },
      },
    }
  }
}

// 后置处理：变更生效后调用（当前为空实现）
export async function taskActionDone(request: any): Promise<any> {
  return {
    statusCode: 200,
    body: { code: 200 },
  }
}
