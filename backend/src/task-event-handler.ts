import { Logger } from '@ones-op/node-logger'

// 前置处理：工作项变更生效前调用
// 锁定机制已移除——快照机制已保证审计完整性，工作项仅用于跟踪
export async function taskPreAction(request: any): Promise<any> {
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

// 后置处理：工作项变更生效后调用
export async function taskActionDone(request: any): Promise<any> {
  return {
    statusCode: 200,
    body: {
      code: 200,
      body: {},
    },
  }
}
