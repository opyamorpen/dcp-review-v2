import assert from 'node:assert/strict'
import fs from 'node:fs'
import yaml from 'js-yaml'

const backend = fs.readFileSync('backend/src/index.ts', 'utf8')
const plugin = yaml.load(fs.readFileSync('config/plugin.yaml', 'utf8'))
const projectPage = fs.readFileSync('web/src/modules/dcp-review-tab/index.tsx', 'utf8')
const workspace = fs.readFileSync('web/src/modules/dcp-reviewer-workspace/index.tsx', 'utf8')

const transitionHandler = backend.slice(
  backend.indexOf('export async function transitionReview'),
  backend.indexOf('export async function getReviewState'),
)
assert.match(transitionHandler, /target_state !== 're_reviewing' \|\| currentState !== 'remediation_pending'/)
assert.match(transitionHandler, /STATE_TRANSITION_NOT_ALLOWED/)

const createHandler = backend.slice(
  backend.indexOf('export async function createReview'),
  backend.indexOf('export async function recreateReview'),
)
assert.match(createHandler, /findPhaseReviewConflict/)
assert.match(createHandler, /REVIEW_PHASE_ALREADY_ACTIVE/)
assert.match(createHandler, /claimPhaseGuard/)

const attachmentHandler = backend.slice(
  backend.indexOf('async function findAuthorizedAttachment'),
  backend.indexOf('export async function updateMaterialStatus'),
)
assert.match(attachmentHandler, /if \(!attachment\).*ATTACHMENT_NOT_FOUND/s)
assert.ok(attachmentHandler.indexOf('findAuthorizedAttachment(rid, objKey)') < attachmentHandler.indexOf('object\.download\(objKey\)'))

const remediationHandler = backend.slice(
  backend.indexOf('type IssueCompletionState'),
  backend.indexOf('// ============================================================\n// Reviewer Profile'),
)
assert.match(remediationHandler, /issue_status_verification/)
assert.match(remediationHandler, /客户端状态只能作为观察值/)
assert.equal(remediationHandler.includes('isIssueStatusDone'), false)
assert.equal(projectPage.includes('is_done: isDone'), false)
assert.equal(workspace.includes('is_done: isDone'), false)

const entities = plugin.storage.entities
const issueEntity = entities.find(entity => entity.name === 'dcp_linked_issue')
assert.ok(issueEntity.attributes.issue_status_verification)
assert.ok(issueEntity.attributes.issue_status_category)
assert.ok(entities.some(entity => entity.name === 'dcp_phase_guard'))

console.log('Review guardrails verified: state transitions, remediation authority, attachment ownership, and phase uniqueness.')
