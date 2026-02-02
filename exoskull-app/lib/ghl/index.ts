/**
 * GHL Integration Library
 *
 * Central hub for all GoHighLevel integrations.
 * Exports all modules for easy importing.
 */

// Core client and auth
export {
  GHLClient,
  GHLAPIError,
  GHLRateLimiter,
  ghlRateLimiter,
  GHL_SCOPES,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  type GHLTokens,
  type GHLConnection,
} from './client'

// Messaging
export {
  sendMessage,
  sendSms,
  sendEmail,
  sendWhatsApp,
  sendFacebookMessage,
  sendInstagramDm,
  getConversations,
  getConversation,
  getMessages,
  markMessagesAsRead,
  getUnreadCount,
  uploadMedia,
  getPreferredChannel,
  type MessageType,
  type SendMessageParams,
  type SendMessageResponse,
  type Conversation,
  type Message,
} from './messaging'

// Contacts
export {
  createContact,
  getContact,
  updateContact,
  deleteContact,
  searchContacts,
  getContactByEmail,
  getContactByPhone,
  addContactTags,
  removeContactTag,
  getTags,
  createTag,
  addContactNote,
  getContactNotes,
  addContactTask,
  getContactTasks,
  upsertContact,
  bulkCreateContacts,
  type Contact,
  type CustomFieldValue,
  type ContactTag,
  type CreateContactParams,
  type UpdateContactParams,
} from './contacts'

// Calendar
export {
  getCalendars,
  getCalendar,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  getFreeSlots,
  createAppointment,
  getAppointment,
  updateAppointment,
  deleteAppointment,
  getAppointments,
  bookNextAvailableSlot,
  hasUpcomingAppointment,
  type Calendar,
  type Appointment,
  type CreateAppointmentParams,
  type TimeSlot,
  type FreeSlotQuery,
} from './calendar'

// Social Media
export {
  getSocialAccounts,
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
  getCategories,
  schedulePostOptimal,
  uploadSocialMedia,
  getPostAnalytics,
  crossPost,
  type SocialPlatform,
  type SocialPost,
  type CreatePostParams,
  type SocialAccount,
  type SocialCategory,
} from './social'

// Workflows
export {
  getWorkflows,
  getWorkflow,
  addContactToWorkflow,
  removeContactFromWorkflow,
  getWorkflowByName,
  triggerWorkflowByName,
  triggerExoSkullWorkflow,
  triggerWorkflowForEvent,
  isContactInWorkflow,
  batchTriggerWorkflow,
  EXOSKULL_WORKFLOWS,
  type Workflow,
  type WorkflowExecution,
  type ExoSkullWorkflowKey,
} from './workflows'

// Opportunities / CRM
export {
  getPipelines,
  getPipeline,
  createOpportunity,
  getOpportunity,
  updateOpportunity,
  deleteOpportunity,
  searchOpportunities,
  moveOpportunityToStage,
  updateOpportunityStatus,
  getContactOpportunities,
  getPipelineByName,
  getStageByName,
  moveToOnboardingStage,
  updateRetentionStatus,
  EXOSKULL_PIPELINES,
  ONBOARDING_STAGES,
  RETENTION_STAGES,
  type Pipeline,
  type PipelineStage,
  type Opportunity,
  type CreateOpportunityParams,
} from './opportunities'
